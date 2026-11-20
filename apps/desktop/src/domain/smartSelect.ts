import type { DetectedTarget, Point, Rect } from "./capture";

/** Smallest detected element worth offering, in logical pixels. */
export const SMART_MIN_TARGET_SIZE = 12;
/** A window-sized target covering this much of the selection is the capture itself, not an element. */
export const SMART_WINDOW_COVERAGE_LIMIT = 0.9;
/** Breathing room added around a snapped box, in logical pixels. */
export const SMART_BOX_PADDING = 4;

/**
 * Display and selection coordinates are both logical pixels of the same display, so the
 * mapping is a pure translation: a display's scale factor never enters it (mixed-DPI setups
 * differ only when converting to physical pixels, which export does). Keep it that way so
 * a 100% and a 150% monitor snap identically.
 */
export function displayToSelection(point: Point, selection: Rect): Point {
  return { x: point.x - selection.x, y: point.y - selection.y };
}

export function selectionToDisplay(point: Point, selection: Rect): Point {
  return { x: point.x + selection.x, y: point.y + selection.y };
}

export function rectDisplayToSelection(rect: Rect, selection: Rect): Rect {
  return { ...rect, ...displayToSelection(rect, selection) };
}

function intersectionArea(first: Rect, second: Rect): number {
  const width = Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
  const height = Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/** Whether a detected target is a useful snap candidate inside the selection (display coordinates). */
export function isUsableSmartTarget(target: DetectedTarget, selection: Rect): boolean {
  const { bounds } = target;
  if (bounds.width < SMART_MIN_TARGET_SIZE || bounds.height < SMART_MIN_TARGET_SIZE) return false;
  const overlap = intersectionArea(bounds, selection);
  if (overlap === 0) return false;
  if (target.kind === "window" && overlap >= selection.width * selection.height * SMART_WINDOW_COVERAGE_LIMIT) return false;
  return true;
}

function clipRect(rect: Rect, size: { width: number; height: number }): Rect {
  const left = Math.max(0, rect.x);
  const top = Math.max(0, rect.y);
  const right = Math.min(size.width, rect.x + rect.width);
  const bottom = Math.min(size.height, rect.y + rect.height);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/**
 * Bounds for the annotation a Smart select click adds: the candidate padded by 4 px and clipped
 * to the selection. `circumscribe` grows the box by √2 about its centre so an ellipse passes
 * through the candidate's corners instead of cutting them off.
 */
export function smartAnnotationBounds(
  candidate: Rect,
  selectionSize: { width: number; height: number },
  circumscribe: boolean,
): Rect {
  const padded: Rect = {
    x: candidate.x - SMART_BOX_PADDING,
    y: candidate.y - SMART_BOX_PADDING,
    width: candidate.width + SMART_BOX_PADDING * 2,
    height: candidate.height + SMART_BOX_PADDING * 2,
  };
  if (!circumscribe) return clipRect(padded, selectionSize);
  const width = padded.width * Math.SQRT2;
  const height = padded.height * Math.SQRT2;
  return clipRect(
    { x: padded.x + padded.width / 2 - width / 2, y: padded.y + padded.height / 2 - height / 2, width, height },
    selectionSize,
  );
}
