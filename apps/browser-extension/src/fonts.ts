/**
 * Geist, the dashboard's typeface, bundled with the extension; no network fetch.
 * Page tools use the "CapKit" family names so a page that ships its own Geist is untouched.
 */
export const SANS_STACK = '"CapKit Geist", "Geist Variable", "Segoe UI Variable", system-ui, sans-serif';
export const MONO_STACK = '"CapKit Geist Mono", "Geist Mono Variable", "Cascadia Mono", ui-monospace, monospace';

export function fontFaceCss(url: (path: string) => string): string {
  return [
    `@font-face{font-family:"CapKit Geist";src:url("${url("fonts/geist-latin-wght-normal.woff2")}") format("woff2");font-weight:100 900;font-display:swap}`,
    `@font-face{font-family:"CapKit Geist Mono";src:url("${url("fonts/geist-mono-latin-wght-normal.woff2")}") format("woff2");font-weight:100 900;font-display:swap}`,
  ].join("");
}
