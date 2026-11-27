import { fontFaceCss } from "../fonts";
import { ensureHost } from "./mainClient";

const FONT_STYLE_ID = "capkit-fonts";
const shadows = new WeakMap<Element, ShadowRoot>();

/** The one closed shadow root on the host; every page tool mounts its own frame in it. */
export function hostShadow(doc: Document): ShadowRoot {
  const { host } = ensureHost(doc);
  let shadow = shadows.get(host);
  if (shadow === undefined) {
    shadow = host.attachShadow({ mode: "closed" });
    shadows.set(host, shadow);
  }
  return shadow;
}

/**
 * Chrome ignores @font-face inside shadow roots, so the faces go in the page head once.
 * The family names are CapKit-only, so page text never changes.
 */
export function installFonts(doc: Document, url: (path: string) => string = (path) => chrome.runtime.getURL(path)): void {
  if (doc.getElementById(FONT_STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = FONT_STYLE_ID;
  style.textContent = fontFaceCss(url);
  // `doc.head` is typed non-null but is missing on XML and SVG documents.
  (doc.querySelector("head") ?? doc.documentElement).append(style);
}
