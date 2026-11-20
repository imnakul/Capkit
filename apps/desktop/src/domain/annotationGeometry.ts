import { measureTextBlock } from "./textMetrics";
import type { Annotation } from "./annotations";
import type { Point, Rect } from "./capture";
import { resizeRectFromHandle, type ResizeHandle } from "../lib/geometry";

/** Smallest frame a resized annotation may shrink to, in logical pixels. */
export const MIN_ANNOTATION_SIZE = 8;

/** Text has its own selection control and is moved, not resized. */
export function isResizableAnnotation(annotation: Annotation): boolean {
  return annotation.kind !== "text";
}

/** The on-screen frame of an annotation, including stroke padding for lines. */
export function annotationBounds(annotation: Annotation): Rect {
  if ("bounds" in annotation) return annotation.bounds;
  if (annotation.kind === "text") {
    const size = measureTextBlock(annotation.text, annotation.fontSize, annotation.fontFamily);
    return { x: annotation.position.x, y: annotation.position.y, width: size.width, height: size.height };
  }
  if (annotation.kind === "counter") {
    return {
      x: annotation.position.x - annotation.radius,
      y: annotation.position.y - annotation.radius,
      width: annotation.radius * 2,
      height: annotation.radius * 2,
    };
  }
  const xs = annotation.points.map((point) => point.x);
  const ys = annotation.points.map((point) => point.y);
  const minX = Math.min(...xs) - annotation.strokeWidth;
  const minY = Math.min(...ys) - annotation.strokeWidth;
  return {
    x: minX,
    y: minY,
    width: Math.max(1, Math.max(...xs) - minX + annotation.strokeWidth),
    height: Math.max(1, Math.max(...ys) - minY + annotation.strokeWidth),
  };
}

export function findAnnotationAtPoint(
  elements: readonly Annotation[],
  point: Point,
): Annotation | undefined {
  const tolerance = 10;
  return [...elements].reverse().find((element) => {
    const bounds = annotationBounds(element);
    return (
      point.x >= bounds.x - tolerance &&
      point.x <= bounds.x + bounds.width + tolerance &&
      point.y >= bounds.y - tolerance &&
      point.y <= bounds.y + bounds.height + tolerance
    );
  });
}

export function translateAnnotation(annotation: Annotation, dx: number, dy: number): Annotation {
  if ("bounds" in annotation) {
    return { ...annotation, bounds: { ...annotation.bounds, x: annotation.bounds.x + dx, y: annotation.bounds.y + dy } };
  }
  if (annotation.kind === "text" || annotation.kind === "counter") {
    return { ...annotation, position: { x: annotation.position.x + dx, y: annotation.position.y + dy } };
  }
  return { ...annotation, points: annotation.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
}

/**
 * Drags one handle of the annotation's frame by (dx, dy) and refits the
 * annotation into the new frame. Lines and strokes scale their points; stroke
 * width is kept so a resized pen line keeps its weight.
 */
export function resizeAnnotation(
  annotation: Annotation,
  handle: ResizeHandle,
  dx: number,
  dy: number,
): Annotation {
  if (!isResizableAnnotation(annotation)) return annotation;
  const from = annotationBounds(annotation);
  const padding = "points" in annotation ? annotation.strokeWidth : 0;
  const minSize = Math.max(MIN_ANNOTATION_SIZE, padding * 2 + 2);
  const to = resizeRectFromHandle(from, handle, dx, dy, minSize);

  if ("bounds" in annotation) return { ...annotation, bounds: to };
  if (annotation.kind === "counter") {
    return {
      ...annotation,
      position: { x: to.x + to.width / 2, y: to.y + to.height / 2 },
      radius: Math.min(to.width, to.height) / 2,
    };
  }
  if (annotation.kind === "text") return annotation;

  const inner = (rect: Rect): Rect => ({
    x: rect.x + padding,
    y: rect.y + padding,
    width: Math.max(0, rect.width - padding * 2),
    height: Math.max(0, rect.height - padding * 2),
  });
  const source = inner(from);
  const target = inner(to);
  return {
    ...annotation,
    points: annotation.points.map((point) => ({
      x: mapAxis(point.x, source.x, source.width, target.x, target.width),
      y: mapAxis(point.y, source.y, source.height, target.y, target.height),
    })),
  };
}

/**
 * Maps a coordinate between two spans. A flat span (a horizontal or vertical
 * line) can't be stretched, so it follows the target's centre instead.
 */
function mapAxis(value: number, sourceStart: number, sourceSize: number, targetStart: number, targetSize: number): number {
  if (sourceSize < 1) return value + targetStart + targetSize / 2 - (sourceStart + sourceSize / 2);
  return targetStart + ((value - sourceStart) * targetSize) / sourceSize;
}

/** Distance from `point` to the segment `a`–`b`. */
function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function insideRect(point: Point, rect: Rect, margin: number): boolean {
  return (
    point.x >= rect.x - margin &&
    point.x <= rect.x + rect.width + margin &&
    point.y >= rect.y - margin &&
    point.y <= rect.y + rect.height + margin
  );
}

/** Slack added around a filled or solid-bodied annotation's bounds. */
const BODY_HIT_MARGIN = 4;

/**
 * The topmost annotation a pointer press should edit while a drawing tool is active.
 *
 * Unfilled rectangles and ellipses match on their outline only, so a user can still draw
 * inside them. Filled shapes, regions, text and counters match on their bounds (+4 px).
 * Lines, arrows, pencil and highlighter strokes match on polyline distance.
 *
 * @param tolerance Minimum outline reach in px; each stroke widens it to `strokeWidth / 2 + 4`.
 */
export function findEditableAnnotationAt(
  elements: readonly Annotation[],
  point: Point,
  tolerance = 8,
): Annotation | undefined {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (element !== undefined && hitsEditableArea(element, point, tolerance)) return element;
  }
  return undefined;
}

function hitsEditableArea(annotation: Annotation, point: Point, tolerance: number): boolean {
  switch (annotation.kind) {
    case "rectangle":
    case "ellipse": {
      const reach = Math.max(tolerance, annotation.strokeWidth / 2 + BODY_HIT_MARGIN);
      const filled = annotation.fill !== "transparent";
      if (filled) return insideRect(point, annotation.bounds, BODY_HIT_MARGIN);
      const { bounds } = annotation;
      if (annotation.kind === "rectangle") {
        return insideRect(point, bounds, reach) && !insideRect(point, shrink(bounds, reach), 0);
      }
      const radiusX = bounds.width / 2;
      const radiusY = bounds.height / 2;
      if (radiusX <= 0 || radiusY <= 0) return insideRect(point, bounds, reach);
      const normalized = Math.hypot((point.x - (bounds.x + radiusX)) / radiusX, (point.y - (bounds.y + radiusY)) / radiusY);
      return Math.abs(normalized - 1) * Math.min(radiusX, radiusY) <= reach;
    }
    case "line":
    case "arrow":
    case "curved-arrow":
    case "pencil":
    case "highlighter": {
      const reach = Math.max(tolerance, annotation.strokeWidth / 2 + BODY_HIT_MARGIN);
      const { points } = annotation;
      const [first] = points;
      if (first === undefined) return false;
      if (points.length === 1) return Math.hypot(point.x - first.x, point.y - first.y) <= reach;
      return points.some((current, i) => {
        const next = points[i + 1];
        return next !== undefined && distanceToSegment(point, current, next) <= reach;
      });
    }
    case "spotlight":
    case "blur":
    case "pixelate":
    case "blackout":
    case "text":
    case "counter":
      return insideRect(point, annotationBounds(annotation), BODY_HIT_MARGIN);
  }
}

function shrink(rect: Rect, amount: number): Rect {
  return { x: rect.x + amount, y: rect.y + amount, width: rect.width - amount * 2, height: rect.height - amount * 2 };
}
