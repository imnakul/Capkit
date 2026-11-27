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

/** Said in place of an empty comment, so the agent still knows what to do with the element. */
const NO_COMMENT = "None written. Review this element and suggest or make an improvement.";

function itemSection(item: PickItem, index: number): string[] {
  const { box } = item;
  const lines = [
    `## Change ${String(index + 1)}: ${item.name}`,
    "",
    `**Change:** ${item.comment === "" ? NO_COMMENT : item.comment.replace(/\n/g, "\n  ")}`,
    "",
    "**Where:**",
    "",
  ];
  if (item.source !== null) lines.push(`- Source: \`${item.source}\``);
  lines.push(`- Element: \`${item.tag}\` · \`${item.selector}\``);
  if (item.text !== "") lines.push(`- Text: "${item.text}"`);
  lines.push(`- Position: ${String(box.width)}×${String(box.height)} at ${String(box.x)}, ${String(box.y)} (page, CSS px)`);
  return lines;
}

/**
 * The Markdown the Copy button puts on the clipboard. It opens with a plain
 * instruction, so pasting it into a coding agent on its own is enough.
 */
export function buildPicksMarkdown(url: string, items: readonly PickItem[]): string {
  const count = items.length === 1 ? "1 change" : `${String(items.length)} changes`;
  const sections = items.flatMap((item, index) => ["", ...itemSection(item, index)]);
  return [
    "# Page feedback",
    "",
    `Please make the ${count} below on this page. Each one names an element on the page and what to change. Find it in the code with its source file, or with its selector and text, then make the change.`,
    "",
    `Page: ${url}`,
    ...sections,
  ].join("\n") + "\n";
}
