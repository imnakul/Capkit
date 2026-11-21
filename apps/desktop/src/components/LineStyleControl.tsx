import type { StrokeStyle } from "../domain/strokeGeometry";
import { LineStyleDashed, LineStyleDotted, LineStyleSketchy, LineStyleSolid, type CapkitIconComponent } from "./icons";

const OPTIONS: readonly { id: StrokeStyle; label: string; icon: CapkitIconComponent }[] = [
  { id: "solid", label: "Solid", icon: LineStyleSolid },
  { id: "dashed", label: "Dashed", icon: LineStyleDashed },
  { id: "dotted", label: "Dotted", icon: LineStyleDotted },
  { id: "sketchy", label: "Sketchy", icon: LineStyleSketchy },
];

type LineStyleControlProps = {
  value: StrokeStyle;
  onChange: (style: StrokeStyle) => void;
};

/** Four-way line style picker for the dark tool strips; arrow keys move between options. */
export function LineStyleControl({ value, onChange }: LineStyleControlProps): React.JSX.Element {
  return (
    <div
      aria-label="Line style"
      className="flex gap-0.5 rounded-lg bg-white/6 p-0.5"
      role="radiogroup"
      onKeyDown={(event) => {
        const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
        if (delta === 0) return;
        event.preventDefault();
        const index = OPTIONS.findIndex((option) => option.id === value);
        const next = OPTIONS[(index + delta + OPTIONS.length) % OPTIONS.length];
        if (next === undefined) return;
        onChange(next.id);
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
        buttons[OPTIONS.indexOf(next)]?.focus();
      }}
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = option.id === value;
        return (
          <button
            aria-checked={selected}
            aria-label={option.label}
            className={`grid size-7 place-items-center rounded-md outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-lime-300 ${selected ? "bg-lime-300 text-[#11130f]" : "text-stone-300 hover:bg-white/9 hover:text-white"}`}
            key={option.id}
            role="radio"
            tabIndex={selected ? 0 : -1}
            title={option.label}
            type="button"
            onClick={() => onChange(option.id)}
          >
            <Icon size={16} strokeWidth={selected ? 2.2 : 1.8} />
          </button>
        );
      })}
    </div>
  );
}
