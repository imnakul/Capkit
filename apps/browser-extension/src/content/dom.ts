import type { ElementDetails } from "@snaphub/devtools-protocol/protocol";
import type { CssRect } from "../geometry";

export function clip(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? collapsed.slice(0, max) : collapsed;
}

function escapeIdent(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

const IMPLICIT_ROLES: Record<string, string> = {
  a: "link",
  button: "button",
  nav: "navigation",
  main: "main",
  header: "banner",
  footer: "contentinfo",
  aside: "complementary",
  form: "form",
  img: "img",
  ul: "list",
  ol: "list",
  li: "listitem",
  table: "table",
  select: "combobox",
  textarea: "textbox",
  dialog: "dialog",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
};

const INPUT_ROLES: Record<string, string> = {
  checkbox: "checkbox",
  radio: "radio",
  button: "button",
  submit: "button",
  reset: "button",
  range: "slider",
  search: "searchbox",
  number: "spinbutton",
};

export function roleOf(element: Element): string | null {
  const explicit = element.getAttribute("role");
  if (explicit !== null && explicit !== "") return clip(explicit, 60);
  const tag = element.tagName.toLowerCase();
  if (tag === "input") return INPUT_ROLES[(element.getAttribute("type") ?? "text").toLowerCase()] ?? "textbox";
  if (tag === "a" && !element.hasAttribute("href")) return null;
  return IMPLICIT_ROLES[tag] ?? null;
}

export function accessibleName(element: Element): string {
  const label = element.getAttribute("aria-label");
  if (label !== null && label.trim() !== "") return clip(label, 120);
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy !== null) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");
    if (text.trim() !== "") return clip(text, 120);
  }
  const alt = element.getAttribute("alt");
  if (alt !== null && alt.trim() !== "") return clip(alt, 120);
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const labels = element.labels;
    const first = labels?.[0];
    if (first !== undefined && first.textContent.trim() !== "") return clip(first.textContent, 120);
    const placeholder = element.getAttribute("placeholder");
    if (placeholder !== null) return clip(placeholder, 120);
  }
  const role = roleOf(element);
  if (role === "button" || role === "link" || role === "heading") return clip(element.textContent, 120);
  const title = element.getAttribute("title");
  return title === null ? "" : clip(title, 120);
}

/** A readable CSS selector, up to four levels, stopping at the nearest id. */
export function selectorFor(element: Element): string {
  const parts: string[] = [];
  let node: Element | null = element;
  while (node !== null && node.tagName.toLowerCase() !== "html" && parts.length < 4) {
    const tag = node.tagName.toLowerCase();
    if (node.id !== "") {
      parts.unshift(`${tag}#${escapeIdent(node.id)}`);
      break;
    }
    const firstClass = [...node.classList].find((name) => /^[a-zA-Z_-][\w-]*$/.test(name) && name.length < 30);
    let part = firstClass === undefined ? tag : `${tag}.${escapeIdent(firstClass)}`;
    const parent: Element | null = node.parentElement;
    if (parent !== null && firstClass === undefined) {
      const same = [...parent.children].filter((child) => child.tagName === node?.tagName);
      if (same.length > 1) part += `:nth-of-type(${String(same.indexOf(node) + 1)})`;
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(" > ");
}

/** A stable short hash of a selector, used as the hit-test key. */
export function hashKey(selector: string): string {
  let hash = 2166136261;
  for (let index = 0; index < selector.length; index += 1) {
    hash ^= selector.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function shortLabel(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id === "" ? "" : `#${element.id}`;
  const firstClass = [...element.classList][0];
  const cls = firstClass === undefined ? "" : `.${firstClass}`;
  const role = roleOf(element);
  const name = accessibleName(element);
  if (id !== "" || cls !== "") return clip(`${tag}${id}${cls}`, 80);
  if (role !== null && name !== "") return clip(`${role} "${name}"`, 80);
  return tag;
}

export function rectOf(element: Element): CssRect {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
}

export function readStyles(element: Element): ElementDetails["styles"] {
  const style = getComputedStyle(element);
  const gap = style.getPropertyValue("gap");
  return {
    color: clip(style.color, 120),
    backgroundColor: clip(style.backgroundColor, 120),
    fontFamily: clip(style.fontFamily, 120),
    fontSize: clip(style.fontSize, 120),
    fontWeight: clip(style.fontWeight, 120),
    lineHeight: clip(style.lineHeight, 120),
    padding: clip(style.padding, 120),
    margin: clip(style.margin, 120),
    borderRadius: clip(style.borderRadius, 120),
    boxShadow: clip(style.boxShadow, 120),
    display: clip(style.display, 120),
    gap: clip(gap, 120),
  };
}

export type ComponentData = {
  component: ElementDetails["component"];
  source: ElementDetails["source"];
  sourceUnavailableReason?: ElementDetails["sourceUnavailableReason"];
};

/** Everything about an element except its viewport rect, which depends on the request's scale. */
export function describeElement(
  element: Element,
  rect: ElementDetails["rect"],
  componentData: ComponentData,
): ElementDetails {
  const css = rectOf(element);
  const label = componentData.component?.name ?? shortLabel(element);
  return {
    label: clip(label, 80),
    tag: element.tagName.toLowerCase(),
    role: roleOf(element),
    accessibleName: accessibleName(element),
    text: clip(element.textContent, 200),
    selector: clip(selectorFor(element), 300),
    component: componentData.component,
    source: componentData.source,
    ...(componentData.sourceUnavailableReason === undefined
      ? {}
      : { sourceUnavailableReason: componentData.sourceUnavailableReason }),
    classes: clip(element.getAttribute("class") ?? "", 400),
    styles: readStyles(element),
    cssRect: { x: css.x, y: css.y, width: css.width, height: css.height },
    rect,
  };
}
