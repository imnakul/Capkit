type IconName = "arrow" | "blur" | "text" | "counter" | "pin";

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function ArrowGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
      <path d="M4 14 14 4" {...strokeProps} />
      <path d="M7 4h7v7" {...strokeProps} />
    </svg>
  );
}

function BlurGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
      <circle cx="9" cy="9" r="6" strokeDasharray="1.6 2.4" {...strokeProps} />
    </svg>
  );
}

function TextGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
      <path d="M4 4h10M9 4v10" {...strokeProps} />
    </svg>
  );
}

function CounterGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
      <circle cx="9" cy="9" r="7" {...strokeProps} />
      <text x="9" y="12.5" textAnchor="middle" fontSize="8" fill="currentColor" stroke="none" fontFamily="var(--font-jetbrains)">
        2
      </text>
    </svg>
  );
}

function PinGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
      <path d="M9 3v5.5L12 11H6l3-2.5V3Z" {...strokeProps} />
      <path d="M9 11v4" {...strokeProps} />
    </svg>
  );
}

const glyphs: Record<IconName, () => React.JSX.Element> = {
  arrow: ArrowGlyph,
  blur: BlurGlyph,
  text: TextGlyph,
  counter: CounterGlyph,
  pin: PinGlyph,
};

export function ToolIcon({ name }: { name: IconName }): React.JSX.Element {
  const Glyph = glyphs[name];
  return <Glyph />;
}

export type { IconName };
