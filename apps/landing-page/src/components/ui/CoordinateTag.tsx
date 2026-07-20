export function CoordinateTag({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded-[4px] border border-focus/40 bg-black/40 px-2 py-1 font-mono text-[11px] tracking-[0.04em] text-focus ${className}`}
    >
      {children}
    </span>
  );
}
