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
