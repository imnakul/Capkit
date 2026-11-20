import { FILL_STYLES, type FillStyle } from "../domain/strokeGeometry";

const LABELS: Record<FillStyle, string> = {
  none: "No fill",
  solid: "Solid fill",
  hachure: "Hatching",
  "cross-hatch": "Cross-hatch",
  zigzag: "Zigzag",
  dots: "Dots",
};

export function FillPreview({ fill }: { fill: FillStyle }): React.JSX.Element {
  const clipId = `fill-preview-${fill}`;
  return (
    <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
      <defs>
        <clipPath id={clipId}>
          <rect height="12" rx="2" width="12" x="2" y="2" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`} fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2">
        {fill === "solid" ? <rect fill="currentColor" height="12" width="12" x="2" y="2" /> : null}
        {fill === "hachure" || fill === "cross-hatch" ? (
          <path d="M0 12 L12 0 M0 16 L16 0 M4 16 L16 4 M8 16 L16 8 M0 8 L8 0 M0 4 L4 0" />
        ) : null}
        {fill === "cross-hatch" ? <path d="M0 4 L12 16 M0 0 L16 16 M4 0 L16 12 M8 0 L16 8 M0 8 L8 16" /> : null}
        {fill === "zigzag" ? <path d="M2 4 L14 4 L2 7 L14 7 L2 10 L14 10 L2 13 L14 13" /> : null}
        {fill === "dots" ? (
          <g fill="currentColor" stroke="none">
            {[4.5, 8, 11.5].flatMap((cx) =>
              [4.5, 8, 11.5].map((cy) => <circle cx={cx} cy={cy} key={`${String(cx)}:${String(cy)}`} r="1" />),
            )}
          </g>
        ) : null}
      </g>
      <rect fill="none" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" width="12" x="2" y="2" />
    </svg>
  );
}

type FillStyleControlProps = {
  value: FillStyle;
  onChange: (fill: FillStyle) => void;
  /** Fill styles on offer; Screen Draw has no solid fill. */
  options?: readonly FillStyle[];
};

/** Fill picker with a small icon preview per style for the dark tool strips; arrow keys move between options. */
export function FillStyleControl({ value, onChange, options = FILL_STYLES }: FillStyleControlProps): React.JSX.Element {
  return (
    <div
      aria-label="Fill style"
      className="flex gap-0.5 rounded-lg bg-white/6 p-0.5"
      role="radiogroup"
      onKeyDown={(event) => {
        const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
        if (delta === 0) return;
        event.preventDefault();
        const index = options.indexOf(value);
        const next = options[(index + delta + options.length) % options.length];
        if (next === undefined) return;
        onChange(next);
        event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[options.indexOf(next)]?.focus();
      }}
    >
      {options.map((fill) => {
        const selected = fill === value;
        return (
          <button
            aria-checked={selected}
            aria-label={LABELS[fill]}
            className={`grid size-7 place-items-center rounded-md outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-lime-300 ${selected ? "bg-lime-300 text-[#11130f]" : "text-stone-300 hover:bg-white/9 hover:text-white"}`}
            key={fill}
            role="radio"
            tabIndex={selected ? 0 : -1}
            title={LABELS[fill]}
            type="button"
            onClick={() => onChange(fill)}
          >
            <FillPreview fill={fill} />
          </button>
        );
      })}
    </div>
  );
}
