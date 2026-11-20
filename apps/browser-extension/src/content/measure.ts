import type { CssRect } from "../geometry";

export type Measurement = {
  orientation: "horizontal" | "vertical";
  /** Line start and end in CSS px. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  distance: number;
};

const round = (value: number): number => Math.round(value * 10) / 10;

function horizontal(x1: number, x2: number, y: number): Measurement {
  return { orientation: "horizontal", from: { x: x1, y }, to: { x: x2, y }, distance: round(x2 - x1) };
}

function vertical(y1: number, y2: number, x: number): Measurement {
  return { orientation: "vertical", from: { x, y: y1 }, to: { x, y: y2 }, distance: round(y2 - y1) };
}

/**
 * Distance lines between the nearest edges of two rects: up to one horizontal
 * and one vertical line. Nested or overlapping rects show the four insets.
 */
export function measureBetween(a: CssRect, b: CssRect): Measurement[] {
  const aRight = a.x + a.width;
  const bRight = b.x + b.width;
  const aBottom = a.y + a.height;
  const bBottom = b.y + b.height;
  const result: Measurement[] = [];

  const overlapTop = Math.max(a.y, b.y);
  const overlapBottom = Math.min(aBottom, bBottom);
  const midY = overlapBottom > overlapTop ? (overlapTop + overlapBottom) / 2 : (a.y + aBottom) / 2;
  if (bRight <= a.x) result.push(horizontal(bRight, a.x, midY));
  else if (b.x >= aRight) result.push(horizontal(aRight, b.x, midY));

  const overlapLeft = Math.max(a.x, b.x);
  const overlapRight = Math.min(aRight, bRight);
  const midX = overlapRight > overlapLeft ? (overlapLeft + overlapRight) / 2 : (a.x + aRight) / 2;
  if (bBottom <= a.y) result.push(vertical(bBottom, a.y, midX));
  else if (b.y >= aBottom) result.push(vertical(aBottom, b.y, midX));

  if (result.length > 0) return result;

  const aInside = a.width * a.height <= b.width * b.height;
  const inner = aInside ? a : b;
  const outer = aInside ? b : a;
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  return [
    horizontal(outer.x, inner.x, cy),
    horizontal(inner.x + inner.width, outer.x + outer.width, cy),
    vertical(outer.y, inner.y, cx),
    vertical(inner.y + inner.height, outer.y + outer.height, cx),
  ].filter((m) => m.distance > 0);
}
