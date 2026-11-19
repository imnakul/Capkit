import type { CssRect } from "../../geometry";
import type { Measurement } from "../measure";
import { h, place } from "./dom";

type Edges = { top: number; right: number; bottom: number; left: number };

function edges(style: CSSStyleDeclaration, property: "margin" | "padding" | "border"): Edges {
  const side = (name: string): number => {
    const key = property === "border" ? `border${name}Width` : `${property}${name}`;
    return Number.parseFloat(style.getPropertyValue(key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))) || 0;
  };
  return { top: side("Top"), right: side("Right"), bottom: side("Bottom"), left: side("Left") };
}

export type BoxModel = { margin: Edges; border: Edges; padding: Edges; content: { width: number; height: number } };

export function readBoxModel(element: Element): BoxModel {
  const style = getComputedStyle(element);
  const margin = edges(style, "margin");
  const border = edges(style, "border");
  const padding = edges(style, "padding");
  const rect = element.getBoundingClientRect();
  return {
    margin,
    border,
    padding,
    content: {
      width: Math.max(0, rect.width - border.left - border.right - padding.left - padding.right),
      height: Math.max(0, rect.height - border.top - border.bottom - padding.top - padding.bottom),
    },
  };
}

function frame(outer: CssRect, inner: CssRect): string {
  const o = (r: CssRect): string => `M${String(r.x - outer.x)} ${String(r.y - outer.y)}h${String(r.width)}v${String(r.height)}h${String(-r.width)}Z`;
  return `path(evenodd, "${o(outer)}${o(inner)}")`;
}

/** Draws hover and lock outlines, padding/margin bands, the label chip and measurement lines. */
export class Overlay {
  private readonly outline: HTMLElement;
  private readonly margin: HTMLElement;
  private readonly padding: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly measure: HTMLElement;

  constructor(
    private readonly doc: Document,
    root: HTMLElement,
  ) {
    this.margin = h(doc, "div", { class: "band margin" });
    this.padding = h(doc, "div", { class: "band padding" });
    this.outline = h(doc, "div", { class: "outline" });
    this.chip = h(doc, "div", { class: "chip mono" });
    this.measure = h(doc, "div");
    for (const part of [this.margin, this.padding, this.outline, this.chip, this.measure]) {
      part.hidden = true;
      root.append(part);
    }
  }

  show(element: Element, label: string, locked: boolean): void {
    const rect = element.getBoundingClientRect();
    const box = readBoxModel(element);
    place(this.outline, rect.x, rect.y, rect.width, rect.height);
    this.outline.classList.toggle("locked", locked);
    this.outline.hidden = false;

    const marginRect: CssRect = {
      x: rect.x - box.margin.left,
      y: rect.y - box.margin.top,
      width: rect.width + box.margin.left + box.margin.right,
      height: rect.height + box.margin.top + box.margin.bottom,
    };
    place(this.margin, marginRect.x, marginRect.y, marginRect.width, marginRect.height);
    this.margin.style.clipPath = frame(marginRect, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    this.margin.hidden = false;

    const inner: CssRect = {
      x: rect.x + box.border.left + box.padding.left,
      y: rect.y + box.border.top + box.padding.top,
      width: box.content.width,
      height: box.content.height,
    };
    const paddingBox: CssRect = {
      x: rect.x + box.border.left,
      y: rect.y + box.border.top,
      width: rect.width - box.border.left - box.border.right,
      height: rect.height - box.border.top - box.border.bottom,
    };
    place(this.padding, paddingBox.x, paddingBox.y, paddingBox.width, paddingBox.height);
    this.padding.style.clipPath = frame(paddingBox, inner);
    this.padding.hidden = false;

    this.chip.textContent = label;
    this.chip.hidden = false;
    const chipHeight = 20;
    const above = rect.y - chipHeight - 4;
    place(this.chip, Math.max(4, Math.min(rect.x, window.innerWidth - 220)), above < 4 ? rect.y + rect.height + 4 : above);
  }

  hide(): void {
    for (const part of [this.margin, this.padding, this.outline, this.chip]) part.hidden = true;
    this.clearMeasure();
  }

  clearMeasure(): void {
    this.measure.replaceChildren();
    this.measure.hidden = true;
  }

  drawMeasurements(measurements: readonly Measurement[]): void {
    this.measure.replaceChildren();
    for (const m of measurements) {
      const horizontal = m.orientation === "horizontal";
      const line = h(this.doc, "div", { class: `line ${horizontal ? "h" : "v"}` });
      place(
        line,
        Math.min(m.from.x, m.to.x),
        Math.min(m.from.y, m.to.y),
        horizontal ? Math.abs(m.to.x - m.from.x) : undefined,
        horizontal ? undefined : Math.abs(m.to.y - m.from.y),
      );
      this.measure.append(line);
      for (const end of [m.from, m.to]) {
        const cap = h(this.doc, "div", { class: "cap" });
        if (horizontal) place(cap, end.x, end.y - 4, 1, 9);
        else place(cap, end.x - 4, end.y, 9, 1);
        this.measure.append(cap);
      }
      const pill = h(this.doc, "div", { class: "pill mono" }, `${String(m.distance)}px`);
      place(pill, (m.from.x + m.to.x) / 2, (m.from.y + m.to.y) / 2);
      this.measure.append(pill);
    }
    this.measure.hidden = measurements.length === 0;
  }
}
