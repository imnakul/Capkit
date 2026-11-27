import { buildElementMarkdown } from "@snaphub/devtools-protocol/markdown";
import { toViewportRect } from "../../geometry";
import { describeElement, rectOf, shortLabel } from "../dom";
import { resolveComponentData } from "../mainClient";
import { fontCss, hostShadow } from "../shadow";
import { measureBetween } from "../measure";
import { h } from "./dom";
import { Overlay } from "./overlay";
import { Panel, defaultPosition, type PanelPosition } from "./panel";
import { readAccent } from "../../accent";
import { INSPECTOR_CSS } from "./styles";

const TOAST_MS = 1400;
const PAUSE_CSS =
  "*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}";
const EXIT_MS = 120;
const FONT_FACES = ["Plus Jakarta Sans", "JetBrains Mono"];

let savedPosition: PanelPosition | null = null;

function label(element: Element, name: string | null): string {
  const rect = element.getBoundingClientRect();
  return `${name ?? shortLabel(element)} · ${element.tagName.toLowerCase()} · ${String(Math.round(rect.width))}×${String(Math.round(rect.height))}`;
}

/** Page-side inspector: hover outline, lock, side panel, measure, keyboard shortcuts. */
export class InspectorController {
  private active = false;
  private frame: HTMLElement | null = null;
  private root: HTMLElement | null = null;
  private overlay: Overlay | null = null;
  private panel: Panel | null = null;
  private hovered: Element | null = null;
  private locked: Element | null = null;
  private altHeld = false;
  private paused = false;
  private pauseStyle: HTMLStyleElement | null = null;
  private pausedAnimations: Animation[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly doc: Document = document) {}

  get isActive(): boolean {
    return this.active;
  }

  toggle(): void {
    if (this.active) this.stop();
    else this.start();
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    const style = h(this.doc, "style", {}, fontCss(), INSPECTOR_CSS);
    this.root = h(this.doc, "div", { class: "root" });
    const root = this.root;
    void readAccent().then((accent) => {
      root.style.setProperty("--accent", accent);
    });
    // Own frame in the shared shadow root, so stopping never removes the picker's UI.
    this.frame?.remove();
    this.frame = h(this.doc, "div", { style: "display:contents" }, style, root);
    hostShadow(this.doc).append(this.frame);
    this.overlay = new Overlay(this.doc, this.root);
    this.panel = new Panel(this.doc, this.root, savedPosition ?? defaultPosition(), {
      close: (): void => {
        this.stop();
      },
      copy: (): void => {
        void this.copyMarkdown();
      },
      onCopy: (text, name): void => {
        void this.copyText(text, name);
      },
      onMove: (position): void => {
        savedPosition = position;
      },
    });
    this.panel.showHint("Hover an element, click to lock it. Esc exits.");
    const win = this.doc.defaultView;
    win?.addEventListener("pointermove", this.onMove, true);
    win?.addEventListener("pointerdown", this.swallow, true);
    win?.addEventListener("mousedown", this.swallow, true);
    win?.addEventListener("click", this.onClick, true);
    win?.addEventListener("keydown", this.onKey, true);
    win?.addEventListener("keyup", this.onKeyUp, true);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    const win = this.doc.defaultView;
    win?.removeEventListener("pointermove", this.onMove, true);
    win?.removeEventListener("pointerdown", this.swallow, true);
    win?.removeEventListener("mousedown", this.swallow, true);
    win?.removeEventListener("click", this.onClick, true);
    win?.removeEventListener("keydown", this.onKey, true);
    win?.removeEventListener("keyup", this.onKeyUp, true);
    const panel = this.panel;
    panel?.node.classList.remove("open");
    panel?.node.classList.add("closing");
    const frame = this.frame;
    setTimeout(() => {
      frame?.remove();
    }, EXIT_MS);
    this.hovered = null;
    this.locked = null;
    this.overlay = null;
    this.panel = null;
    this.resumeAnimations();
  }

  private isOwn(target: EventTarget | null): boolean {
    return target instanceof Element && target.localName === "capkit-inspector-host";
  }

  private readonly swallow = (event: Event): void => {
    if (this.isOwn(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onMove = (event: PointerEvent): void => {
    const element = this.doc.elementFromPoint(event.clientX, event.clientY);
    if (element === null || this.isOwn(element) || element === this.hovered) return;
    if (this.locked !== null) {
      this.hovered = element;
      this.drawMeasure();
      return;
    }
    this.hovered = element;
    this.overlay?.show(element, label(element, null), false);
  };

  private readonly onClick = (event: MouseEvent): void => {
    if (this.isOwn(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const element = this.doc.elementFromPoint(event.clientX, event.clientY);
    if (element === null || this.isOwn(element)) return;
    void this.lock(element);
  };

  private async lock(element: Element): Promise<void> {
    this.locked = element;
    this.hovered = null;
    this.overlay?.show(element, label(element, null), true);
    const data = await resolveComponentData(element).catch(() => ({ component: null, source: null }));
    if (this.locked !== element || this.panel === null) return;
    const css = rectOf(element);
    const details = describeElement(element, toViewportRect(css, { scale: 1 }), data);
    this.panel.render(element, details);
    this.overlay?.show(element, label(element, data.component?.name ?? null), true);
    this.currentDetails = details;
    this.drawMeasure();
  }

  private currentDetails: ReturnType<typeof describeElement> | null = null;

  private drawMeasure(): void {
    const locked = this.locked;
    const hovered = this.hovered;
    if (locked === null || this.overlay === null) return;
    if (hovered === null || hovered === locked) {
      this.overlay.clearMeasure();
      return;
    }
    const hoveredRect = rectOf(hovered);
    let other: ReturnType<typeof rectOf> | null = null;
    if (this.altHeld && hovered.parentElement !== null) {
      const parent = hovered.parentElement;
      const pr = rectOf(parent);
      const style = getComputedStyle(parent);
      const px = (v: string): number => Number.parseFloat(v) || 0;
      other = {
        x: pr.x + px(style.borderLeftWidth) + px(style.paddingLeft),
        y: pr.y + px(style.borderTopWidth) + px(style.paddingTop),
        width: pr.width - px(style.borderLeftWidth) - px(style.borderRightWidth) - px(style.paddingLeft) - px(style.paddingRight),
        height: pr.height - px(style.borderTopWidth) - px(style.borderBottomWidth) - px(style.paddingTop) - px(style.paddingBottom),
      };
    }
    this.overlay.drawMeasurements(measureBetween(other ?? rectOf(locked), hoveredRect));
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === "Alt" && this.altHeld) {
      this.altHeld = false;
      this.drawMeasure();
    }
  };

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey) return;
    if (event.key === "Alt") {
      event.preventDefault();
      if (!this.altHeld) {
        this.altHeld = true;
        this.drawMeasure();
      }
      return;
    }
    const handled = this.handleKey(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private handleKey(key: string): boolean {
    switch (key) {
      case "Escape":
        if (this.locked !== null) {
          this.locked = null;
          this.hovered = null;
          this.overlay?.hide();
          this.panel?.showHint("Hover an element, click to lock it. Esc exits.");
        } else {
          this.stop();
        }
        return true;
      case "ArrowUp":
        return this.move(this.locked?.parentElement ?? null);
      case "ArrowDown":
        return this.move(this.locked?.firstElementChild ?? null);
      case "ArrowLeft":
        return this.move(this.locked?.previousElementSibling ?? null);
      case "ArrowRight":
        return this.move(this.locked?.nextElementSibling ?? null);
      case "c":
        void this.copyMarkdown();
        return true;
      case "p":
        this.togglePause();
        return true;
      case "s":
        void this.copyImage();
        return true;
      default:
        return false;
    }
  }

  private move(target: Element | null): boolean {
    if (this.locked === null) return false;
    if (target !== null && target !== this.doc.documentElement && !this.isOwn(target)) void this.lock(target);
    return true;
  }

  private async copyText(text: string, name: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast(`Copied ${name}`);
    } catch {
      this.toast("Couldn't copy");
    }
  }

  private async copyMarkdown(): Promise<void> {
    const details = this.currentDetails;
    if (details === null || this.locked === null) {
      this.toast("Lock an element first");
      return;
    }
    try {
      await navigator.clipboard.writeText(buildElementMarkdown(details));
      this.toast("Copied element");
    } catch {
      this.toast("Couldn't copy");
    }
  }

  private togglePause(): void {
    if (this.paused) {
      this.resumeAnimations();
      this.toast("Animations resumed");
      return;
    }
    this.pausedAnimations = this.doc.getAnimations().filter((a) => a.playState === "running");
    for (const animation of this.pausedAnimations) animation.pause();
    this.pauseStyle = h(this.doc, "style", {}, PAUSE_CSS);
    this.doc.head.append(this.pauseStyle);
    this.paused = true;
    this.toast("Animations paused");
  }

  private resumeAnimations(): void {
    this.pauseStyle?.remove();
    this.pauseStyle = null;
    for (const animation of this.pausedAnimations) animation.play();
    this.pausedAnimations = [];
    this.paused = false;
  }

  private async copyImage(): Promise<void> {
    const element = this.locked;
    if (element === null) {
      this.toast("Lock an element first");
      return;
    }
    try {
      const rect = element.getBoundingClientRect();
      const response: unknown = await chrome.runtime.sendMessage({ kind: "captureVisible" });
      const dataUrl: unknown = typeof response === "object" && response !== null ? Reflect.get(response, "dataUrl") : null;
      if (typeof dataUrl !== "string") throw new Error("no capture");
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const scale = bitmap.width / window.innerWidth;
      const canvas = new OffscreenCanvas(Math.max(1, Math.round(rect.width * scale)), Math.max(1, Math.round(rect.height * scale)));
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("no canvas");
      context.drawImage(bitmap, rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale, 0, 0, canvas.width, canvas.height);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      this.toast("Copied element image");
    } catch {
      this.toast("Couldn't copy image");
    }
  }

  private toast(text: string): void {
    if (this.root === null) return;
    const node = h(this.doc, "div", { class: "toast", role: "status" }, text);
    this.root.querySelector(".toast")?.remove();
    this.root.append(node);
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      node.remove();
    }, TOAST_MS);
  }
}

export { FONT_FACES };
