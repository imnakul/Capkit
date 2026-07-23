type GhostNumeralProps = {
  index: string;
  tone?: "dark" | "light";
};

/** Oversized faint section number — reinforces the coordinate/index motif at poster scale. */
export function GhostNumeral({ index, tone = "light" }: GhostNumeralProps): React.JSX.Element {
  return (
    <span
      className={`ghost-numeral ${tone === "light" ? "text-ink/[0.04]" : "text-paper/[0.05]"}`}
      aria-hidden="true"
    >
      {index}
    </span>
  );
}
