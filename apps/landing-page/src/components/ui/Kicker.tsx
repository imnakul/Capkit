type KickerProps = {
  index: string;
  label: string;
  tone?: "dark" | "light";
};

export function Kicker({ index, label, tone = "light" }: KickerProps): React.JSX.Element {
  const dot = tone === "light" ? "bg-ink" : "bg-paper";
  const text = tone === "light" ? "text-ink/50" : "text-paper/50";

  return (
    <div className="flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.18em]">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      <span className={text}>{index}</span>
      <span className={text}>/</span>
      <span className={tone === "light" ? "text-ink" : "text-paper"}>{label}</span>
    </div>
  );
}
