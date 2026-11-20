import type { SensitiveMatch } from "@snaphub/devtools-protocol/protocol";
import { findSensitiveSpans, maskPreview } from "@snaphub/devtools-protocol/sensitive";
import { rectsIntersect, toViewportRect, type CssRect, type Scale } from "../geometry";

const MAX_MATCHES = 200;
const MAX_RECTS = 40;
const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
const PASSWORD_MASK = "••••••••";

function visible(element: Element): boolean {
  const check = Reflect.get(element, "checkVisibility") as ((options?: object) => boolean) | undefined; // not in every DOM lib; absent in jsdom
  return typeof check === "function" ? check.call(element, { visibilityProperty: true }) : true;
}

function toRect(rect: DOMRect): CssRect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function rangeRects(node: Text, start: number, end: number, area: CssRect, scale: Scale): SensitiveMatch["rects"] {
  const range = node.ownerDocument.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const rects: SensitiveMatch["rects"] = [];
  for (const rect of range.getClientRects()) {
    const css = toRect(rect);
    if (css.width > 0 && css.height > 0 && rectsIntersect(css, area)) rects.push(toViewportRect(css, scale));
    if (rects.length >= MAX_RECTS) break;
  }
  return rects;
}

/** Finds sensitive text and filled password fields inside a CSS-px area; rects are in physical viewport px. */
export function findSensitiveInArea(doc: Document, area: CssRect, scale: Scale): SensitiveMatch[] {
  const matches: SensitiveMatch[] = [];

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null && matches.length < MAX_MATCHES; node = walker.nextNode()) {
    if (!(node instanceof Text)) continue;
    const parent = node.parentElement;
    if (parent === null || SKIPPED_TAGS.has(parent.tagName) || !visible(parent)) continue;
    const text = node.data;
    if (text.trim().length < 5) continue;
    for (const span of findSensitiveSpans(text)) {
      const rects = rangeRects(node, span.start, span.end, area, scale);
      if (rects.length === 0) continue;
      matches.push({ kind: span.kind, preview: maskPreview(text.slice(span.start, span.end)), rects });
    }
  }

  for (const field of doc.querySelectorAll("input, textarea")) {
    if (matches.length >= MAX_MATCHES) break;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) continue;
    if (field.value === "" || !visible(field)) continue;
    const css = toRect(field.getBoundingClientRect());
    if (!rectsIntersect(css, area)) continue;
    const rect = toViewportRect(css, scale);
    if (field instanceof HTMLInputElement && field.type === "password") {
      matches.push({ kind: "password", preview: PASSWORD_MASK, rects: [rect] });
      continue;
    }
    for (const span of findSensitiveSpans(field.value)) {
      matches.push({ kind: span.kind, preview: maskPreview(field.value.slice(span.start, span.end)), rects: [rect] });
    }
  }
  return matches.slice(0, MAX_MATCHES);
}
