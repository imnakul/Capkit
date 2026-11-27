import { ensureHost } from "./mainClient";

const shadows = new WeakMap<Element, ShadowRoot>();

/** The one closed shadow root on the host; the inspector and the picker each mount their own frame in it. */
export function hostShadow(doc: Document): ShadowRoot {
  const { host } = ensureHost(doc);
  let shadow = shadows.get(host);
  if (shadow === undefined) {
    shadow = host.attachShadow({ mode: "closed" });
    shadows.set(host, shadow);
  }
  return shadow;
}

export function fontCss(): string {
  const url = (file: string): string => chrome.runtime.getURL(`fonts/${file}`);
  return [
    `@font-face{font-family:"CapKit Sans";src:url("${url("plus-jakarta-sans-latin-wght-normal.woff2")}") format("woff2");font-weight:200 800}`,
    `@font-face{font-family:"CapKit Mono";src:url("${url("jetbrains-mono-latin-wght-normal.woff2")}") format("woff2");font-weight:100 800}`,
  ].join("");
}
