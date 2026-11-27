/** Inspector rules, added after THEME_CSS. No gradients on surfaces, no transition: all; reduced motion keeps opacity only. */
export const INSPECTOR_CSS = `
.band { position: fixed; pointer-events: none; }
.band.margin { background: color-mix(in srgb, var(--accent) 22%, transparent); }
.band.padding { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--accent) 32%, transparent) 0 2px, transparent 2px 6px); }
.line { position: fixed; background: var(--accent); pointer-events: none; }
.line.h { height: 1px; }
.line.v { width: 1px; }
.cap { position: fixed; background: var(--accent); pointer-events: none; }
.pill { position: fixed; padding: 1px 5px; border-radius: 4px; background: var(--accent); color: var(--accent-ink); font-size: 10px; font-weight: 600; pointer-events: none; transform: translate(-50%, -50%); }
.panel {
  position: fixed; width: 320px; max-height: calc(100vh - 24px); overflow: auto; overscroll-behavior: contain;
  opacity: 0; transform: scale(0.97); transform-origin: top right;
  transition: opacity 180ms var(--ease-arrive), transform 180ms var(--ease-arrive);
}
.panel.open { opacity: 1; transform: scale(1); }
.panel.closing { opacity: 0; transform: scale(0.97); transition-duration: 120ms; }
.panel header { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 4px; height: 40px; padding: 0 8px 0 12px; cursor: grab; background: var(--surface); border-bottom: 1px solid var(--c8); user-select: none; }
.panel header:active { cursor: grabbing; }
.panel h2 { margin: 0; flex: 1; font-size: 13px; font-weight: 600; }
.panel section, .panel details { padding: 8px 12px; border-bottom: 1px solid var(--c8); }
.panel details:last-child { border-bottom: 0; }
.panel summary { cursor: pointer; padding: 2px 0 4px; font-weight: 500; color: var(--c60); list-style: none; display: flex; align-items: center; gap: 6px; }
.panel summary::-webkit-details-marker { display: none; }
.panel summary::before { content: ""; width: 5px; height: 5px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(-45deg); transition: transform 160ms var(--ease-settle); }
.panel details[open] > summary::before { transform: rotate(45deg); }
.panel summary:hover { color: var(--fg); }
.row { display: flex; align-items: baseline; gap: 8px; padding: 3px 0; }
.row .k { flex: 0 0 80px; color: var(--c60); }
.row .v { flex: 1; min-width: 0; overflow-wrap: anywhere; color: var(--c80); }
.box { display: grid; place-items: center; gap: 4px; margin-top: 6px; padding: 6px; border: 1px dashed var(--c15); border-radius: 6px; font-size: 10px; color: var(--c60); text-align: center; }
.box .inner { width: 100%; padding: 6px; border: 1px solid var(--c15); border-radius: 4px; }
.box .inner div { color: var(--fg); }
.badge { display: inline-block; padding: 1px 5px; border-radius: 4px; background: color-mix(in oklab, var(--success) 18%, transparent); color: var(--success); font-weight: 600; font-size: 10px; }
.badge.fail { background: color-mix(in oklab, var(--danger) 18%, transparent); color: var(--danger); }
@media (prefers-reduced-motion: reduce) {
  .panel, .panel.closing { transform: none; }
}
`;
