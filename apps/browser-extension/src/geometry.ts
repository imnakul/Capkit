import type { PhysicalRect, ViewportPoint, ViewportRect } from "@snaphub/devtools-protocol/protocol";

/** Tolerance, in physical px, between the expected and the reported viewport height. */
export const MISMATCH_TOLERANCE_PX = 2;

export type CssRect = { x: number; y: number; width: number; height: number };

export type Scale = { scale: number };

/**
 * Physical px per CSS px, from the render widget's width and innerWidth.
 * Returns null when the heights disagree (docked DevTools, side panel, wrong tab).
 * Browser zoom is handled here; devicePixelRatio is never used.
 */
export function computeScale(viewport: PhysicalRect, innerWidth: number, innerHeight: number): Scale | null {
  if (innerWidth <= 0 || innerHeight <= 0 || viewport.width <= 0) return null;
  const scale = viewport.width / innerWidth;
  if (Math.abs(innerHeight * scale - viewport.height) > MISMATCH_TOLERANCE_PX) return null;
  return { scale };
}

export function toCssPoint(point: ViewportPoint, { scale }: Scale): ViewportPoint {
  return { x: point.x / scale, y: point.y / scale };
}

export function toViewportRect(rect: CssRect, { scale }: Scale): ViewportRect {
  return {
    x: Math.round(rect.x * scale),
    y: Math.round(rect.y * scale),
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale),
  };
}

export function toCssRect(rect: ViewportRect, { scale }: Scale): CssRect {
  return { x: rect.x / scale, y: rect.y / scale, width: rect.width / scale, height: rect.height / scale };
}

export function rectsIntersect(a: CssRect, b: CssRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
