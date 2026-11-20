import rough from "roughjs";
import type { Drawable } from "roughjs/bin/core";
import type { Point, Rect } from "./capture";

/** Line styles a shape or line can be drawn with. Absent means solid. */
export type StrokeStyle = "solid" | "dashed" | "dotted" | "sketchy";

export const STROKE_STYLES: readonly StrokeStyle[] = ["solid", "dashed", "dotted", "sketchy"];

/** How hand-drawn the sketchy line style looks. Absent means "loose". */
export type SketchLevel = "neat" | "loose" | "wild";

export const SKETCH_LEVELS: readonly SketchLevel[] = ["neat", "loose", "wild"];

export const DEFAULT_SKETCH_LEVEL: SketchLevel = "loose";

/** Rough.js settings per sketch level; the one place these constants live. */
export const SKETCH_LEVEL_OPTIONS: Record<
  SketchLevel,
  { roughness: number; bowing: number; disableMultiStroke: boolean }
> = {
  neat: { roughness: 0.5, bowing: 0.5, disableMultiStroke: true },
  loose: { roughness: 1.2, bowing: 1, disableMultiStroke: false },
  wild: { roughness: 2.4, bowing: 2, disableMultiStroke: false },
};

/**
 * Everything a renderer needs to draw a styled shape without knowing about the
 * style: polylines to stroke, dots to stamp (diameter = stroke width) and an
 * optional polygon to fill. The canvas, the Rust export and the Screen Draw SVG
 * all consume this one structure so they cannot drift apart.
 */
export type StrokeGeometry = {
  strokes: Point[][];
  dots: Point[];
  fill?: Point[];
};

export type ShapeGeometryInput = {
  kind: "rectangle" | "ellipse";
  bounds: Rect;
  cornerRadius?: number | undefined;
  strokeWidth: number;
  strokeStyle?: StrokeStyle | undefined;
  sketchLevel?: SketchLevel | undefined;
  seed?: number | undefined;
};

export type LineGeometryInput = {
  kind: "line" | "arrow" | "curved-arrow";
  points: readonly Point[];
  strokeWidth: number;
  strokeStyle?: StrokeStyle | undefined;
  sketchLevel?: SketchLevel | undefined;
  seed?: number | undefined;
};

export type StrokeGeometryInput = ShapeGeometryInput | LineGeometryInput;

/** Per-annotation point budget. Beyond it the geometry fails closed to a solid outline. */
export const MAX_GEOMETRY_POINTS = 20_000;

const BEZIER_STEPS = 8;
const CORNER_STEPS = 8;
const generator = rough.generator();

/** Largest corner radius a rectangle of this size can show. */
export function clampCornerRadius(radius: number | undefined, width: number, height: number): number {
  if (radius === undefined || !Number.isFinite(radius)) return 0;
  return Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2));
}

export function dashLength(strokeWidth: number): number {
  return Math.max(6, 3 * strokeWidth);
}
export function dashGap(strokeWidth: number): number {
  return Math.max(4, 2 * strokeWidth);
}
export function dotSpacing(strokeWidth: number): number {
  return Math.max(6, 2.2 * strokeWidth);
}

/** A fresh non-zero seed (0 would make Rough.js pick a random one every render). */
export function newSketchSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return ((values[0] ?? 1) % 2_147_483_646) + 1;
}

const cache = new WeakMap<object, StrokeGeometry>();

/** Pure, memoised per annotation object (scenes are immutable, so edits produce new keys). */
export function shapeStrokeGeometry(input: StrokeGeometryInput): StrokeGeometry {
  const cached = cache.get(input);
  if (cached !== undefined) return cached;
  const built = capGeometry(buildGeometry(input), input);
  cache.set(input, built);
  return built;
}

/** True when the annotation needs the geometry path instead of the plain Konva/Rust primitive. */
export function needsStrokeGeometry(input: StrokeGeometryInput): boolean {
  if (input.strokeStyle !== undefined && input.strokeStyle !== "solid") return true;
  return input.kind === "rectangle" && (input.cornerRadius ?? 0) > 0;
}

function buildGeometry(input: StrokeGeometryInput): StrokeGeometry {
  const { outline, closed, head } = outlineOf(input);
  const style = input.strokeStyle ?? "solid";
  const fill = closed ? outline : undefined;
  const headStrokes = head;

  switch (style) {
    case "solid":
      return withFill({ strokes: [outline, ...headStrokes], dots: [] }, fill);
    case "dashed":
      return withFill(
        { strokes: [...dashPolyline(outline, input.strokeWidth), ...headStrokes], dots: [] },
        fill,
      );
    case "dotted":
      return withFill(
        { strokes: [...headStrokes], dots: dotPolyline(outline, input.strokeWidth) },
        fill,
      );
    case "sketchy":
      return withFill(sketchGeometry(input, outline, closed), fill);
  }
}

function withFill(geometry: StrokeGeometry, fill: Point[] | undefined): StrokeGeometry {
  return fill === undefined ? geometry : { ...geometry, fill };
}

/** Clean outline of the shape (and arrow head wings), before any style is applied. */
function outlineOf(input: StrokeGeometryInput): { outline: Point[]; closed: boolean; head: Point[][] } {
  if ("bounds" in input) {
    if (input.kind === "ellipse") {
      return { outline: ellipseOutline(input.bounds), closed: true, head: [] };
    }
    const { x, y, width, height } = input.bounds;
    const radius = clampCornerRadius(input.cornerRadius, width, height);
    return { outline: roundedRectOutline(x, y, width, height, radius), closed: true, head: [] };
  }
  const points = input.points.map((point) => ({ x: point.x, y: point.y }));
  const head = input.kind === "line" ? [] : arrowHead(points, input.strokeWidth);
  return { outline: points, closed: false, head };
}

function roundedRectOutline(x: number, y: number, w: number, h: number, r: number): Point[] {
  if (r <= 0) {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
      { x, y },
    ];
  }
  const points: Point[] = [];
  const corner = (cx: number, cy: number, from: number): void => {
    for (let step = 0; step <= CORNER_STEPS; step += 1) {
      const angle = from + (step / CORNER_STEPS) * (Math.PI / 2);
      points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  const first = points[0];
  if (first !== undefined) points.push({ ...first });
  return points;
}

function ellipseOutline(bounds: Rect): Point[] {
  const rx = Math.abs(bounds.width) / 2;
  const ry = Math.abs(bounds.height) / 2;
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const segments = Math.min(256, Math.max(48, Math.ceil(perimeter / 4)));
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const points: Point[] = [];
  for (let step = 0; step <= segments; step += 1) {
    const angle = (step / segments) * Math.PI * 2;
    points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
  }
  return points;
}

/** Two wings back from the tip, matching the Rust renderer's arrow head. */
function arrowHead(points: readonly Point[], strokeWidth: number): Point[][] {
  const tip = points[points.length - 1];
  const before = points[points.length - 2];
  if (tip === undefined || before === undefined) return [];
  const angle = Math.atan2(tip.y - before.y, tip.x - before.x);
  const length = Math.max(strokeWidth, 2) * 4;
  return [angle + 2.55, angle - 2.55].map((wing) => [
    { x: tip.x, y: tip.y },
    { x: tip.x + Math.cos(wing) * length, y: tip.y + Math.sin(wing) * length },
  ]);
}

/** Splits a polyline into dash segments by arc length. */
function dashPolyline(points: readonly Point[], strokeWidth: number): Point[][] {
  const dash = dashLength(strokeWidth);
  const gap = dashGap(strokeWidth);
  const dashes: Point[][] = [];
  let current: Point[] = [];
  let drawing = true;
  let remaining = dash;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    const segment = Math.hypot(to.x - from.x, to.y - from.y);
    if (segment === 0) continue;
    let travelled = 0;
    if (drawing && current.length === 0) current.push({ x: from.x, y: from.y });
    while (segment - travelled > remaining) {
      travelled += remaining;
      const point = lerp(from, to, travelled / segment);
      if (drawing) {
        current.push(point);
        dashes.push(current);
        current = [];
      } else {
        current = [point];
      }
      drawing = !drawing;
      remaining = drawing ? dash : gap;
    }
    remaining -= segment - travelled;
    if (drawing) current.push({ x: to.x, y: to.y });
  }
  if (drawing && current.length >= 2) dashes.push(current);
  return dashes;
}

/** Evenly spaced dot centres along a polyline, starting at its first point. */
function dotPolyline(points: readonly Point[], strokeWidth: number): Point[] {
  const spacing = dotSpacing(strokeWidth);
  const dots: Point[] = [];
  const first = points[0];
  if (first === undefined) return dots;
  dots.push({ x: first.x, y: first.y });
  let untilNext = spacing;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    const segment = Math.hypot(to.x - from.x, to.y - from.y);
    let travelled = 0;
    while (segment - travelled >= untilNext && segment > 0) {
      travelled += untilNext;
      dots.push(lerp(from, to, travelled / segment));
      untilNext = spacing;
    }
    untilNext -= segment - travelled;
  }
  return dots;
}

function lerp(from: Point, to: Point, amount: number): Point {
  return { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount };
}

function sketchGeometry(input: StrokeGeometryInput, outline: Point[], closed: boolean): StrokeGeometry {
  const options = {
    ...SKETCH_LEVEL_OPTIONS[input.sketchLevel ?? DEFAULT_SKETCH_LEVEL],
    seed: input.seed ?? 1,
    strokeWidth: input.strokeWidth,
  };
  let drawable: Drawable;
  if ("bounds" in input && input.kind === "rectangle") {
    const { x, y, width, height } = input.bounds;
    const radius = clampCornerRadius(input.cornerRadius, width, height);
    drawable =
      radius > 0
        ? generator.path(roundedRectPath(x, y, width, height, radius), options)
        : generator.rectangle(x, y, width, height, options);
  } else if ("bounds" in input) {
    const { x, y, width, height } = input.bounds;
    drawable = generator.ellipse(x + width / 2, y + height / 2, Math.abs(width), Math.abs(height), options);
  } else {
    drawable = generator.linearPath(
      outline.map((point): [number, number] => [point.x, point.y]),
      options,
    );
  }
  const strokes = drawableToPolylines(drawable);
  if (!closed) {
    for (const wing of arrowHead(outline, input.strokeWidth)) {
      const wingDrawable = generator.linearPath(
        wing.map((point): [number, number] => [point.x, point.y]),
        { ...options, seed: (options.seed % 2_147_483_000) + 1 },
      );
      strokes.push(...drawableToPolylines(wingDrawable));
    }
  }
  return { strokes, dots: [] };
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const commands: (string | number)[][] = [
    ["M", x + r, y],
    ["L", x + w - r, y],
    ["Q", x + w, y, x + w, y + r],
    ["L", x + w, y + h - r],
    ["Q", x + w, y + h, x + w - r, y + h],
    ["L", x + r, y + h],
    ["Q", x, y + h, x, y + h - r],
    ["L", x, y + r],
    ["Q", x, y, x + r, y],
    ["Z"],
  ];
  return commands.map((command) => command.join(" ")).join(" ");
}

/** Flattens Rough.js drawing ops (moves, lines, cubic curves) into polylines. */
function drawableToPolylines(drawable: Drawable): Point[][] {
  const polylines: Point[][] = [];
  for (const set of drawable.sets) {
    if (set.type !== "path") continue;
    let current: Point[] = [];
    for (const operation of set.ops) {
      const data = operation.data;
      if (operation.op === "move") {
        if (current.length >= 2) polylines.push(current);
        current = [{ x: data[0] ?? 0, y: data[1] ?? 0 }];
      } else if (operation.op === "lineTo") {
        current.push({ x: data[0] ?? 0, y: data[1] ?? 0 });
      } else {
        const start = current[current.length - 1] ?? { x: data[0] ?? 0, y: data[1] ?? 0 };
        const [x1 = 0, y1 = 0, x2 = 0, y2 = 0, x3 = 0, y3 = 0] = data;
        for (let step = 1; step <= BEZIER_STEPS; step += 1) {
          const t = step / BEZIER_STEPS;
          const u = 1 - t;
          current.push({
            x: u * u * u * start.x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            y: u * u * u * start.y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
          });
        }
      }
    }
    if (current.length >= 2) polylines.push(current);
  }
  return polylines;
}

function pointCount(geometry: StrokeGeometry): number {
  return (
    geometry.strokes.reduce((total, stroke) => total + stroke.length, 0) +
    geometry.dots.length +
    (geometry.fill?.length ?? 0)
  );
}

/** Fails closed: an over-budget style falls back to the plain solid outline. */
function capGeometry(geometry: StrokeGeometry, input: StrokeGeometryInput): StrokeGeometry {
  if (pointCount(geometry) <= MAX_GEOMETRY_POINTS) return geometry;
  const { outline, closed, head } = outlineOf(input);
  return withFill({ strokes: [outline, ...head], dots: [] }, closed ? outline : undefined);
}
