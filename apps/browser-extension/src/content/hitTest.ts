import type { HitElement } from "@snaphub/devtools-protocol/protocol";
import { toViewportRect, type CssRect, type Scale } from "../geometry";
import { hashKey, rectOf, selectorFor, shortLabel } from "./dom";

const MIN_SIZE_CSS_PX = 6;
const MAX_ELEMENTS = 12;

function sameRect(a: CssRect, b: CssRect): boolean {
  return (
    Math.abs(a.x - b.x) <= 1 &&
    Math.abs(a.y - b.y) <= 1 &&
    Math.abs(a.width - b.width) <= 1 &&
    Math.abs(a.height - b.height) <= 1
  );
}

/** The element at a CSS point and its ancestors up to (excluding) body, smallest first. */
export function elementsAtPoint(doc: Document, x: number, y: number): Element[] {
  const start = doc.elementFromPoint(x, y);
  const chain: Element[] = [];
  for (let node: Element | null = start; node !== null; node = node.parentElement) {
    if (node === doc.body || node === doc.documentElement) break;
    chain.push(node);
  }
  return chain;
}

/**
 * Filters the chain to hover candidates: drops tiny elements, display:contents,
 * and any element whose rect equals its child's within 1px (the child is kept).
 */
export function hitCandidates(chain: readonly Element[]): Element[] {
  const kept: Element[] = [];
  let previousRect: CssRect | null = null;
  for (const element of chain) {
    const rect = rectOf(element);
    const hidden =
      rect.width < MIN_SIZE_CSS_PX || rect.height < MIN_SIZE_CSS_PX || getComputedStyle(element).display === "contents";
    if (hidden) continue;
    if (previousRect !== null && sameRect(previousRect, rect)) continue;
    kept.push(element);
    previousRect = rect;
    if (kept.length >= MAX_ELEMENTS) break;
  }
  return kept;
}

export function hitElements(
  doc: Document,
  cssPoint: { x: number; y: number },
  scale: Scale,
  labelFor: (element: Element) => string | null,
): HitElement[] {
  return hitCandidates(elementsAtPoint(doc, cssPoint.x, cssPoint.y)).map((element) => ({
    key: hashKey(selectorFor(element)),
    label: (labelFor(element) ?? shortLabel(element)).slice(0, 80),
    rect: toViewportRect(rectOf(element), scale),
  }));
}
