import { MONO_STACK, SANS_STACK } from "../fonts";

/**
 * Dashboard tokens for page tools: one hue, content/N over background-base, accent for
 * selection, focus and the primary button only. Follows the system light/dark setting.
 * Surfaces are opaque because they sit over arbitrary pages, not the dashboard glass.
 */
export const THEME_CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.root {
  --accent: #d9ff43;
  --accent-ink: #12130f;
  --bg: hsl(60 4% 10%);
  --fg: hsl(60 4% 93%);
  --danger: #f87171;
  --success: #4ade80;
  --shadow: 0 0 0 1px rgb(0 0 0 / 30%), 0 12px 32px -4px rgb(0 0 0 / 50%);
  --c4: color-mix(in oklab, var(--fg) 4%, transparent);
  --c6: color-mix(in oklab, var(--fg) 6%, transparent);
  --c8: color-mix(in oklab, var(--fg) 8%, transparent);
  --c10: color-mix(in oklab, var(--fg) 10%, transparent);
  --c15: color-mix(in oklab, var(--fg) 15%, transparent);
  --c45: color-mix(in oklab, var(--fg) 45%, transparent);
  --c60: color-mix(in oklab, var(--fg) 60%, transparent);
  --c80: color-mix(in oklab, var(--fg) 80%, transparent);
  --surface: color-mix(in oklab, var(--fg) 3%, var(--bg));
  --ease-arrive: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-settle: cubic-bezier(0.22, 1, 0.36, 1);
  position: fixed; inset: 0; pointer-events: none;
  font: 400 12px/1.5 ${SANS_STACK};
  color: var(--fg);
  -webkit-font-smoothing: antialiased;
  font-synthesis: none;
}
@media (prefers-color-scheme: light) {
  .root {
    --bg: hsl(60 4% 97%);
    --fg: hsl(60 4% 13%);
    --danger: #dc2626;
    --success: #15803d;
    --shadow: 0 0 0 1px rgb(0 0 0 / 8%), 0 12px 32px -4px rgb(0 0 0 / 18%);
    --surface: #fff;
  }
}
.mono { font-family: ${MONO_STACK}; font-variant-numeric: tabular-nums; }
.card {
  background: var(--surface); color: var(--fg); border-radius: 10px; box-shadow: var(--shadow); pointer-events: auto;
}
button {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 24px; padding: 0 8px; border: 0; border-radius: 6px;
  font: 500 12px/1 ${SANS_STACK}; color: var(--fg); background: var(--c6); cursor: pointer; white-space: nowrap;
  transition: transform 100ms ease-out, background-color 100ms ease-out, color 100ms ease-out, filter 100ms ease-out;
}
button:hover { background: var(--c10); }
button:active { transform: scale(0.97); }
button:disabled { opacity: 0.4; pointer-events: none; }
button.primary { background: var(--accent); color: var(--accent-ink); }
button.primary:hover { background: var(--accent); filter: brightness(0.95); }
button.ghost { background: transparent; color: var(--c60); }
button.ghost:hover { background: var(--c6); color: var(--fg); }
button.icon { width: 24px; padding: 0; }
button.icon svg { width: 14px; height: 14px; }
button.link { height: auto; padding: 0; background: none; border-radius: 3px; font-weight: 400; justify-content: flex-start; text-align: left; white-space: normal; }
button.link:hover { background: none; color: var(--fg); text-decoration: underline; text-underline-offset: 2px; }
button.link:active { transform: none; }
:focus-visible { outline: 2px solid color-mix(in oklab, var(--accent) 70%, transparent); outline-offset: 1px; }
kbd { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 4px; background: var(--c8); color: var(--c80); font: 500 10px/1 ${MONO_STACK}; }
.toast {
  position: fixed; left: 50%; bottom: 20px; transform: translate(-50%, 0); display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 8px; background: var(--surface); color: var(--fg); box-shadow: var(--shadow); font-weight: 500;
  animation: ck-toast 200ms var(--ease-settle);
}
.toast .swatch { width: 12px; height: 12px; margin: 0; }
@keyframes ck-toast { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
.swatch { display: inline-block; flex: none; width: 10px; height: 10px; margin-right: 6px; border-radius: 3px; box-shadow: inset 0 0 0 1px var(--c15); vertical-align: -1px; }
.chip { position: fixed; padding: 3px 6px; border-radius: 5px; background: var(--fg); color: var(--bg); white-space: nowrap; font-size: 11px; font-weight: 500; pointer-events: none; }
.outline { position: fixed; border: 1px solid var(--accent); border-radius: 2px; pointer-events: none; }
.outline.locked { border-width: 2px; }
.hint { margin: 0; color: var(--c60); padding: 10px 12px; }
.bar {
  position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 4px 4px 4px 12px;
  animation: ck-in 200ms var(--ease-arrive);
}
.bar .title { font-weight: 600; }
.bar .sep { width: 1px; height: 16px; background: var(--c10); }
.bar .tip { color: var(--c60); display: inline-flex; align-items: center; gap: 4px; }
@keyframes ck-in { from { opacity: 0; transform: translateX(-50%) translateY(6px); } to { opacity: 1; transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) {
  button, button:active { transition: none; transform: none; }
  .toast { animation-name: ck-fade; }
  .bar { animation-name: ck-fade; }
  @keyframes ck-fade { from { opacity: 0; } to { opacity: 1; } }
}
@media (forced-colors: active) {
  .card, .toast, .chip { border: 1px solid CanvasText; }
  .outline { border-color: Highlight; }
}
`;

/** Close glyph used by every page tool. Static markup, never page data. */
export function closeIcon(doc: Document): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = doc.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS(ns, "path");
  path.setAttribute("d", "M4 4l8 8M12 4l-8 8");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linecap", "round");
  svg.append(path);
  return svg;
}
