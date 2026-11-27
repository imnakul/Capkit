import type { ElementDetails } from "@snaphub/devtools-protocol/protocol";
import { toHexColor } from "@snaphub/devtools-protocol/markdown";
import { contrastRatio, effectiveBackground, gradeContrast, over, parseColor } from "../contrast";
import { readBoxModel } from "./overlay";
import { closeIcon } from "../theme";
import { h } from "./dom";

const PANEL_WIDTH = 320;
const INSET = 12;

export type PanelPosition = { x: number; y: number };

export function defaultPosition(): PanelPosition {
  return { x: Math.max(INSET, window.innerWidth - PANEL_WIDTH - INSET), y: INSET };
}

function clampPosition(position: PanelPosition): PanelPosition {
  return {
    x: Math.min(Math.max(INSET, position.x), Math.max(INSET, window.innerWidth - PANEL_WIDTH - INSET)),
    y: Math.min(Math.max(INSET, position.y), Math.max(INSET, window.innerHeight - 60)),
  };
}

export type ContrastInfo = { ratio: number; grade: "AAA" | "AA" | "Fail" };

export function contrastOf(element: Element): ContrastInfo | null {
  const style = getComputedStyle(element);
  const fg = parseColor(style.color);
  if (fg === null) return null;
  const bg = effectiveBackground(element);
  const ratio = contrastRatio(over(fg, bg), bg);
  const size = Number.parseFloat(style.fontSize);
  const weight = Number.parseInt(style.fontWeight, 10);
  const large = size >= 24 || (size >= 18.66 && weight >= 700);
  return { ratio, grade: gradeContrast(ratio, large) };
}

function row(doc: Document, key: string, value: string | Node, mono = false): HTMLElement {
  return h(
    doc,
    "div",
    { class: "row" },
    h(doc, "span", { class: "k" }, key),
    h(doc, "span", { class: mono ? "v mono" : "v" }, value),
  );
}

function copyRow(doc: Document, key: string, shown: string, text: string, name: string, onCopy: PanelActions["onCopy"], swatchColor?: string): HTMLElement {
  const button = h(doc, "button", { type: "button", class: "link mono", "aria-label": `Copy ${name}` });
  if (swatchColor !== undefined) {
    const swatch = h(doc, "span", { class: "swatch" });
    swatch.style.backgroundColor = swatchColor;
    button.append(swatch);
  }
  button.append(doc.createTextNode(shown));
  button.addEventListener("click", () => {
    onCopy(text, name);
  });
  return row(doc, key, button);
}

function boxDiagram(doc: Document, element: Element): HTMLElement {
  const box = readBoxModel(element);
  const sides = (e: { top: number; right: number; bottom: number; left: number }): string =>
    `${String(e.top)} ${String(e.right)} ${String(e.bottom)} ${String(e.left)}`;
  const inner = h(
    doc,
    "div",
    { class: "inner mono" },
    `padding ${sides(box.padding)}`,
    h(doc, "div", {}, `${String(Math.round(box.content.width))} × ${String(Math.round(box.content.height))}`),
  );
  return h(doc, "div", { class: "box mono" }, `margin ${sides(box.margin)}`, inner);
}

export type PanelActions = {
  close: () => void;
  copy: () => void;
  onCopy: (text: string, name: string) => void;
  onMove: (position: PanelPosition) => void;
};

/** The 320px inspector dialog. Content is rebuilt per element; the dialog node is kept so focus survives. */
export class Panel {
  readonly node: HTMLElement;
  private readonly body: HTMLElement;
  private position: PanelPosition;

  constructor(
    private readonly doc: Document,
    root: HTMLElement,
    position: PanelPosition,
    private readonly actions: PanelActions,
  ) {
    this.position = clampPosition(position);
    this.body = h(doc, "div");
    const close = h(doc, "button", { type: "button", class: "ghost icon", "aria-label": "Close inspector", title: "Close (Esc)" }, closeIcon(doc));
    close.addEventListener("click", actions.close);
    const copy = h(doc, "button", { type: "button", class: "primary", "aria-label": "Copy element as Markdown" }, "Copy");
    copy.addEventListener("click", actions.copy);
    const header = h(doc, "header", {}, h(doc, "h2", {}, "Inspect"), copy, close);
    this.node = h(doc, "div", { class: "panel card", role: "dialog", "aria-label": "CapKit Inspector", tabindex: "-1" }, header, this.body);
    this.apply();
    this.enableDrag(header);
    root.append(this.node);
    requestAnimationFrame(() => {
      this.node.classList.add("open");
    });
  }

  private apply(): void {
    this.node.style.left = `${String(this.position.x)}px`;
    this.node.style.top = `${String(this.position.y)}px`;
  }

  private enableDrag(header: HTMLElement): void {
    header.addEventListener("pointerdown", (event) => {
      if (event.target instanceof HTMLButtonElement) return;
      const startX = event.clientX - this.position.x;
      const startY = event.clientY - this.position.y;
      header.setPointerCapture(event.pointerId);
      const move = (e: PointerEvent): void => {
        this.position = clampPosition({ x: e.clientX - startX, y: e.clientY - startY });
        this.apply();
      };
      const up = (): void => {
        header.removeEventListener("pointermove", move);
        header.removeEventListener("pointerup", up);
        this.actions.onMove(this.position);
      };
      header.addEventListener("pointermove", move);
      header.addEventListener("pointerup", up);
    });
  }

  showHint(text: string): void {
    this.body.replaceChildren(h(this.doc, "p", { class: "hint" }, text));
  }

  render(element: Element, details: ElementDetails): void {
    const d = this.doc;
    const contrast = contrastOf(element);
    const elementSection = h(d, "section", { "aria-label": "Element" });
    elementSection.append(
      row(d, "Element", details.label, true),
      copyRow(d, "Selector", details.selector, details.selector, "selector", this.actions.onCopy),
      row(d, "Component", details.component === null ? "None found" : details.component.name),
      details.source === null
        ? row(d, "Source", sourceNote(details), true)
        : copyRow(d, "Source", `${details.source.file}:${String(details.source.line)}`, `${details.source.file}:${String(details.source.line)}`, "source", this.actions.onCopy),
      row(d, "Owners", details.component === null || details.component.ownerPath.length === 0 ? "None" : details.component.ownerPath.join(" › "), true),
      row(d, "Text", details.text === "" ? "None" : details.text),
      row(d, "Size", `${String(Math.round(details.cssRect.width))} × ${String(Math.round(details.cssRect.height))}`, true),
      boxDiagram(d, element),
    );

    const s = details.styles;
    const styles = h(d, "details", { open: "" }, h(d, "summary", {}, "Styles"));
    styles.append(
      copyRow(d, "Color", toHexColor(s.color), toHexColor(s.color), "color", this.actions.onCopy, s.color),
      copyRow(d, "Background", toHexColor(s.backgroundColor), toHexColor(s.backgroundColor), "color", this.actions.onCopy, s.backgroundColor),
      row(d, "Font", `${s.fontFamily.split(",")[0] ?? ""} ${s.fontSize}/${s.lineHeight} ${s.fontWeight}`, true),
      row(d, "Padding", s.padding, true),
      row(d, "Margin", s.margin, true),
      row(d, "Radius", s.borderRadius, true),
      row(d, "Shadow", s.boxShadow, true),
      row(d, "Layout", layoutOf(element, s), true),
      row(d, "Classes", details.classes === "" ? "None" : details.classes, true),
    );

    const access = h(d, "details", { open: "" }, h(d, "summary", {}, "Accessibility"));
    access.append(
      row(d, "Role", details.role ?? "none"),
      row(d, "Name", details.accessibleName === "" ? "None" : details.accessibleName),
    );
    if (contrast !== null) {
      const badge = h(d, "span", { class: contrast.grade === "Fail" ? "badge fail" : "badge" }, contrast.grade);
      access.append(row(d, "Contrast", h(d, "span", { class: "mono" }, `${contrast.ratio.toFixed(2)}:1 `, badge)));
    }
    this.body.replaceChildren(elementSection, styles, access);
  }
}

function layoutOf(element: Element, s: ElementDetails["styles"]): string {
  const style = getComputedStyle(element);
  const direction = s.display.includes("flex") ? ` ${style.flexDirection}` : s.display.includes("grid") ? " grid" : "";
  return `${s.display}${direction}${s.gap === "normal" ? "" : ` · gap ${s.gap}`}`;
}

function sourceNote(details: ElementDetails): string {
  switch (details.sourceUnavailableReason) {
    case "no-react":
      return "Not a React element";
    case "production-build":
      return "Production build";
    case "no-source-map":
      return "No source map";
    case "fetch-failed":
      return "Source map unavailable";
    case undefined:
      return "Unavailable";
  }
}
