import type { Size } from "../domain/showcase";

export type SizeTarget = "original" | "under-25mb" | "under-10mb";

export const SIZE_TARGETS: readonly { readonly id: SizeTarget; readonly label: string }[] = [
  { id: "original", label: "Original quality" },
  { id: "under-25mb", label: "Under 25 MB" },
  { id: "under-10mb", label: "Under 10 MB" },
];

const MEGABYTE = 1024 * 1024;

/** Byte budgets use binary megabytes, which is how Discord, Slack, and mail clients count. */
export function targetBytesFor(target: SizeTarget): number | null {
  if (target === "under-25mb") return 25 * MEGABYTE;
  if (target === "under-10mb") return 10 * MEGABYTE;
  return null;
}

/** Container overhead, keyframe spikes, and encoder overshoot. */
const SAFETY_MARGIN = 0.94;
/** Below this, H.264 screen content smears into blocks; trade resolution for clarity. */
const MIN_BITS_PER_PIXEL = 0.04;
const MIN_WIDTH = 640;
const MAX_TARGET_FPS = 30;
const MIN_BITRATE = 150_000;

export type EncodePlan = {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly bitrate: number;
};

/** The quality-first bitrate used when no size target is set. */
export function bitrateFor(width: number, height: number): number {
  const pixels = width * height;
  if (pixels <= 1280 * 720) return 6_000_000;
  if (pixels <= 1920 * 1080) return 10_000_000;
  if (pixels <= 2560 * 1440) return 18_000_000;
  return 30_000_000;
}

function even(value: number): number {
  return Math.max(2, Math.round(value) & ~1);
}

/**
 * Chooses output size, frame rate, and bitrate for an MP4 export.
 *
 * Without a budget the stage is encoded as-is. With one, the bitrate is the
 * budget spread over the duration; if that starves each pixel, the frame rate
 * drops to 30 and then the frame shrinks (never below 640 px wide) until each
 * pixel gets enough bits to stay legible.
 */
export function planEncode(stage: Size, fps: number, durationSeconds: number, targetBytes: number | null): EncodePlan {
  const width = even(stage.width);
  const height = even(stage.height);
  const quality = bitrateFor(width, height);
  if (targetBytes === null) return { width, height, fps, bitrate: quality };

  const seconds = Math.max(0.5, durationSeconds);
  const budget = Math.max(MIN_BITRATE, Math.floor((targetBytes * 8 * SAFETY_MARGIN) / seconds));
  if (budget >= quality) return { width, height, fps, bitrate: quality };

  const bitsPerPixel = (frameRate: number, w: number, h: number): number => budget / (w * h * frameRate);
  if (bitsPerPixel(fps, width, height) >= MIN_BITS_PER_PIXEL) return { width, height, fps, bitrate: budget };

  const cappedFps = Math.min(fps, MAX_TARGET_FPS);
  if (bitsPerPixel(cappedFps, width, height) >= MIN_BITS_PER_PIXEL) {
    return { width, height, fps: cappedFps, bitrate: budget };
  }
  const idealScale = Math.sqrt(budget / (MIN_BITS_PER_PIXEL * cappedFps * width * height));
  const minimumScale = Math.min(1, MIN_WIDTH / width);
  const scale = Math.max(minimumScale, Math.min(1, idealScale));
  return { width: even(width * scale), height: even(height * scale), fps: cappedFps, bitrate: budget };
}

/** A lower bitrate for one retry after a file overshoots its budget. */
export function retryBitrate(plan: EncodePlan, actualBytes: number, targetBytes: number): number {
  return Math.max(MIN_BITRATE, Math.floor(plan.bitrate * (targetBytes / actualBytes) * 0.95));
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / MEGABYTE).toFixed(1)} MB`;
}

export function parseSizeTarget(value: string): SizeTarget {
  return SIZE_TARGETS.find((option) => option.id === value)?.id ?? "original";
}

/** The status line after an export, including whether a size budget was met. */
export function exportSummary(output: Size, bytes: number, targetBytes: number | null): string {
  const base = `Exported ${String(output.width)} × ${String(output.height)} · ${formatMegabytes(bytes)}`;
  if (targetBytes === null || bytes <= targetBytes) return base;
  return `${base} · over the ${formatMegabytes(targetBytes).replace(".0", "")} target; trim the clip to fit`;
}
