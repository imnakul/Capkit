import type { Point, Rect } from "../domain/capture";

export const MIN_SELECTION_SIZE = 8;

export function normalizeRect(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function clampRect(rect: Rect, bounds: Rect): Rect {
  const width = Math.min(rect.width, bounds.width);
  const height = Math.min(rect.height, bounds.height);
  return {
    x: Math.max(bounds.x, Math.min(rect.x, bounds.x + bounds.width - width)),
    y: Math.max(bounds.y, Math.min(rect.y, bounds.y + bounds.height - height)),
    width,
    height,
  };
}

export function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export type ToolbarPlacement = {
  tools: "top" | "bottom";
  actions: "left" | "right" | "bottom";
};

export function chooseToolbarPlacement(
  selection: Rect,
  viewport: Rect,
  toolbarHeight = 52,
  actionsWidth = 164,
): ToolbarPlacement {
  const roomAbove = selection.y - viewport.y;
  const roomBelow = viewport.y + viewport.height - (selection.y + selection.height);
  const tools = roomBelow >= toolbarHeight || roomBelow >= roomAbove ? "bottom" : "top";

  const roomRight = viewport.x + viewport.width - (selection.x + selection.width);
  const roomLeft = selection.x - viewport.x;
  const actions =
    roomRight >= actionsWidth ? "right" : roomLeft >= actionsWidth ? "left" : "bottom";

  return { tools, actions };
}

export function isUsableSelection(rect: Rect): boolean {
  return rect.width >= MIN_SELECTION_SIZE && rect.height >= MIN_SELECTION_SIZE;
}

