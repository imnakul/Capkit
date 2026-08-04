import { ChevronDown, RotateCounterClockwise, type CapkitIconComponent } from "../../icons";
import { useId, useState } from "react";

/*
 * Text scale.
 *
 * Calibrated against desktop editors such as Notion, whose chrome sits at 14px
 * with 12px for secondary meta. A dense inspector reads one step tighter, so
 * labels and controls are 13px and supporting text is 12px. Nothing goes below
 * 12px: the previous 9–10px rail was measurably hard to read at 100% scaling.
 */

const labelClass = "text-[13px] font-medium text-stone-700 dark:text-stone-200";
const metaClass = "text-[12px] text-stone-500 dark:text-stone-400";
const controlClass =
  "rounded-md border border-stone-300 bg-white/70 text-stone-700 outline-none transition hover:border-stone-500 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:border-white/12 dark:bg-white/5 dark:text-stone-200 dark:hover:border-white/25 dark:hover:text-white";

/** Section wrapper that folds its body away, with an optional inline reset. */
export function CollapsibleSection({
  title,
  icon: Icon,
  count,
  defaultOpen = false,
  action,
  resetLabel,
  onReset,
  children,
}: {
  title: string;
  icon: CapkitIconComponent;
  count?: number;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  resetLabel?: string;
  onReset?: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  return (
    <section className="overflow-hidden rounded-md border border-stone-200 bg-white/45 dark:border-white/8 dark:bg-white/[0.02]">
      <div className="flex items-center">
        <button
          aria-controls={contentId}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2.5 text-left outline-none transition hover:bg-stone-200/40 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:hover:bg-white/5"
          type="button"
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown
            aria-hidden="true"
            className={`shrink-0 text-stone-400 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
            size={14}
          />
          <Icon aria-hidden="true" className="shrink-0 text-stone-400" size={14} />
          <span className="truncate text-[13px] font-semibold text-stone-700 dark:text-stone-200">{title}</span>
          {count === undefined ? null : <span className="ml-auto shrink-0 font-mono text-[12px] text-stone-400">{count}</span>}
        </button>
        {onReset === undefined || resetLabel === undefined ? null : (
          <button
            aria-label={resetLabel}
            className="mr-1 grid size-7 place-items-center rounded text-stone-400 outline-none transition hover:bg-stone-200/70 hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:hover:bg-white/10 dark:hover:text-white"
            title={resetLabel}
            type="button"
            onClick={onReset}
          >
            <RotateCounterClockwise aria-hidden="true" size={13} />
          </button>
        )}
        {action}
      </div>
      <div className="space-y-3.5 border-t border-stone-200 px-2.5 py-3 dark:border-white/8" hidden={!open} id={contentId}>
        {children}
      </div>
    </section>
  );
}

export function PanelHeading({
  eyebrow,
  title,
  resetLabel,
  onReset,
}: {
  eyebrow: string;
  title: string;
  resetLabel: string;
  onReset: () => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400 dark:text-stone-500">{eyebrow}</p>
        <h2 className="mt-0.5 truncate text-[14px] font-semibold tracking-[-0.01em] text-stone-800 dark:text-stone-100">{title}</h2>
      </div>
      <button
        aria-label={resetLabel}
        className={`${controlClass} inline-flex shrink-0 items-center gap-1 px-2 py-1.5 text-[12px] font-semibold`}
        type="button"
        onClick={onReset}
      >
        <RotateCounterClockwise aria-hidden="true" size={12} />
        Reset
      </button>
    </div>
  );
}

export function ControlLabel({ label, hint }: { label: string; hint?: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className={labelClass}>{label}</p>
      {hint === undefined ? null : <p className={`${metaClass} text-right`}>{hint}</p>}
    </div>
  );
}

export function Slider({
  label,
  ariaLabel,
  hint,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  ariaLabel?: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <label className="block">
      <span className={`flex items-baseline justify-between ${labelClass}`}>
        <span>{label}</span>
        <span className="font-mono text-[12px] font-normal text-stone-400">
          {value}
          {suffix}
        </span>
      </span>
      {hint === undefined ? null : <span className={`mt-0.5 block ${metaClass}`}>{hint}</span>}
      <input
        aria-label={ariaLabel ?? label}
        className="mt-2 h-1.5 w-full cursor-pointer accent-[var(--snaphub-accent)]"
        max={max}
        min={min}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-0.5">
      <span className={labelClass}>{label}</span>
      <span className="relative shrink-0">
        <input
          aria-label={label}
          checked={checked}
          className="peer sr-only"
          role="switch"
          type="checkbox"
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span className="block h-5 w-9 rounded-full bg-stone-300 transition peer-checked:bg-[var(--snaphub-accent)] dark:bg-stone-700" />
        <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4 peer-checked:bg-[#171815]" />
      </span>
    </label>
  );
}

export function Chip({
  label,
  active,
  children,
  onClick,
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className="rounded-md border border-stone-200 bg-white/70 px-2 py-1.5 text-[12px] font-semibold text-stone-600 outline-none transition hover:border-stone-400 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-pressed:border-stone-900 aria-pressed:bg-stone-900 aria-pressed:text-white dark:border-white/8 dark:bg-white/5 dark:text-stone-300 dark:aria-pressed:border-white dark:aria-pressed:bg-white dark:aria-pressed:text-stone-900"
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button aria-label={label} className={`${controlClass} grid size-8 place-items-center`} title={label} type="button" onClick={onClick}>
      {children}
    </button>
  );
}

export function ToggleButton({
  label,
  active,
  children,
  onClick,
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-stone-300 bg-white/70 px-2 py-1.5 text-[12px] font-semibold text-stone-600 outline-none transition hover:border-stone-500 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-pressed:border-stone-900 aria-pressed:bg-stone-900 aria-pressed:text-white dark:border-white/12 dark:bg-white/5 dark:text-stone-300 dark:aria-pressed:border-white dark:aria-pressed:bg-white dark:aria-pressed:text-stone-900"
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <input
        aria-label={label}
        className="size-8 cursor-pointer rounded border border-stone-300 bg-transparent p-0.5 dark:border-white/15"
        type="color"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <span className={labelClass}>{label}</span>
      <span className="ml-auto font-mono text-[12px] text-stone-400">{value}</span>
    </div>
  );
}

export function NumberField({
  label,
  ariaLabel,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <label className="block flex-1">
      <span className={metaClass}>{label}</span>
      <input
        aria-label={ariaLabel}
        className="mt-1 h-8 w-full rounded-md border border-stone-300 bg-white/75 px-2 text-[13px] text-stone-800 outline-none transition focus:border-stone-700 focus:ring-2 focus:ring-[var(--snaphub-accent)] dark:border-white/10 dark:bg-white/5 dark:text-stone-100"
        max={max}
        min={min}
        type="number"
        value={value}
        onChange={(event) => {
          const parsed = Number(event.currentTarget.value);
          if (Number.isFinite(parsed)) onChange(Math.min(Math.max(parsed, min), max));
        }}
      />
    </label>
  );
}

export function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        aria-label={label}
        className="mt-1.5 h-8 w-full rounded-md border border-stone-300 bg-white/75 px-2.5 text-[13px] text-stone-800 outline-none transition focus:border-stone-700 focus:ring-2 focus:ring-[var(--snaphub-accent)] dark:border-white/10 dark:bg-white/5 dark:text-stone-100"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}
