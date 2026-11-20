import { playSoftClick } from "../../lib/clickSound";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name of the switch. */
  label: string;
  disabled?: boolean;
};

/**
 * The one on/off control in the dashboard. A visually hidden checkbox with
 * `role="switch"` sits inside a `<label>`, so a click anywhere on the 28×16
 * track toggles it, with native keyboard and focus behaviour. Toggling ticks softly
 * and dips the control, matching the copy buttons.
 */
export function Switch({ checked, onChange, label, disabled = false }: SwitchProps): React.JSX.Element {
  return (
    <label className={`relative inline-flex shrink-0 py-1 transition-transform duration-150 ease-track motion-reduce:transition-none ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer active:scale-[0.96] motion-reduce:active:scale-100"}`}>
      <input
        aria-label={label}
        checked={checked}
        className="peer sr-only"
        disabled={disabled}
        role="switch"
        type="checkbox"
        onChange={(event) => {
          playSoftClick();
          onChange(event.currentTarget.checked);
        }}
      />
      <span className="block h-4 w-7 rounded-full bg-content/15 transition-colors duration-150 ease-track peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background-base motion-reduce:transition-none" />
      <span className="pointer-events-none absolute left-0.5 top-1.5 size-3 rounded-full bg-white shadow-sm transition-transform duration-150 ease-track peer-checked:translate-x-3 peer-checked:bg-accent-ink motion-reduce:transition-none" />
    </label>
  );
}
