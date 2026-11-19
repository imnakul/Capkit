/** Stylesheet for the closed shadow root. No gradients, no transition: all, reduced motion keeps opacity only. */
export const INSPECTOR_CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.root { position: fixed; inset: 0; pointer-events: none; font: 12px/1.45 "CapKit Sans", "Plus Jakarta Sans", system-ui, sans-serif; color: #f2f1ec; }
.mono { font-family: "CapKit Mono", "JetBrains Mono", ui-monospace, Consolas, monospace; font-variant-numeric: tabular-nums; }
.outline { position: fixed; border: 1px solid #d9ff43; pointer-events: none; }
.outline.locked { box-shadow: 0 0 0 1px rgb(0 0 0 / 55%); }
.band { position: fixed; pointer-events: none; }
.band.margin { background: rgb(217 255 67 / 25%); }
.band.padding { background: repeating-linear-gradient(135deg, rgb(217 255 67 / 35%) 0 2px, transparent 2px 6px); }
.chip { position: fixed; padding: 2px 6px; border-radius: 4px; background: #1b1c1a; color: #d9ff43; border: 1px solid rgb(255 255 255 / 9%); white-space: nowrap; font-size: 11px; pointer-events: none; }
.line { position: fixed; background: #d9ff43; pointer-events: none; }
.line.h { height: 1px; }
.line.v { width: 1px; }
.cap { position: fixed; background: #d9ff43; pointer-events: none; }
.pill { position: fixed; padding: 1px 5px; border-radius: 3px; background: #1b1c1a; color: #d9ff43; font-size: 10px; pointer-events: none; transform: translate(-50%, -50%); }
.panel { position: fixed; width: 320px; max-height: calc(100vh - 24px); overflow: auto; pointer-events: auto; background: #1b1c1a; color: #f2f1ec; border: 1px solid rgb(255 255 255 / 9%); border-radius: 10px; box-shadow: 0 12px 32px rgb(0 0 0 / 45%); opacity: 0; transform: scale(0.97); transition: opacity 160ms cubic-bezier(0.23, 1, 0.32, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1); }
.panel.open { opacity: 1; transform: scale(1); }
.panel.closing { opacity: 0; transform: scale(0.97); transition-duration: 120ms; }
.panel header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: grab; background: #242522; border-bottom: 1px solid rgb(255 255 255 / 9%); user-select: none; }
.panel header:active { cursor: grabbing; }
.panel h2 { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 0.01em; flex: 1; }
.panel section, .panel details { padding: 8px 12px; border-bottom: 1px solid rgb(255 255 255 / 9%); }
.panel summary { cursor: pointer; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #a9a89f; padding: 2px 0; }
.row { display: flex; align-items: baseline; gap: 8px; padding: 2px 0; }
.row .k { flex: 0 0 76px; color: #a9a89f; }
.row .v { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.swatch { display: inline-block; width: 10px; height: 10px; margin-right: 6px; border-radius: 2px; border: 1px solid rgb(255 255 255 / 25%); vertical-align: -1px; }
button { font: inherit; color: inherit; background: #2d2e2b; border: 1px solid rgb(255 255 255 / 9%); border-radius: 5px; padding: 2px 7px; cursor: pointer; transition: transform 100ms cubic-bezier(0.23, 1, 0.32, 1), background-color 100ms cubic-bezier(0.23, 1, 0.32, 1); }
button:hover { background: #383935; }
button:active { transform: scale(0.97); }
button.link { background: none; border: none; padding: 0; text-align: left; }
button.link:hover { color: #d9ff43; background: none; }
:focus-visible { outline: 2px solid #d9ff43; outline-offset: 1px; }
.box { display: grid; place-items: center; gap: 4px; padding: 6px; border: 1px dashed rgb(255 255 255 / 25%); border-radius: 4px; font-size: 10px; text-align: center; }
.box .inner { width: 100%; padding: 6px; border: 1px solid rgb(255 255 255 / 25%); }
.badge { display: inline-block; padding: 0 5px; border-radius: 3px; background: #d9ff43; color: #1b1c1a; font-weight: 700; font-size: 10px; }
.badge.fail { background: #ff6b5e; }
.toast { position: fixed; left: 50%; bottom: 20px; transform: translate(-50%, 0); padding: 6px 12px; border-radius: 6px; background: #1b1c1a; border: 1px solid rgb(255 255 255 / 9%); color: #f2f1ec; animation: toast-in 180ms cubic-bezier(0.23, 1, 0.32, 1); }
@keyframes toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
.hint { color: #a9a89f; padding: 8px 12px; }
@media (prefers-reduced-motion: reduce) {
  .panel, .panel.closing { transform: none; }
  .toast { animation-name: toast-fade; }
  @keyframes toast-fade { from { opacity: 0; } to { opacity: 1; } }
  button:active { transform: none; }
}
`;
