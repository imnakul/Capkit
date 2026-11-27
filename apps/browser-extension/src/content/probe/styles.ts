/** Font and Colour tool rules, added after THEME_CSS. Class names are pb-prefixed. */
export const PROBE_CSS = `
.pb-tip { position: fixed; width: 240px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; pointer-events: none; }
.pb-tip.locked { pointer-events: auto; animation: pb-in 160ms var(--ease-arrive); }
.pb-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.pb-family { font-size: 15px; font-weight: 500; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-el { color: var(--c45); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-grid { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; margin: 0; }
.pb-grid dt { color: var(--c60); }
.pb-grid dd { margin: 0; color: var(--fg); display: flex; align-items: center; min-width: 0; overflow-wrap: anywhere; }
.pb-foot { color: var(--c45); font-size: 11px; padding-top: 6px; border-top: 1px solid var(--c8); }
.pb-swatches { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.pb-swatches li { display: flex; align-items: center; gap: 8px; height: 24px; }
.pb-swatches .swatch { width: 14px; height: 14px; margin: 0; border-radius: 4px; }
.pb-swatches .name { flex: 1; color: var(--c60); }
.pb-swatches button { height: 22px; padding: 0 6px; }
@keyframes pb-in { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) {
  .pb-tip.locked { animation-name: pb-fade; }
  @keyframes pb-fade { from { opacity: 0; } to { opacity: 1; } }
}
`;
