import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import type { CursorTrack } from "../domain/cursorTrack";
import { cursorAt, smoothCursorPath, toPoints } from "../domain/cursorTrack";
import type { Size } from "../domain/showcase";
import { trimmedDuration, type VideoScene, type VideoSources } from "../domain/videoScene";
import { clusterClicks, generateZoomKeyframes, mergeKeyframes, type ZoomKeyframe } from "../domain/zoomKeyframes";
import { clickPulseAt, paintFrame } from "./videoCompositor";

export type ExportFormat = "mp4" | "gif";

export type ExportRequest = {
  readonly video: HTMLVideoElement;
  readonly camera: HTMLVideoElement | null;
  readonly background: CanvasImageSource | null;
  readonly scene: VideoScene;
  readonly track: CursorTrack | null;
  readonly stage: Size;
  readonly fps: number;
  readonly format: ExportFormat;
  readonly onProgress?: (fraction: number) => void;
  readonly signal?: AbortSignal;
};

/** Zoom keyframes for a composition, auto-generated then overridden by manual ones. */
export function keyframesFor(scene: VideoScene, track: CursorTrack | null, media: Size): readonly ZoomKeyframe[] {
  if (!scene.zoom.enabled) return scene.zoom.manual;
  const events = track?.events ?? [];
  const clusters = clusterClicks(events);
  const auto = generateZoomKeyframes(clusters, media, {
    scale: scene.zoom.scale,
    leadSeconds: scene.zoom.leadSeconds,
    holdSeconds: scene.zoom.holdSeconds,
    bridgeSeconds: scene.zoom.bridgeSeconds,
    transitionSeconds: scene.zoom.transitionSeconds,
  });
  return mergeKeyframes(auto, scene.zoom.manual);
}

/** The smoothed pointer path, ready to sample per frame. */
export function smoothedCursor(
  track: CursorTrack | null,
  scene: VideoScene,
  fps: number,
): readonly { t: number; x: number; y: number }[] {
  if (track === null || !scene.cursor.show) return [];
  return smoothCursorPath(toPoints(track), {
    fps,
    alpha: Math.max(0.05, 1 - scene.cursor.smoothing / 100),
  });
}

/** True when this build can encode video in the WebView. */
export async function canEncodeVideo(): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false;
  try {
    const support = await VideoEncoder.isConfigSupported({
      codec: "avc1.640028",
      width: 1280,
      height: 720,
      bitrate: 8_000_000,
    });
    return support.supported === true;
  } catch {
    return false;
  }
}

/** Seeks a video element and waits for the frame to actually be ready. */
function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done, { once: true });
    video.currentTime = time;
  });
}

/** Seeks the main video and, when present, the camera to the same time. */
export async function seekAll(
  request: Pick<ExportRequest, "video" | "camera">,
  time: number,
): Promise<void> {
  await seek(request.video, time);
  if (request.camera !== null) await seek(request.camera, time);
}

/**
 * Renders and encodes the trimmed composition.
 *
 * Frames are produced by seeking the source video rather than played in real
 * time, so a long export is bounded by encode speed instead of the recording's
 * own duration, and no frame can be skipped because the machine was busy.
 */
export async function exportVideo(request: ExportRequest): Promise<Blob> {
  const { video, scene, stage, fps } = request;
  const duration = trimmedDuration(scene.trim);
  const frames = Math.max(1, Math.round(duration * fps));

  const width = Math.max(2, Math.round(stage.width) & ~1);
  const height = Math.max(2, Math.round(stage.height) & ~1);

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { alpha: false });
  if (context === null) throw new Error("This build cannot compose video frames");

  const mediaSize: Size = { width: video.videoWidth, height: video.videoHeight };
  const keyframes = keyframesFor(scene, request.track, mediaSize);
  const cursorPath = smoothedCursor(request.track, scene, fps);
  const events = request.track?.events ?? [];

  if (request.format === "gif") {
    return exportGif({ ...request, width, height, frames, duration, canvas, context, mediaSize, keyframes, cursorPath, events });
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height, frameRate: fps },
    fastStart: "in-memory",
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta): void => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (error: DOMException): void => {
      throw error;
    },
  });
  encoder.configure({
    codec: "avc1.640028",
    width,
    height,
    bitrate: bitrateFor(width, height),
    framerate: fps,
    hardwareAcceleration: "prefer-hardware",
  });

  for (let index = 0; index < frames; index += 1) {
    if (request.signal?.aborted === true) {
      encoder.close();
      throw new DOMException("Export cancelled", "AbortError");
    }
    const time = index / fps;
    await seekAll(request, scene.trim.start + time);
    drawOne(context, scene, request, { width, height }, mediaSize, keyframes, cursorPath, events, time);

    const frame = new VideoFrame(canvas, { timestamp: Math.round(time * 1e6), duration: Math.round(1e6 / fps) });
    // A keyframe every two seconds keeps seeking responsive in players.
    encoder.encode(frame, { keyFrame: index % (fps * 2) === 0 });
    frame.close();

    // The queue is drained periodically so memory stays flat on long exports.
    if (encoder.encodeQueueSize > 20) await new Promise((resolve) => setTimeout(resolve, 0));
    request.onProgress?.((index + 1) / frames);
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();
  return new Blob([target.buffer], { type: "video/mp4" });
}

type GifContext = ExportRequest & {
  width: number;
  height: number;
  frames: number;
  duration: number;
  canvas: OffscreenCanvas;
  context: OffscreenCanvasRenderingContext2D;
  mediaSize: Size;
  keyframes: readonly ZoomKeyframe[];
  cursorPath: readonly { t: number; x: number; y: number }[];
  events: readonly { time: number; kind: string }[];
};

/**
 * Writes an animated GIF.
 *
 * GIF is capped at 256 colours and 12 fps here on purpose: a screen recording
 * exported at full rate produces a file far too large to share, which is the
 * only reason anyone asks for a GIF.
 */
async function exportGif(gif: GifContext): Promise<Blob> {
  const gifFps = Math.min(12, gif.fps);
  const total = Math.max(1, Math.round(gif.duration * gifFps));
  const scale = Math.min(1, 640 / gif.width);
  const width = Math.max(2, Math.round(gif.width * scale));
  const height = Math.max(2, Math.round(gif.height * scale));

  const out = new OffscreenCanvas(width, height);
  const outContext = out.getContext("2d", { alpha: false });
  if (outContext === null) throw new Error("This build cannot compose GIF frames");

  const encoder = new GifEncoder(width, height);
  for (let index = 0; index < total; index += 1) {
    if (gif.signal?.aborted === true) throw new DOMException("Export cancelled", "AbortError");
    const time = index / gifFps;
    await seekAll(gif, gif.scene.trim.start + time);
    drawOne(gif.context, gif.scene, gif, { width: gif.width, height: gif.height }, gif.mediaSize, gif.keyframes, gif.cursorPath, gif.events, time);
    outContext.drawImage(gif.canvas, 0, 0, width, height);
    encoder.addFrame(outContext.getImageData(0, 0, width, height), Math.round(100 / gifFps));
    gif.onProgress?.((index + 1) / total);
  }
  return encoder.finish();
}

function drawOne(
  context: OffscreenCanvasRenderingContext2D,
  scene: VideoScene,
  request: Pick<ExportRequest, "video" | "camera" | "background">,
  stage: Size,
  mediaSize: Size,
  keyframes: readonly ZoomKeyframe[],
  cursorPath: readonly { t: number; x: number; y: number }[],
  events: readonly { time: number; kind: string }[],
  time: number,
): void {
  const absolute = scene.trim.start + time;
  const sources: VideoSources = {
    media: request.video,
    mediaSize,
    background: request.background,
    camera: request.camera,
    cursor: cursorPath.length === 0 ? null : cursorAt(cursorPath, absolute),
    clickPulse: clickPulseAt(events, absolute),
  };
  paintFrame(context, scene, sources, stage, keyframes, absolute);
}

function bitrateFor(width: number, height: number): number {
  const pixels = width * height;
  if (pixels <= 1280 * 720) return 6_000_000;
  if (pixels <= 1920 * 1080) return 10_000_000;
  if (pixels <= 2560 * 1440) return 18_000_000;
  return 30_000_000;
}

/* -------------------------------------------------------------------------- */
/* GIF writing                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A minimal GIF89a writer with LZW compression.
 *
 * Written rather than pulled in: the encoder is about 120 lines and the
 * alternatives are an order of magnitude larger than the whole recorder.
 */
export class GifEncoder {
  private readonly parts: Uint8Array[] = [];
  private wroteHeader = false;

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {}

  addFrame(image: ImageData, delayCentiseconds: number): void {
    const { palette, indices } = quantize(image, this.width, this.height);

    if (!this.wroteHeader) {
      this.parts.push(header(this.width, this.height));
      this.parts.push(applicationExtension());
      this.wroteHeader = true;
    }
    this.parts.push(graphicControl(delayCentiseconds));
    this.parts.push(imageDescriptor(this.width, this.height, palette));
    this.parts.push(lzwCompress(indices, 8));
  }

  finish(): Blob {
    this.parts.push(new Uint8Array([0x3b]));
    return new Blob(this.parts as BlobPart[], { type: "image/gif" });
  }
}

/** Median-cut is overkill for screen content; a fixed 6·7·6 cube reads clean. */
function quantize(image: ImageData, width: number, height: number): { palette: Uint8Array; indices: Uint8Array } {
  const palette = new Uint8Array(256 * 3);
  let entry = 0;
  for (let r = 0; r < 6; r += 1) {
    for (let g = 0; g < 7; g += 1) {
      for (let b = 0; b < 6; b += 1) {
        palette[entry * 3] = Math.round((r * 255) / 5);
        palette[entry * 3 + 1] = Math.round((g * 255) / 6);
        palette[entry * 3 + 2] = Math.round((b * 255) / 5);
        entry += 1;
      }
    }
  }
  // Remaining slots become a grey ramp, which matters for UI screenshots.
  for (let index = entry; index < 256; index += 1) {
    const value = Math.round(((index - entry) * 255) / Math.max(1, 255 - entry));
    palette[index * 3] = value;
    palette[index * 3 + 1] = value;
    palette[index * 3 + 2] = value;
  }

  const data = image.data;
  const indices = new Uint8Array(width * height);
  for (let pixel = 0; pixel < indices.length; pixel += 1) {
    const offset = pixel * 4;
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const ri = Math.round((r / 255) * 5);
    const gi = Math.round((g / 255) * 6);
    const bi = Math.round((b / 255) * 5);
    indices[pixel] = ri * 42 + gi * 6 + bi;
  }
  return { palette, indices };
}

function header(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(13);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
  bytes[6] = width & 0xff;
  bytes[7] = (width >> 8) & 0xff;
  bytes[8] = height & 0xff;
  bytes[9] = (height >> 8) & 0xff;
  bytes[10] = 0x00;
  bytes[11] = 0x00;
  bytes[12] = 0x00;
  return bytes;
}

/** NETSCAPE2.0 loop block, without which the animation plays once. */
function applicationExtension(): Uint8Array {
  return new Uint8Array([
    0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, 0x03, 0x01, 0x00, 0x00, 0x00,
  ]);
}

function graphicControl(delay: number): Uint8Array {
  return new Uint8Array([0x21, 0xf9, 0x04, 0x04, delay & 0xff, (delay >> 8) & 0xff, 0x00, 0x00]);
}

function imageDescriptor(width: number, height: number, palette: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(10 + palette.length);
  bytes[0] = 0x2c;
  bytes[5] = width & 0xff;
  bytes[6] = (width >> 8) & 0xff;
  bytes[7] = height & 0xff;
  bytes[8] = (height >> 8) & 0xff;
  // Local colour table, 256 entries.
  bytes[9] = 0x87;
  bytes.set(palette, 10);
  return bytes;
}

function lzwCompress(indices: Uint8Array, minimumCodeSize: number): Uint8Array {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minimumCodeSize + 1;
  let next = endCode + 1;
  let dictionary = new Map<string, number>();

  const out: number[] = [minimumCodeSize];
  const block: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;

  const flushBlock = (): void => {
    while (block.length > 0) {
      const chunk = block.splice(0, 255);
      out.push(chunk.length, ...chunk);
    }
  };
  const write = (code: number): void => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      block.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
      if (block.length >= 255) {
        out.push(255, ...block.splice(0, 255));
      }
    }
  };

  write(clearCode);
  let previous = String(indices[0] ?? 0);
  for (let index = 1; index < indices.length; index += 1) {
    const key = `${previous},${String(indices[index] ?? 0)}`;
    const existing = dictionary.get(key);
    if (existing !== undefined) {
      previous = key;
      continue;
    }
    write(codeFor(previous, dictionary, clearCode));
    dictionary.set(key, next);
    next += 1;
    if (next > (1 << codeSize) && codeSize < 12) codeSize += 1;
    if (next >= 4096) {
      write(clearCode);
      dictionary = new Map<string, number>();
      next = endCode + 1;
      codeSize = minimumCodeSize + 1;
    }
    previous = String(indices[index] ?? 0);
  }
  write(codeFor(previous, dictionary, clearCode));
  write(endCode);
  if (bitCount > 0) block.push(bitBuffer & 0xff);
  flushBlock();
  out.push(0);
  return new Uint8Array(out);
}

function codeFor(sequence: string, dictionary: Map<string, number>, clearCode: number): number {
  const known = dictionary.get(sequence);
  if (known !== undefined) return known;
  const single = Number(sequence.split(",").at(-1) ?? 0);
  return Number.isFinite(single) ? single : clearCode;
}

/** Hands a rendered blob to the shell's download flow. */
export function downloadExport(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
