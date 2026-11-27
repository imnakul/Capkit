import { readAccent } from "../../accent";
import { HOST_TAG } from "../bridge";
import { shortLabel, type ComponentData } from "../dom";
import { h, place } from "../inspector/dom";
import { Overlay } from "../inspector/overlay";
import { INSPECTOR_CSS } from "../inspector/styles";
import { resolveComponentData, type ComponentResolver } from "../mainClient";
import { hostShadow, installFonts } from "../shadow";
import { THEME_CSS, closeIcon } from "../theme";
import { MAX_COMMENT, MAX_PICKS, buildPicksMarkdown, pickItem, type PickItem } from "./format";
import { PICKER_CSS } from "./styles";

const TOAST_MS = 1600;
const CARD_WIDTH = 280;
const CARD_HEIGHT = 150;
const HINT = "Click any element to comment on it. Esc exits.";
const NO_DATA: ComponentData = { component: null, source: null };
const SWALLOWED = ["pointerdown", "pointerup", "mousedown", "mouseup", "dblclick", "auxclick"] as const;

export type PickerDeps = {
  resolve: ComponentResolver;
  writeText: (text: string) => Promise<void>;
  accent: () => Promise<string>;
  fonts: (doc: Document) => void;
};

const defaultDeps: PickerDeps = {
  resolve: resolveComponentData,
  writeText: (text) => navigator.clipboard.writeText(text),
  accent: readAccent,
  fonts: installFonts,
};

type Entry = { element: Element; item: PickItem };
type Card = { node: HTMLElement; input: HTMLTextAreaElement; element: Element };

function hoverLabel(element: Element): string {
  const rect = element.getBoundingClientRect();
  return `${shortLabel(element)} · ${String(Math.round(rect.width))}×${String(Math.round(rect.height))}`;
}

/** Page-side pick and comment: hover, click to comment, numbered markers, a list with Copy. */
export class PickerController {
  private active = false;
  private frame: HTMLElement | null = null;
  private root: HTMLElement | null = null;
  private overlay: Overlay | null = null;
  private marks: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private card: Card | null = null;
  private entries: Entry[] = [];
  private frameRequest: number | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly deps: PickerDeps;

  constructor(
    private readonly doc: Document = document,
    deps: Partial<PickerDeps> = {},
  ) {
    this.deps = { ...defaultDeps, ...deps };
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Picks kept for this page, oldest first. */
  get items(): readonly PickItem[] {
    return this.entries.map((entry) => entry.item);
  }

  toggle(): void {
    if (this.active) this.stop();
    else this.start();
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.deps.fonts(this.doc);
    const style = h(this.doc, "style", {}, THEME_CSS, INSPECTOR_CSS, PICKER_CSS);
    const root = h(this.doc, "div", { class: "root" });
    this.root = root;
    void this.deps.accent().then((accent) => {
      root.style.setProperty("--accent", accent);
    });
    this.marks = h(this.doc, "div");
    root.append(this.marks);
    this.overlay = new Overlay(this.doc, root);
    this.list = h(this.doc, "section", { class: "pk-list card", "aria-label": "Pick and comment" });
    root.append(this.list);
    this.frame = h(this.doc, "div", { style: "display:contents" }, style, root);
    hostShadow(this.doc).append(this.frame);
    this.renderList();
    this.renderMarks();
    const win = this.doc.defaultView;
    win?.addEventListener("pointermove", this.onMove, true);
    win?.addEventListener("click", this.onClick, true);
    win?.addEventListener("keydown", this.onKey, true);
    win?.addEventListener("scroll", this.onViewport, true);
    win?.addEventListener("resize", this.onViewport);
    for (const type of SWALLOWED) win?.addEventListener(type, this.swallow, true);
  }

  /** Hides the tool; picks stay in memory until the page unloads. */
  stop(): void {
    if (!this.active) return;
    this.active = false;
    const win = this.doc.defaultView;
    win?.removeEventListener("pointermove", this.onMove, true);
    win?.removeEventListener("click", this.onClick, true);
    win?.removeEventListener("keydown", this.onKey, true);
    win?.removeEventListener("scroll", this.onViewport, true);
    win?.removeEventListener("resize", this.onViewport);
    for (const type of SWALLOWED) win?.removeEventListener(type, this.swallow, true);
    if (this.frameRequest !== null) win?.cancelAnimationFrame(this.frameRequest);
    this.frameRequest = null;
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.frame?.remove();
    this.frame = null;
    this.root = null;
    this.overlay = null;
    this.marks = null;
    this.list = null;
    this.card = null;
  }

  async copy(): Promise<void> {
    if (this.entries.length === 0) return;
    const count = this.entries.length;
    try {
      await this.deps.writeText(buildPicksMarkdown(this.doc.location.href, this.items));
      this.toast(count === 1 ? "Copied 1 comment" : `Copied ${String(count)} comments`);
    } catch {
      this.toast("Couldn't copy");
    }
  }

  clear(): void {
    this.entries = [];
    this.renderList();
    this.renderMarks();
  }

  remove(index: number): void {
    this.entries.splice(index, 1);
    this.renderList();
    this.renderMarks();
  }

  private isOwn(target: EventTarget | null): boolean {
    return target instanceof Element && target.localName === HOST_TAG;
  }

  private readonly swallow = (event: Event): void => {
    if (this.isOwn(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (this.card !== null) return;
    const element = this.doc.elementFromPoint(event.clientX, event.clientY);
    if (element === null || this.isOwn(element)) {
      this.overlay?.hide();
      return;
    }
    this.overlay?.show(element, hoverLabel(element), false);
  };

  private readonly onClick = (event: MouseEvent): void => {
    if (this.isOwn(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const element = this.doc.elementFromPoint(event.clientX, event.clientY);
    if (element === null || this.isOwn(element)) return;
    this.openCard(element);
  };

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (this.card !== null) this.closeCard();
    else this.stop();
  };

  private readonly onViewport = (): void => {
    const win = this.doc.defaultView;
    if (win === null || this.frameRequest !== null) return;
    this.frameRequest = win.requestAnimationFrame(() => {
      this.frameRequest = null;
      this.renderMarks();
      if (this.card !== null) this.placeCard(this.card);
    });
  };

  /** Opens the comment card; a card with an unsaved draft keeps it and takes focus back instead. */
  openCard(element: Element): void {
    if (this.root === null) return;
    if (this.card !== null && this.card.input.value.trim() !== "") {
      this.card.input.focus();
      return;
    }
    if (this.entries.length >= MAX_PICKS) {
      this.toast(`Limit is ${String(MAX_PICKS)} comments. Copy or clear to add more.`);
      return;
    }
    this.closeCard();
    this.overlay?.show(element, hoverLabel(element), true);
    const data = this.deps.resolve(element).catch(() => NO_DATA);
    const who = h(this.doc, "div", { class: "pk-who mono" }, shortLabel(element));
    void data.then((resolved) => {
      if (resolved.component !== null) who.textContent = `${resolved.component.name} · ${shortLabel(element)}`;
    });
    const input = h(this.doc, "textarea", {
      "aria-label": "Comment",
      placeholder: "What should change here?",
      maxlength: String(MAX_COMMENT),
    });
    const cancel = h(this.doc, "button", { type: "button", class: "ghost" }, "Cancel");
    const add = h(this.doc, "button", { type: "button", class: "primary" }, "Add");
    const node = h(
      this.doc,
      "div",
      { class: "pk-card card", role: "dialog", "aria-label": "Add a comment" },
      who,
      input,
      h(this.doc, "div", { class: "pk-actions" }, h(this.doc, "span", { class: "tip" }, "Shift+Enter for a new line"), cancel, add),
    );
    const card: Card = { node, input, element };
    const commit = (): void => {
      void this.commit(card, data);
    };
    cancel.addEventListener("click", () => {
      this.closeCard();
    });
    add.addEventListener("click", commit);
    input.addEventListener("keydown", (event) => {
      // Keep the page's own shortcuts from reacting to typing.
      event.stopPropagation();
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        commit();
      }
    });
    for (const type of ["keyup", "keypress"] as const) {
      input.addEventListener(type, (event) => {
        event.stopPropagation();
      });
    }
    this.card = card;
    this.root.append(node);
    this.placeCard(card);
    setTimeout(() => {
      input.focus();
    }, 0);
  }

  private async commit(card: Card, data: Promise<ComponentData>): Promise<void> {
    const resolved = await data;
    if (this.card !== card) return;
    const win = this.doc.defaultView;
    const scroll = { x: win?.scrollX ?? 0, y: win?.scrollY ?? 0 };
    this.entries.push({
      element: card.element,
      item: pickItem(card.element, resolved.component, resolved.source, scroll, card.input.value),
    });
    this.closeCard();
    this.renderList();
    this.renderMarks();
  }

  private closeCard(): void {
    this.card?.node.remove();
    this.card = null;
    this.overlay?.hide();
  }

  private placeCard(card: Card): void {
    const win = this.doc.defaultView;
    const width = win?.innerWidth ?? 1024;
    const height = win?.innerHeight ?? 768;
    const rect = card.element.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left), Math.max(8, width - CARD_WIDTH - 8));
    const below = rect.bottom + 8;
    const top = below + CARD_HEIGHT < height ? below : Math.max(8, rect.top - CARD_HEIGHT - 8);
    place(card.node, left, top);
  }

  private renderMarks(): void {
    const marks = this.marks;
    if (marks === null) return;
    marks.replaceChildren();
    this.entries.forEach((entry, index) => {
      if (!entry.element.isConnected) return;
      const rect = entry.element.getBoundingClientRect();
      const outline = h(this.doc, "div", { class: "pk-outline" });
      place(outline, rect.x, rect.y, rect.width, rect.height);
      const marker = h(this.doc, "div", { class: "pk-marker", "aria-hidden": "true" }, String(index + 1));
      place(marker, Math.max(2, rect.x - 10), Math.max(2, rect.y - 10));
      marks.append(outline, marker);
    });
  }

  private renderList(): void {
    const list = this.list;
    if (list === null) return;
    const count = this.entries.length;
    const clear = h(this.doc, "button", { type: "button", class: "ghost" }, "Clear");
    const copy = h(this.doc, "button", { type: "button", class: "primary" }, "Copy");
    const close = h(this.doc, "button", { type: "button", class: "ghost icon", "aria-label": "Close Pick and comment", title: "Close (Esc)" }, closeIcon(this.doc));
    clear.disabled = count === 0;
    copy.disabled = count === 0;
    clear.addEventListener("click", () => {
      this.clear();
    });
    copy.addEventListener("click", () => {
      void this.copy();
    });
    close.addEventListener("click", () => {
      this.stop();
    });
    const header = h(
      this.doc,
      "header",
      {},
      h(this.doc, "h2", {}, "Comments", h(this.doc, "span", { class: "pk-count" }, String(count))),
      clear,
      copy,
      close,
    );
    if (count === 0) {
      list.replaceChildren(header, h(this.doc, "p", { class: "pk-hint" }, HINT));
      return;
    }
    const items = this.entries.map(({ item }, index) => {
      const remove = h(this.doc, "button", { type: "button", class: "ghost icon", "aria-label": `Remove comment ${String(index + 1)}` }, closeIcon(this.doc));
      remove.addEventListener("click", () => {
        this.remove(index);
      });
      return h(
        this.doc,
        "li",
        {},
        h(this.doc, "span", { class: "pk-num", "aria-hidden": "true" }, String(index + 1)),
        h(
          this.doc,
          "div",
          { class: "pk-body" },
          h(this.doc, "div", { class: "pk-comment" }, item.comment === "" ? "(no comment)" : item.comment),
          h(this.doc, "div", { class: "pk-el mono" }, item.text === "" ? item.name : `${item.name} · "${item.text}"`),
        ),
        remove,
      );
    });
    list.replaceChildren(header, h(this.doc, "ol", {}, ...items));
  }

  private toast(text: string): void {
    const root = this.root;
    if (root === null) return;
    const node = h(this.doc, "div", { class: "toast", role: "status" }, text);
    root.querySelector(".toast")?.remove();
    root.append(node);
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      node.remove();
    }, TOAST_MS);
  }
}
