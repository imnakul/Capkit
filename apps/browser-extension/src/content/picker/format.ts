import type { ElementDetails } from "@snaphub/devtools-protocol/protocol";
import { clip, selectorFor, shortLabel } from "../dom";

export const MAX_PICKS = 30;
export const MAX_COMMENT = 1000;

/** What an agent needs to find one element again: no styles, classes or box model. */
export type PickItem = {
  name: string;
  tag: string;
  text: string;
  selector: string;
  source: string | null;
  box: { x: number; y: number; width: number; height: number };
  comment: string;
};

const TEXT_ATTRIBUTES = ["placeholder", "aria-label", "alt", "title"] as const;

/** Visible text, or the placeholder/label an empty element shows instead. Input values are never read. */
export function pickText(element: Element): string {
  const text = clip(element.textContent, 120);
  if (text !== "") return text;
  for (const name of TEXT_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value !== null && value.trim() !== "") return clip(value, 120);
  }
  const type = element.getAttribute("type")?.toLowerCase();
  if (element.tagName === "INPUT" && (type === "button" || type === "submit" || type === "reset")) {
    return clip(element.getAttribute("value") ?? "", 120);
  }
  return "";
}

/** Keeps line breaks the user typed; trims and caps the length. */
export function cleanComment(value: string): string {
  const trimmed = value.replace(/\r\n?/g, "\n").trim();
  return trimmed.length > MAX_COMMENT ? trimmed.slice(0, MAX_COMMENT) : trimmed;
}

export function pickItem(
  element: Element,
  component: ElementDetails["component"],
  source: ElementDetails["source"],
  scroll: { x: number; y: number },
  comment: string,
): PickItem {
  const rect = element.getBoundingClientRect();
  return {
    name: clip(component?.name ?? shortLabel(element), 80),
    tag: element.tagName.toLowerCase(),
    text: pickText(element),
    selector: clip(selectorFor(element), 300),
    source: source === null ? null : `${source.file}:${String(source.line)}`,
    box: {
      x: Math.round(rect.x + scroll.x),
      y: Math.round(rect.y + scroll.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    comment: cleanComment(comment),
  };
}

/** Continuation lines of a note or detail sit under the item number. */
const INDENT = "   ";

function itemLines(item: PickItem, index: number): string[] {
  const { box } = item;
  const [first = "", ...rest] = item.comment.split("\n");
  const head = `${String(index + 1)}. ${item.name}${first === "" ? "" : `: ${first}`}`;
  const details = [
    item.source,
    item.tag,
    item.selector,
    item.text === "" ? null : `"${item.text}"`,
    `${String(box.width)}×${String(box.height)} at ${String(box.x)},${String(box.y)}`,
  ].filter((part): part is string => part !== null);
  return [head, ...rest.map((line) => INDENT + line), INDENT + details.join(" · ")];
}

/**
 * The plain text the Copy button puts on the clipboard. The first two lines
 * say what it is, so it can be pasted into an agent without a prompt. A pick
 * can be a request or just a pointer to an element, so nothing assumes a change.
 */
export function buildPicksText(url: string, items: readonly PickItem[]): string {
  const sections = items.flatMap((item, index) => ["", ...itemLines(item, index)]);
  return [
    `Notes on elements of ${url}`,
    "Each item names one element, then my note. Under it: source file, tag, selector, text, size and page position (CSS px). An item without a note just points the element out.",
    ...sections,
  ].join("\n") + "\n";
}
