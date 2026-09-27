import { useEffect, useRef } from "react";
import { formatDuration, type RecordingArtifacts } from "../../domain/recording";
import { cursorAt, toPoints, type CursorTrack } from "../../domain/cursorTrack";
import { loadCursorTrack, recordingSrc } from "../../lib/recordingTauri";
import { drawPointerGlyph } from "../../lib/videoCompositor";

/** Letterboxed content rect of a video inside its element box. */
export function contentRect(
  boxWidth: number,
  boxHeight: number,
  videoWidth: number,
  videoHeight: number,
): { x: number; y: number; width: number; height: number } {
  if (videoWidth <= 0 || videoHeight <= 0) return { x: 0, y: 0, width: boxWidth, height: boxHeight };
  const scale = Math.min(boxWidth / videoWidth, boxHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
}

function drawCursor(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  track: CursorTrack,
  item: RecordingArtifacts,
): void {
  const dpr = window.devicePixelRatio || 1;
  const boxWidth = video.clientWidth;
  const boxHeight = video.clientHeight;
  canvas.width = Math.max(1, Math.round(boxWidth * dpr));
  canvas.height = Math.max(1, Math.round(boxHeight * dpr));
  const context = canvas.getContext("2d");
  if (context === null || boxWidth <= 0 || boxHeight <= 0) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, boxWidth, boxHeight);
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  if (videoWidth <= 0 || videoHeight <= 0) return;
  const content = contentRect(boxWidth, boxHeight, videoWidth, videoHeight);
  const point = cursorAt(toPoints(track), video.currentTime);
  if (point === null) return;
  drawPointerGlyph(
    context,
    content.x + (point.x / item.width) * content.width,
    content.y + (point.y / item.height) * content.height,
    18,
    "#ffffff",
  );
}

/**
 * A recording with its cursor track overlaid while it plays.
 *
 * The MP4 stays cursor-free by design; the track loads lazily on the first
 * play and is drawn on a transparent canvas over the letterboxed video.
 * Without a track the plain video plays with no overlay and no error.
 */
export function RecordingPreview({ item }: { item: RecordingArtifacts }): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackRef = useRef<CursorTrack | null>(null);
  const trackLoadingRef = useRef<Promise<CursorTrack | null> | null>(null);
  const loopRef = useRef<number | null>(null);

  useEffect(() => {
    trackRef.current = null;
    trackLoadingRef.current = null;
    return (): void => {
      if (loopRef.current !== null) {
        window.cancelAnimationFrame(loopRef.current);
        loopRef.current = null;
      }
    };
  }, [item.id]);

  function drawOnce(): void {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const track = trackRef.current;
    if (video === null || canvas === null || track === null) return;
    drawCursor(video, canvas, track, item);
  }

  function stopLoop(): void {
    if (loopRef.current !== null) {
      window.cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
  }

  function startLoop(): void {
    stopLoop();
    function frame(): void {
      drawOnce();
      loopRef.current = window.requestAnimationFrame(frame);
    }
    loopRef.current = window.requestAnimationFrame(frame);
  }

  async function handlePlay(): Promise<void> {
    if (item.cursorPath === null) return;
    if (trackRef.current === null && trackLoadingRef.current === null && videoRef.current !== null) {
      trackLoadingRef.current = loadCursorTrack(item.cursorPath);
      trackRef.current = await trackLoadingRef.current;
    } else if (trackLoadingRef.current !== null) {
      trackRef.current = await trackLoadingRef.current;
    }
    startLoop();
  }

  return (
    <div className="relative aspect-video w-full bg-black">
      <video
        aria-label={`Recording ${formatDuration(item.durationSeconds)}`}
        className="aspect-video w-full bg-black object-contain"
        controls
        preload="metadata"
        ref={videoRef}
        src={recordingSrc(item.videoPath)}
        onEnded={stopLoop}
        onPause={() => {
          stopLoop();
          drawOnce();
        }}
        onPlay={() => void handlePlay()}
        onSeeked={drawOnce}
      />
      <canvas
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        ref={canvasRef}
      />
    </div>
  );
}
