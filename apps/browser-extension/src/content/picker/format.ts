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

function itemSection(item: PickItem, index: number): string[] {
  const { box } = item;
  const lines = [`## ${String(index + 1)}. ${item.name}`, "", item.comment === "" ? "_No comment_" : item.comment, ""];
  if (item.text !== "") lines.push(`- Text: "${item.text}"`);
  lines.push(`- Element: \`${item.tag}\` · \`${item.selector}\``);
  if (item.source !== null) lines.push(`- Source: \`${item.source}\``);
  lines.push(`- Position: ${String(box.width)}×${String(box.height)} at ${String(box.x)}, ${String(box.y)} (page, CSS px)`);
  return lines;
}

/** The Markdown the Copy button puts on the clipboard. */
export function buildPicksMarkdown(url: string, items: readonly PickItem[]): string {
  const sections = items.flatMap((item, index) => ["", ...itemSection(item, index)]);
  return ["# Page feedback", "", `URL: ${url}`, ...sections].join("\n") + "\n";
}
