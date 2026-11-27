import { readAccent } from "../../accent";
import { HOST_TAG } from "../bridge";
import { shortLabel } from "../dom";
import { h, place } from "../inspector/dom";
import { hostShadow, installFonts } from "../shadow";
import { THEME_CSS, closeIcon } from "../theme";
import { fontCssText, readColors, readFont, type ColorSwatch } from "./read";
import { PROBE_CSS } from "./styles";

export type ProbeKind = "font" | "color";

const TOAST_MS = 1600;
const TIP_WIDTH = 240;
const TIP_GAP = 14;
const SWALLOWED = ["pointerdown", "pointerup", "mousedown", "mouseup", "dblclick", "auxclick"] as const;

/** Opens Chrome's eyedropper and resolves with the picked sRGB HEX, or null when cancelled. */
export type PixelPicker = () => Promise<string | null>;

export type ProbeDeps = {
  writeText: (text: string) => Promise<void>;
  accent: () => Promise<string>;
  fonts: (doc: Document) => void;
  /** Null when the browser has no EyeDropper. */
  pickPixel: PixelPicker | null;
};

type EyeDropperLike = { open: () => Promise<{ sRGBHex: string }> };

function browserPixelPicker(): PixelPicker | null {
  const ctor: unknown = Reflect.get(globalThis, "EyeDropper");
  if (typeof ctor !== "function") return null;
  return async (): Promise<string | null> => {
    // EyeDropper is missing from the TypeScript DOM lib; `typeof` above checked it exists.
    const dropper = Reflect.construct(ctor, []) as EyeDropperLike;
    try {
      return (await dropper.open()).sRGBHex;
    } catch {
      return null; // Esc cancels with AbortError.
    }
  };
}

function defaultDeps(): ProbeDeps {
  return {
    writeText: (text) => navigator.clipboard.writeText(text),
    accent: readAccent,
    fonts: installFonts,
    pickPixel: browserPixelPicker(),
  };
}

const TITLES: Record<ProbeKind, string> = { font: "Font", color: "Colour" };

/**
 * Hover tools. Font: hover text to read its font, click copies the CSS.
 * Colour: hover to read an element's colours, click locks it so each colour can be copied;
 * the eyedropper (E) copies any pixel. Colours are always HEX.
 */
export class ProbeController {
  private active = false;
  private frame: HTMLElement | null = null;
  private root: HTMLElement | null = null;
  private outline: HTMLElement | null = null;
  private tip: HTMLElement | null = null;
  private locked: Element | null = null;
  private dropping = false;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly deps: ProbeDeps;

  constructor(
    private readonly kind: ProbeKind,
    private readonly doc: Document = document,
    deps: Partial<ProbeDeps> = {},
  ) {
    this.deps = { ...defaultDeps(), ...deps };
  }

  get isActive(): boolean {
    return this.active;
  }

  get lockedElement(): Element | null {
    return this.locked;
  }

  toggle(): void {
    if (this.active) this.stop();
    else this.start();
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.deps.fonts(this.doc);
    const style = h(this.doc, "style", {}, THEME_CSS, PROBE_CSS);
    const root = h(this.doc, "div", { class: "root" });
    this.root = root;
    void this.deps.accent().then((accent) => {
      root.style.setProperty("--accent", accent);
    });
    this.outline = h(this.doc, "div", { class: "outline" });
    this.outline.hidden = true;
    this.tip = h(this.doc, "div", { class: "pb-tip card" });
    this.tip.hidden = true;
    root.append(this.outline, this.tip, this.renderBar());
    this.frame = h(this.doc, "div", { style: "display:contents" }, style, root);
    hostShadow(this.doc).append(this.frame);
    const win = this.doc.defaultView;
    win?.addEventListener("pointermove", this.onMove, true);
    win?.addEventListener("click", this.onClick, true);
    win?.addEventListener("keydown", this.onKey, true);
    win?.addEventListener("scroll", this.onScroll, true);
    for (const type of SWALLOWED) win?.addEventListener(type, this.swallow, true);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    const win = this.doc.defaultView;
    win?.removeEventListener("pointermove", this.onMove, true);
    win?.removeEventListener("click", this.onClick, true);
    win?.removeEventListener("keydown", this.onKey, true);
    win?.removeEventListener("scroll", this.onScroll, true);
    for (const type of SWALLOWED) win?.removeEventListener(type, this.swallow, true);
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.frame?.remove();
    this.frame = null;
    this.root = null;
    this.outline = null;
    this.tip = null;
    this.locked = null;
  }

  /** Hover preview for an element at a pointer position (CSS px). */
  preview(element: Element, x: number, y: number): void {
    if (this.locked !== null) return;
    this.showOutline(element);
    this.fillTip(element, false);
    this.placeTip(x, y);
  }

  /** Font: copies the element's font CSS. Colour: locks the element so each colour can be copied. */
  async choose(element: Element, x: number, y: number): Promise<void> {
    if (this.kind === "font") {
      this.showOutline(element);
      await this.copy(fontCssText(readFont(element)), "Copied font CSS");
      return;
    }
    this.locked = element;
    this.showOutline(element, true);
    this.fillTip(element, true);
    this.placeTip(x, y);
    this.tip?.querySelector("button")?.focus();
  }

  unlock(): void {
    this.locked = null;
    if (this.outline !== null) {
      this.outline.classList.remove("locked");
      this.outline.hidden = true;
    }
    if (this.tip !== null) {
      this.tip.hidden = true;
      this.tip.classList.remove("locked");
    }
  }

  async pickPixel(): Promise<void> {
    const pick = this.deps.pickPixel;
    if (pick === null || this.dropping) return;
    this.dropping = true;
    const tipWasShown = this.tip !== null && !this.tip.hidden;
    if (this.tip !== null) this.tip.hidden = true;
    const hex = await pick();
    this.dropping = false;
    if (!this.active) return;
    if (this.tip !== null && this.locked !== null && tipWasShown) this.tip.hidden = false;
    if (hex === null) return;
    const value = hex.toLowerCase();
    await this.copy(value, `Copied ${value}`, value);
  }

  private isOwn(target: EventTarget | null): boolean {
    return target instanceof Element && target.localName === HOST_TAG;
  }

  private target(event: MouseEvent): Element | null {
    const element = this.doc.elementFromPoint(event.clientX, event.clientY);
    return element === null || this.isOwn(element) ? null : element;
  }

  private readonly swallow = (event: Event): void => {
    if (this.isOwn(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (this.dropping || this.locked !== null) return;
    const element = this.target(event);
    if (element === null) {
      this.unlock();
      return;
    }
    this.preview(element, event.clientX, event.clientY);
  };

  private readonly onClick = (event: MouseEvent): void => {
    if (this.isOwn(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const element = this.target(event);
    if (element === null) return;
    this.locked = null;
    void this.choose(element, event.clientX, event.clientY);
  };

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (this.locked !== null) this.unlock();
      else this.stop();
      return;
    }
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (this.kind === "color" && plain && event.key.toLowerCase() === "e" && !isTyping(event)) {
      event.preventDefault();
      event.stopPropagation();
      void this.pickPixel();
    }
  };

  private readonly onScroll = (): void => {
    if (this.locked?.isConnected === true) this.showOutline(this.locked, true);
    else this.unlock();
  };

  private renderBar(): HTMLElement {
    const d = this.doc;
    const close = h(d, "button", { type: "button", class: "ghost icon", "aria-label": `Close ${TITLES[this.kind]}`, title: "Close (Esc)" }, closeIcon(d));
    close.addEventListener("click", () => {
      this.stop();
    });
    const tip = h(d, "span", { class: "tip" }, this.kind === "font" ? "Hover text, click to copy CSS" : "Hover to read, click to lock");
    const parts: Node[] = [h(d, "span", { class: "title" }, TITLES[this.kind]), h(d, "span", { class: "sep" }), tip];
    if (this.kind === "color" && this.deps.pickPixel !== null) {
      const dropper = h(d, "button", { type: "button", "aria-keyshortcuts": "E" }, "Pick any pixel", h(d, "kbd", { "aria-hidden": "true" }, "E"));
      dropper.addEventListener("click", () => {
        void this.pickPixel();
      });
      parts.push(dropper);
    }
    parts.push(close);
    return h(d, "div", { class: "bar card", role: "toolbar", "aria-label": `${TITLES[this.kind]} tool` }, ...parts);
  }

  private showOutline(element: Element, locked = false): void {
    const outline = this.outline;
    if (outline === null) return;
    const rect = element.getBoundingClientRect();
    place(outline, rect.x, rect.y, rect.width, rect.height);
    outline.classList.toggle("locked", locked);
    outline.hidden = false;
  }

  private fillTip(element: Element, interactive: boolean): void {
    const tip = this.tip;
    if (tip === null) return;
    tip.classList.toggle("locked", interactive);
    tip.hidden = false;
    tip.replaceChildren(...(this.kind === "font" ? this.fontTip(element) : this.colorTip(element, interactive)));
  }

  private fontTip(element: Element): Node[] {
    const d = this.doc;
    const font = readFont(element);
    const family = h(d, "div", { class: "pb-family" }, font.family);
    // Page fonts are document-wide, so the name previews in its own face.
    family.style.fontFamily = font.stack;
    const swatch = h(d, "span", { class: "swatch" });
    swatch.style.backgroundColor = font.color;
    const rows: [string, Node | string][] = [
      ["Size", font.size],
      ["Weight", font.weight],
      ["Line height", font.lineHeight],
    ];
    if (font.letterSpacing !== "normal" && font.letterSpacing !== "0px") rows.push(["Letter spacing", font.letterSpacing]);
    if (font.style !== "normal") rows.push(["Style", font.style]);
    rows.push(["Colour", h(d, "span", {}, swatch, font.color)]);
    const grid = h(d, "dl", { class: "pb-grid" });
    for (const [key, value] of rows) grid.append(h(d, "dt", {}, key), h(d, "dd", { class: "mono" }, value));
    return [family, h(d, "div", { class: "pb-el mono" }, shortLabel(element)), grid, h(d, "div", { class: "pb-foot" }, "Click to copy as CSS")];
  }

  private colorTip(element: Element, interactive: boolean): Node[] {
    const d = this.doc;
    const list = h(d, "ul", { class: "pb-swatches" });
    for (const swatch of readColors(element)) list.append(this.swatchRow(swatch, interactive));
    const head = h(d, "div", { class: "pb-head" }, h(d, "div", { class: "pb-el mono" }, shortLabel(element)));
    if (interactive) {
      const close = h(d, "button", { type: "button", class: "ghost icon", "aria-label": "Unlock element", title: "Unlock (Esc)" }, closeIcon(d));
      close.addEventListener("click", () => {
        this.unlock();
      });
      head.append(close);
    }
    const foot = h(d, "div", { class: "pb-foot" }, interactive ? "Click a colour to copy it" : "Click to lock and copy");
    return [head, list, foot];
  }

  private swatchRow(swatch: ColorSwatch, interactive: boolean): HTMLElement {
    const d = this.doc;
    const chip = h(d, "span", { class: "swatch" });
    chip.style.backgroundColor = swatch.hex;
    let value: HTMLElement;
    if (interactive) {
      const button = h(d, "button", { type: "button", class: "mono", "aria-label": `Copy ${swatch.name} ${swatch.hex}` }, swatch.hex);
      button.addEventListener("click", () => {
        void this.copy(swatch.hex, `Copied ${swatch.hex}`, swatch.hex);
      });
      value = button;
    } else {
      value = h(d, "span", { class: "mono" }, swatch.hex);
    }
    return h(d, "li", {}, chip, h(d, "span", { class: "name" }, swatch.name), value);
  }

  private placeTip(x: number, y: number): void {
    const tip = this.tip;
    const win = this.doc.defaultView;
    if (tip === null) return;
    const width = win?.innerWidth ?? 1024;
    const height = win?.innerHeight ?? 768;
    const tipHeight = tip.offsetHeight || 160;
    const left = x + TIP_GAP + TIP_WIDTH < width ? x + TIP_GAP : Math.max(8, x - TIP_GAP - TIP_WIDTH);
    const top = Math.min(Math.max(8, y + TIP_GAP), Math.max(8, height - tipHeight - 8));
    place(tip, left, top);
  }

  private async copy(text: string, message: string, color?: string): Promise<void> {
    try {
      await this.deps.writeText(text);
      this.toast(message, color);
    } catch {
      this.toast("Couldn't copy");
    }
  }

  private toast(text: string, color?: string): void {
    const root = this.root;
    if (root === null) return;
    const node = h(this.doc, "div", { class: "toast card", role: "status" });
    if (color !== undefined) {
      const swatch = h(this.doc, "span", { class: "swatch" });
      swatch.style.backgroundColor = color;
      node.append(swatch);
    }
    node.append(this.doc.createTextNode(text));
    root.querySelector(".toast")?.remove();
    root.append(node);
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      node.remove();
    }, TOAST_MS);
  }
}

function isTyping(event: KeyboardEvent): boolean {
  const target = event.composedPath()[0];
  return target instanceof HTMLElement && (target.isContentEditable || target.localName === "input" || target.localName === "textarea");
}
