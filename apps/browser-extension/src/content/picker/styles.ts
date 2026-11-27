/** Picker rules, added after THEME_CSS and INSPECTOR_CSS. Class names are pk-prefixed. */
export const PICKER_CSS = `
.pk-outline { position: fixed; border: 1.5px dashed var(--accent); border-radius: 3px; pointer-events: none; }
.pk-marker { position: fixed; width: 20px; height: 20px; border-radius: 10px; display: grid; place-items: center; background: var(--accent); color: var(--accent-ink); font-weight: 600; font-size: 11px; box-shadow: 0 1px 4px rgb(0 0 0 / 35%); pointer-events: none; }
.pk-card { position: fixed; width: 280px; padding: 10px; display: flex; flex-direction: column; gap: 8px; animation: pk-in 180ms var(--ease-arrive); }
.pk-who { color: var(--c60); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-card textarea { font: inherit; width: 100%; min-height: 64px; resize: vertical; padding: 6px 8px; color: var(--fg); background: var(--c4); border: 1px solid var(--c10); border-radius: 6px; }
.pk-card textarea::placeholder { color: var(--c45); }
.pk-card textarea:focus-visible { outline: 2px solid color-mix(in oklab, var(--accent) 70%, transparent); outline-offset: 0; border-color: transparent; }
.pk-actions { display: flex; justify-content: flex-end; align-items: center; gap: 6px; }
.pk-actions .tip { margin-right: auto; color: var(--c45); font-size: 11px; }
.pk-list { position: fixed; right: 16px; bottom: 16px; width: 300px; max-height: min(60vh, 420px); display: flex; flex-direction: column; overflow: hidden; animation: pk-in 180ms var(--ease-arrive); }
.pk-list header { display: flex; align-items: center; gap: 4px; height: 40px; padding: 0 8px 0 12px; border-bottom: 1px solid var(--c8); }
.pk-list h2 { margin: 0; flex: 1; font-size: 13px; font-weight: 600; }
.pk-count { color: var(--c45); font-weight: 500; margin-left: 6px; font-variant-numeric: tabular-nums; }
.pk-list ol { list-style: none; margin: 0; padding: 4px; overflow: auto; overscroll-behavior: contain; }
.pk-list li { display: flex; align-items: flex-start; gap: 8px; padding: 6px 4px 6px 8px; border-radius: 6px; }
.pk-list li:hover { background: var(--c4); }
.pk-list li button { opacity: 0; }
.pk-list li:hover button, .pk-list li button:focus-visible { opacity: 1; }
.pk-num { flex: 0 0 18px; height: 18px; margin-top: 1px; border-radius: 9px; display: grid; place-items: center; background: var(--accent); color: var(--accent-ink); font-weight: 600; font-size: 10px; }
.pk-body { flex: 1; min-width: 0; }
.pk-comment { white-space: pre-wrap; overflow-wrap: anywhere; }
.pk-el { color: var(--c45); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-hint { margin: 0; color: var(--c60); padding: 12px; }
@keyframes pk-in { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) {
  .pk-card, .pk-list { animation-name: pk-fade; }
  .pk-list li button { opacity: 1; }
  @keyframes pk-fade { from { opacity: 0; } to { opacity: 1; } }
}
@media (hover: none) { .pk-list li button { opacity: 1; } }
`;
