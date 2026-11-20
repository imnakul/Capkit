import { useRef } from "react";

type SegmentedOption<T extends string> = { value: T; label: string; icon?: React.ReactNode };

type SegmentedProps<T extends string> = {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Greys the group out and removes it from the tab order. */
  disabled?: boolean;
};

/**
 * Radio-group semantics: one tab stop, arrow keys move and select, Home/End jump.
 * The selected segment sits on `bg-content/8`.
 */
export function Segmented<T extends string>({ label, value, options, onChange, disabled = false }: SegmentedProps<T>): React.JSX.Element {
  const refs = useRef(new Map<T, HTMLButtonElement>());

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const index = options.findIndex((option) => option.value === value);
    if (index === -1) return;
    const offsets: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      Home: -index,
      End: options.length - 1 - index,
    };
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const next = options[(((index + offset) % options.length) + options.length) % options.length];
    if (next === undefined) return;
    onChange(next.value);
    refs.current.get(next.value)?.focus();
  }

  return (
    <div aria-disabled={disabled} aria-label={label} className={`inline-flex gap-0.5 rounded-md bg-content/6 p-0.5 ${disabled ? "opacity-45" : ""}`} role="radiogroup" onKeyDown={handleKeyDown}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            aria-checked={selected}
            className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium text-content/60 outline-none transition-colors duration-150 ease-track hover:text-content focus-visible:ring-2 focus-visible:ring-accent/50 aria-checked:bg-content/8 aria-checked:text-content motion-reduce:transition-none"
            key={option.value}
            ref={(node: HTMLButtonElement | null): void => {
              if (node === null) refs.current.delete(option.value);
              else refs.current.set(option.value, node);
            }}
            disabled={disabled}
            role="radio"
            tabIndex={selected && !disabled ? 0 : -1}
            type="button"
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
