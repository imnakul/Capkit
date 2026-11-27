/** Picker-only rules, added after INSPECTOR_CSS (buttons, chip, outline, toast, focus). Class names are pk-prefixed. */
export const PICKER_CSS = `
.pk-outline { position: fixed; border: 1.5px dashed var(--accent); border-radius: 3px; pointer-events: none; }
.pk-marker { position: fixed; width: 20px; height: 20px; border-radius: 10px; display: grid; place-items: center; background: var(--accent); color: #1b1c1a; font-weight: 700; font-size: 11px; box-shadow: 0 1px 4px rgb(0 0 0 / 45%); pointer-events: none; }
.pk-card { position: fixed; width: 280px; padding: 10px; display: flex; flex-direction: column; gap: 8px; pointer-events: auto; background: #1b1c1a; border: 1px solid rgb(255 255 255 / 9%); border-radius: 10px; box-shadow: 0 12px 32px rgb(0 0 0 / 45%); animation: pk-in 160ms cubic-bezier(0.23, 1, 0.32, 1); }
.pk-who { color: #a9a89f; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-card textarea { font: inherit; width: 100%; min-height: 64px; resize: vertical; padding: 6px 8px; color: #f2f1ec; background: #121311; border: 1px solid rgb(255 255 255 / 14%); border-radius: 6px; }
.pk-card textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 0; }
.pk-actions { display: flex; justify-content: flex-end; gap: 6px; }
button.pk-primary { background: var(--accent); color: #1b1c1a; font-weight: 600; border-color: transparent; }
button.pk-primary:hover { background: var(--accent); opacity: 0.9; }
button:disabled { opacity: 0.4; cursor: default; }
.pk-list { position: fixed; right: 16px; bottom: 16px; width: 300px; max-height: min(60vh, 420px); display: flex; flex-direction: column; pointer-events: auto; background: #1b1c1a; border: 1px solid rgb(255 255 255 / 9%); border-radius: 10px; box-shadow: 0 12px 32px rgb(0 0 0 / 45%); animation: pk-in 160ms cubic-bezier(0.23, 1, 0.32, 1); }
.pk-list header { display: flex; align-items: center; gap: 6px; padding: 8px 10px; background: #242522; border-bottom: 1px solid rgb(255 255 255 / 9%); border-radius: 10px 10px 0 0; }
.pk-list h2 { margin: 0; flex: 1; font-size: 12px; font-weight: 600; }
.pk-count { color: #a9a89f; font-weight: 500; margin-left: 4px; }
.pk-list ol { list-style: none; margin: 0; padding: 4px 0; overflow: auto; }
.pk-list li { display: flex; align-items: flex-start; gap: 8px; padding: 6px 10px; }
.pk-num { flex: 0 0 18px; height: 18px; border-radius: 9px; display: grid; place-items: center; background: var(--accent); color: #1b1c1a; font-weight: 700; font-size: 10px; }
.pk-body { flex: 1; min-width: 0; }
.pk-comment { white-space: pre-wrap; overflow-wrap: anywhere; }
.pk-el { color: #a9a89f; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pk-hint { color: #a9a89f; padding: 10px; }
@keyframes pk-in { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) {
  .pk-card, .pk-list { animation-name: pk-fade; }
  @keyframes pk-fade { from { opacity: 0; } to { opacity: 1; } }
}
`;
