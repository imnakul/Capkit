import { ChevronDown, RotateCounterClockwise, type CapkitIconComponent } from "../../icons";
import { useId, useState } from "react";
import { Switch } from "../../ui/Switch";

/*
 * Text scale.
 *
 * Calibrated against desktop editors such as Notion, whose chrome sits at 14px
 * with 12px for secondary meta. A dense inspector reads one step tighter, so
 * labels and controls are 13px and supporting text is 12px. Nothing goes below
 * 12px: the previous 9–10px rail was measurably hard to read at 100% scaling.
 */

const labelClass = "text-[13px] font-medium text-content";
const metaClass = "text-[12px] text-content/60";
const controlClass =
  "rounded-md border border-content/10 bg-content/4 text-content outline-none transition-colors duration-120 motion-reduce:transition-none hover:border-content/15 hover:text-content focus-visible:ring-2 focus-visible:ring-accent/50";

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
    <section className="overflow-hidden rounded-md border border-content/10 bg-content/4">
      <div className="flex items-center">
        <button
          aria-controls={contentId}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2.5 text-left outline-none transition-colors duration-120 motion-reduce:transition-none hover:bg-content/8 focus-visible:ring-2 focus-visible:ring-accent/50"
          type="button"
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown
            aria-hidden="true"
            className={`shrink-0 text-content/45 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
            size={14}
          />
          <Icon aria-hidden="true" className="shrink-0 text-content/45" size={14} />
          <span className="truncate text-[13px] font-semibold text-content">{title}</span>
          {count === undefined ? null : <span className="ml-auto shrink-0 font-mono text-[12px] text-content/45">{count}</span>}
        </button>
        {onReset === undefined || resetLabel === undefined ? null : (
          <button
            aria-label={resetLabel}
            className="mr-1 grid size-7 place-items-center rounded text-content/45 outline-none transition-colors duration-120 motion-reduce:transition-none hover:bg-content/8 hover:text-content focus-visible:ring-2 focus-visible:ring-accent/50"
            title={resetLabel}
            type="button"
            onClick={onReset}
          >
            <RotateCounterClockwise aria-hidden="true" size={13} />
          </button>
        )}
        {action}
      </div>
      <div className="space-y-3.5 border-t border-content/10 px-2.5 py-3" hidden={!open} id={contentId}>
        {children}
      </div>
    </section>
  );
}

export function PanelHeading({
  title,
  resetLabel,
  onReset,
}: {
  title: string;
  resetLabel: string;
  onReset: () => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="truncate text-[14px] font-semibold text-content">{title}</h2>
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
        <span className="font-mono text-[12px] font-normal text-content/45">
          {value}
          {suffix}
        </span>
      </span>
      {hint === undefined ? null : <span className={`mt-0.5 block ${metaClass}`}>{hint}</span>}
      <input
        aria-label={ariaLabel ?? label}
        className="mt-2 h-1.5 w-full cursor-pointer accent-accent"
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
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className={labelClass}>{label}</span>
      <Switch checked={checked} disabled={disabled} label={label} onChange={onChange} />
    </div>
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
      className="rounded-md border border-content/10 bg-content/4 px-2 py-1.5 text-[12px] font-semibold text-content/80 outline-none transition-colors duration-120 motion-reduce:transition-none hover:border-content/15 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:border-content/25 aria-pressed:bg-content/10 aria-pressed:text-content"
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
      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-content/10 bg-content/4 px-2 py-1.5 text-[12px] font-semibold text-content/80 outline-none transition-colors duration-120 motion-reduce:transition-none hover:border-content/15 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:border-content/25 aria-pressed:bg-content/10 aria-pressed:text-content"
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
        className="size-8 cursor-pointer rounded border border-content/10 bg-transparent p-0.5"
        type="color"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <span className={labelClass}>{label}</span>
      <span className="ml-auto font-mono text-[12px] text-content/45">{value}</span>
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
        className="mt-1 h-8 w-full rounded-md border border-content/10 bg-content/4 px-2 text-[13px] text-content outline-none transition-colors duration-120 motion-reduce:transition-none focus:border-content/40 focus:ring-2 focus:ring-accent/50"
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
        className="mt-1.5 h-8 w-full rounded-md border border-content/10 bg-content/4 px-2.5 text-[13px] text-content outline-none transition-colors duration-120 motion-reduce:transition-none focus:border-content/40 focus:ring-2 focus:ring-accent/50"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}
