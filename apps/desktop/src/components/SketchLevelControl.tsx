import { SKETCH_LEVELS, type SketchLevel } from "../domain/strokeGeometry";

const LABELS: Record<SketchLevel, string> = { neat: "Neat", loose: "Loose", wild: "Wild" };

type SketchLevelControlProps = {
  value: SketchLevel;
  onChange: (level: SketchLevel) => void;
};

/** Neat / Loose / Wild picker for the dark tool strips; arrow keys move between options. */
export function SketchLevelControl({ value, onChange }: SketchLevelControlProps): React.JSX.Element {
  return (
    <div
      aria-label="Sketch level"
      className="flex gap-0.5 rounded-lg bg-white/6 p-0.5"
      role="radiogroup"
      onKeyDown={(event) => {
        const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
        if (delta === 0) return;
        event.preventDefault();
        const index = SKETCH_LEVELS.indexOf(value);
        const next = SKETCH_LEVELS[(index + delta + SKETCH_LEVELS.length) % SKETCH_LEVELS.length];
        if (next === undefined) return;
        onChange(next);
        event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[SKETCH_LEVELS.indexOf(next)]?.focus();
      }}
    >
      {SKETCH_LEVELS.map((level) => {
        const selected = level === value;
        return (
          <button
            aria-checked={selected}
            className={`h-7 rounded-md px-2 text-[11px] font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-lime-300 ${selected ? "bg-lime-300 text-[#11130f]" : "text-stone-300 hover:bg-white/9 hover:text-white"}`}
            key={level}
            role="radio"
            tabIndex={selected ? 0 : -1}
            type="button"
            onClick={() => onChange(level)}
          >
            {LABELS[level]}
          </button>
        );
      })}
    </div>
  );
}
