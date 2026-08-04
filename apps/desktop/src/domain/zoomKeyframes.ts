import { z } from "zod";
import type { CursorEvent } from "./cursorTrack";
import type { Size } from "./showcase";

/* -------------------------------------------------------------------------- */
/* Model                                                                       */
/* -------------------------------------------------------------------------- */

export const zoomKeyframeSchema = z.object({
  time: z.number(),
  scale: z.number(),
  /** Focal point as a fraction of the source frame. */
  cx: z.number(),
  cy: z.number(),
  /** Auto keyframes are replaced wholesale when clicks are re-analysed. */
  source: z.enum(["auto", "manual"]),
});

export type ZoomKeyframe = z.infer<typeof zoomKeyframeSchema>;

export type ClickCluster = {
  readonly start: number;
  readonly end: number;
  readonly cx: number;
  readonly cy: number;
  readonly count: number;
};

export type ZoomOptions = {
  readonly scale: number;
  /** How long before the first click the zoom starts moving. */
  readonly leadSeconds: number;
  /** How long after the last click the zoom holds before pulling out. */
  readonly holdSeconds: number;
  /** Gap below which two clusters stay zoomed and pan between each other. */
  readonly bridgeSeconds: number;
  readonly transitionSeconds: number;
};

export const defaultZoomOptions: ZoomOptions = {
  scale: 1.8,
  // A zoom that begins on the click always reads as late, because the viewer's
  // attention has already moved. Starting early is what makes it feel intentional.
  leadSeconds: 0.35,
  holdSeconds: 0.9,
  bridgeSeconds: 1.5,
  transitionSeconds: 0.45,
};

/* -------------------------------------------------------------------------- */
/* Clustering                                                                  */
/* -------------------------------------------------------------------------- */

export type ClusterOptions = {
  readonly windowMs?: number;
  readonly radiusPx?: number;
};

/**
 * Groups clicks that belong to the same action.
 *
 * A double-click, or a click followed by a nearby second click, is one moment
 * of interest. Treating each press as its own zoom produces a camera that
 * lurches on every click.
 */
export function clusterClicks(
  events: readonly CursorEvent[],
  options: ClusterOptions = {},
): readonly ClickCluster[] {
  const windowSeconds = (options.windowMs ?? 1200) / 1000;
  const radius = options.radiusPx ?? 160;
  const presses = events.filter((event) => event.kind === "down");
  if (presses.length === 0) return [];

  const clusters: ClickCluster[] = [];
  let start = presses[0]?.time ?? 0;
  let end = start;
  let sumX = presses[0]?.x ?? 0;
  let sumY = presses[0]?.y ?? 0;
  let count = 1;

  for (let index = 1; index < presses.length; index += 1) {
    const event = presses[index];
    if (event === undefined) continue;
    const cx = sumX / count;
    const cy = sumY / count;
    const near = Math.hypot(event.x - cx, event.y - cy) <= radius;
    const soon = event.time - end <= windowSeconds;
    if (near && soon) {
      end = event.time;
      sumX += event.x;
      sumY += event.y;
      count += 1;
      continue;
    }
    clusters.push({ start, end, cx: sumX / count, cy: sumY / count, count });
    start = event.time;
    end = event.time;
    sumX = event.x;
    sumY = event.y;
    count = 1;
  }
  clusters.push({ start, end, cx: sumX / count, cy: sumY / count, count });
  return clusters;
}

/* -------------------------------------------------------------------------- */
/* Keyframe generation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Keeps the zoomed viewport inside the source.
 *
 * Without this the camera happily centres on a corner click and shows black
 * past the edge of the frame.
 */
export function clampFocus(cx: number, cy: number, scale: number): { cx: number; cy: number } {
  if (scale <= 1) return { cx: 0.5, cy: 0.5 };
  const half = 1 / (2 * scale);
  return {
    cx: Math.min(Math.max(cx, half), 1 - half),
    cy: Math.min(Math.max(cy, half), 1 - half),
  };
}

/**
 * Builds a zoom track from click clusters.
 *
 * Consecutive clusters close together hold the zoom and pan between their
 * centres rather than pulling out and back in, which is the single most
 * amateur-looking artefact an automatic zoom can produce.
 */
export function generateZoomKeyframes(
  clusters: readonly ClickCluster[],
  source: Size,
  options: ZoomOptions = defaultZoomOptions,
): readonly ZoomKeyframe[] {
  if (clusters.length === 0 || source.width <= 0 || source.height <= 0) return [];
  const keyframes: ZoomKeyframe[] = [];
  const at = (time: number, scale: number, cx: number, cy: number): ZoomKeyframe => ({
    time: Math.max(0, time),
    scale,
    ...clampFocus(cx, cy, scale),
    source: "auto",
  });

  let index = 0;
  while (index < clusters.length) {
    const first = clusters[index];
    if (first === undefined) break;

    // Absorb every following cluster that starts before the zoom would finish
    // pulling out, so the camera glides between them instead of popping.
    const bridged = [first];
    let last = first;
    let next = clusters[index + 1];
    while (next !== undefined && next.start - last.end <= options.bridgeSeconds) {
      bridged.push(next);
      last = next;
      index += 1;
      next = clusters[index + 1];
    }

    const firstFocus = { cx: first.cx / source.width, cy: first.cy / source.height };
    keyframes.push(at(first.start - options.leadSeconds - options.transitionSeconds, 1, firstFocus.cx, firstFocus.cy));
    keyframes.push(at(first.start - options.leadSeconds, options.scale, firstFocus.cx, firstFocus.cy));

    for (const cluster of bridged.slice(1)) {
      keyframes.push(at(cluster.start, options.scale, cluster.cx / source.width, cluster.cy / source.height));
    }

    const focus = { cx: last.cx / source.width, cy: last.cy / source.height };
    keyframes.push(at(last.end + options.holdSeconds, options.scale, focus.cx, focus.cy));
    keyframes.push(at(last.end + options.holdSeconds + options.transitionSeconds, 1, focus.cx, focus.cy));
    index += 1;
  }

  return keyframes.sort((a, b) => a.time - b.time);
}

/** Manual keyframes win; automatic ones fill the gaps between them. */
export function mergeKeyframes(
  auto: readonly ZoomKeyframe[],
  manual: readonly ZoomKeyframe[],
  toleranceSeconds = 0.4,
): readonly ZoomKeyframe[] {
  if (manual.length === 0) return auto;
  const kept = auto.filter(
    (frame) => !manual.some((override) => Math.abs(override.time - frame.time) <= toleranceSeconds),
  );
  return [...kept, ...manual].sort((a, b) => a.time - b.time);
}

const easeInOut = (progress: number): number =>
  progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

/** Zoom and focal point at `time`, eased between the surrounding keyframes. */
export function zoomAt(
  keyframes: readonly ZoomKeyframe[],
  time: number,
): { readonly scale: number; readonly cx: number; readonly cy: number } {
  const neutral = { scale: 1, cx: 0.5, cy: 0.5 };
  if (keyframes.length === 0) return neutral;

  const first = keyframes.at(0);
  const last = keyframes.at(-1);
  if (first === undefined || last === undefined) return neutral;
  if (time <= first.time) return { scale: first.scale, cx: first.cx, cy: first.cy };
  if (time >= last.time) return { scale: last.scale, cx: last.cx, cy: last.cy };

  let low = 0;
  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const candidate = keyframes[index];
    if (candidate !== undefined && candidate.time <= time) low = index;
  }
  const a = keyframes[low];
  const b = keyframes[low + 1];
  if (a === undefined || b === undefined) return neutral;

  const span = b.time - a.time;
  const progress = span <= 0 ? 1 : easeInOut((time - a.time) / span);
  return {
    scale: a.scale + (b.scale - a.scale) * progress,
    cx: a.cx + (b.cx - a.cx) * progress,
    cy: a.cy + (b.cy - a.cy) * progress,
  };
}
