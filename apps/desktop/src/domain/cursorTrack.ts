import { z } from "zod";
import { rectSchema } from "./capture";

/* -------------------------------------------------------------------------- */
/* Decoding                                                                    */
/* -------------------------------------------------------------------------- */

export const cursorEventSchema = z.object({
  time: z.number(),
  kind: z.enum(["down", "up"]),
  button: z.enum(["left", "right", "middle"]),
  x: z.number(),
  y: z.number(),
});

export type CursorEvent = z.infer<typeof cursorEventSchema>;

export const cursorShapeSpanSchema = z.object({
  time: z.number(),
  shape: z.string(),
});

export type CursorShapeSpan = z.infer<typeof cursorShapeSpanSchema>;

/**
 * Positions arrive as parallel arrays rather than an array of points.
 *
 * A ten-minute recording is roughly 150k samples: as objects that is ~5 MB of
 * JSON and ~150 ms to parse, versus ~2 MB and ~30 ms this way.
 */
export const cursorTrackSchema = z.object({
  version: z.literal(1),
  times: z.array(z.number()),
  xs: z.array(z.number()),
  ys: z.array(z.number()),
  events: z.array(cursorEventSchema),
  shapes: z.array(cursorShapeSpanSchema),
  /** The recorded area: the whole display, or the crop origin for Window and Region. */
  displayBounds: rectSchema,
  scaleFactor: z.number(),
});

export type CursorTrack = z.infer<typeof cursorTrackSchema>;

/** A single sampled position, which is what the smoothing pipeline works on. */
export type CursorPoint = { readonly t: number; readonly x: number; readonly y: number };

export function decodeCursorTrack(raw: unknown): CursorTrack {
  return cursorTrackSchema.parse(raw);
}

/** Zips the parallel arrays into points, stopping at the shortest of the three. */
export function toPoints(track: CursorTrack): readonly CursorPoint[] {
  const count = Math.min(track.times.length, track.xs.length, track.ys.length);
  const points: CursorPoint[] = [];
  for (let index = 0; index < count; index += 1) {
    points.push({ t: track.times[index] ?? 0, x: track.xs[index] ?? 0, y: track.ys[index] ?? 0 });
  }
  return points;
}

/* -------------------------------------------------------------------------- */
/* Smoothing                                                                   */
/* -------------------------------------------------------------------------- */

/** Distance in pixels beyond which a step is treated as a jump, not motion. */
export const defaultTeleportPx = 250;

/**
 * Splits the path wherever the pointer jumped rather than moved.
 *
 * Alt-Tab, a window snapping, or any `SetCursorPos` warp produces a
 * discontinuity. Splining across one draws a long curved sweep the pointer
 * never actually took, which is far more noticeable than the jump itself.
 */
export function splitOnTeleports(
  points: readonly CursorPoint[],
  maxStepPx = defaultTeleportPx,
): readonly (readonly CursorPoint[])[] {
  if (points.length === 0) return [];
  const segments: CursorPoint[][] = [];
  let current: CursorPoint[] = [];
  let previous: CursorPoint | null = null;

  for (const point of points) {
    if (previous !== null) {
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      if (Math.hypot(dx, dy) > maxStepPx) {
        if (current.length > 0) segments.push(current);
        current = [];
      }
    }
    current.push(point);
    previous = point;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

/**
 * Ramer–Douglas–Peucker, which decimates the sampling noise floor into the
 * waypoints the pointer actually aimed at.
 */
export function simplifyPath(points: readonly CursorPoint[], tolerancePx = 2): readonly CursorPoint[] {
  if (points.length <= 2) return points;
  const first = points.at(0);
  const last = points.at(-1);
  if (first === undefined || last === undefined) return points;

  let maxDistance = 0;
  let maxIndex = 0;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const span = Math.hypot(dx, dy);

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    if (point === undefined) continue;
    const distance =
      span === 0
        ? Math.hypot(point.x - first.x, point.y - first.y)
        : Math.abs(dy * point.x - dx * point.y + last.x * first.y - last.y * first.x) / span;
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = index;
    }
  }

  if (maxDistance <= tolerancePx) return [first, last];
  const left = simplifyPath(points.slice(0, maxIndex + 1), tolerancePx);
  const right = simplifyPath(points.slice(maxIndex), tolerancePx);
  return [...left.slice(0, -1), ...right];
}

/**
 * Zero-phase exponential smoothing: one forward pass, one backward pass.
 *
 * A single causal pass always lags behind the real position, which reads as the
 * cursor drifting after the content it is pointing at. Running the same filter
 * backwards cancels that lag exactly. Only legitimate because editing happens
 * offline, with the whole path already known.
 */
export function smoothExponential(points: readonly CursorPoint[], alpha = 0.35): readonly CursorPoint[] {
  if (points.length < 3 || alpha <= 0) return points;
  const factor = Math.min(Math.max(alpha, 0.01), 1);

  const forward: CursorPoint[] = [];
  let x = points[0]?.x ?? 0;
  let y = points[0]?.y ?? 0;
  for (const point of points) {
    x += (point.x - x) * factor;
    y += (point.y - y) * factor;
    forward.push({ t: point.t, x, y });
  }

  const backward: CursorPoint[] = new Array<CursorPoint>(forward.length);
  const seed = forward.at(-1);
  x = seed?.x ?? 0;
  y = seed?.y ?? 0;
  for (let index = forward.length - 1; index >= 0; index -= 1) {
    const point = forward[index];
    if (point === undefined) continue;
    x += (point.x - x) * factor;
    y += (point.y - y) * factor;
    backward[index] = { t: point.t, x, y };
  }
  return backward;
}

/**
 * Resamples to a fixed rate along a centripetal Catmull-Rom spline.
 *
 * The `alpha = 0.5` parameterisation is the whole trick: uniform Catmull-Rom
 * (`alpha = 0`) provably self-intersects and cusps on tight turns, which is
 * exactly where a pointer changes direction. Centripetal provably does not.
 */
export function catmullRomResample(
  points: readonly CursorPoint[],
  fps: number,
  alpha = 0.5,
): readonly CursorPoint[] {
  if (points.length < 2 || fps <= 0) return points;
  const start = points.at(0);
  const end = points.at(-1);
  if (start === undefined || end === undefined) return points;

  const step = 1 / fps;
  const out: CursorPoint[] = [];
  const at = (index: number): CursorPoint =>
    points[Math.min(Math.max(index, 0), points.length - 1)] ?? start;

  const knot = (previous: number, a: CursorPoint, b: CursorPoint): number =>
    previous + Math.pow(Math.hypot(b.x - a.x, b.y - a.y), alpha) || previous + 1e-5;

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = at(index - 1);
    const p1 = at(index);
    const p2 = at(index + 1);
    const p3 = at(index + 2);

    const t0 = 0;
    const t1 = knot(t0, p0, p1);
    const t2 = knot(t1, p1, p2);
    const t3 = knot(t2, p2, p3);

    for (let time = p1.t; time < p2.t; time += step) {
      const span = p2.t - p1.t;
      const progress = span <= 0 ? 0 : (time - p1.t) / span;
      const t = t1 + (t2 - t1) * progress;

      const lerp = (a: CursorPoint, b: CursorPoint, ta: number, tb: number): CursorPoint => {
        const width = tb - ta;
        const ratio = width === 0 ? 0 : (t - ta) / width;
        return { t: time, x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
      };

      const a1 = lerp(p0, p1, t0, t1);
      const a2 = lerp(p1, p2, t1, t2);
      const a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, t0, t2);
      const b2 = lerp(a2, a3, t1, t3);
      out.push(lerp(b1, b2, t1, t2));
    }
  }
  out.push({ t: end.t, x: end.x, y: end.y });
  return out;
}

export type SmoothingOptions = {
  readonly fps: number;
  readonly tolerancePx?: number;
  readonly alpha?: number;
  readonly maxStepPx?: number;
};

/**
 * The full pipeline, in the order the stages have to run.
 *
 * Splitting first matters: simplifying or splining across a teleport bakes the
 * bogus sweep in before it can be removed.
 */
export function smoothCursorPath(
  points: readonly CursorPoint[],
  options: SmoothingOptions,
): readonly CursorPoint[] {
  const segments = splitOnTeleports(points, options.maxStepPx);
  const out: CursorPoint[] = [];
  for (const segment of segments) {
    const simplified = simplifyPath(segment, options.tolerancePx ?? 2);
    const resampled = catmullRomResample(simplified, options.fps);
    out.push(...smoothExponential(resampled, options.alpha ?? 0.35));
  }
  return out;
}

/** Position at `time`, interpolated between the two surrounding samples. */
export function cursorAt(points: readonly CursorPoint[], time: number): CursorPoint | null {
  if (points.length === 0) return null;
  const first = points.at(0);
  const last = points.at(-1);
  if (first === undefined || last === undefined) return null;
  if (time <= first.t) return first;
  if (time >= last.t) return last;

  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    const candidate = points[middle];
    if (candidate === undefined) break;
    if (candidate.t <= time) low = middle;
    else high = middle;
  }

  const a = points[low];
  const b = points[high];
  if (a === undefined || b === undefined) return first;
  const span = b.t - a.t;
  const ratio = span <= 0 ? 0 : (time - a.t) / span;
  return { t: time, x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
}

/** The cursor shape in effect at `time`. */
export function shapeAt(spans: readonly CursorShapeSpan[], time: number): string {
  let shape = "default";
  for (const span of spans) {
    if (span.time > time) break;
    shape = span.shape;
  }
  return shape;
}
