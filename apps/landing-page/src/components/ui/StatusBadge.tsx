type Status = "Confirmed" | "Provisional";

export function StatusBadge({ status }: { status: Status }): React.JSX.Element {
  const isConfirmed = status === "Confirmed";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.1em] ${
        isConfirmed
          ? "border-focus text-focus"
          : "border-paper/25 text-paper/60"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isConfirmed ? "bg-focus" : "bg-paper/40"}`}
        aria-hidden="true"
      />
      {status}
    </span>
  );
}
