type CornerMarksProps = {
  className?: string;
  color?: string;
};

/** Decorative crosshair corner marks — echoes the frozen-screen selection frame. */
export function CornerMarks({ className = "", color = "currentColor" }: CornerMarksProps): React.JSX.Element {
  const armSize = 14;
  const arm = (position: string): React.JSX.Element => (
    <span
      key={position}
      className={`absolute h-3.5 w-3.5 ${position}`}
      style={{
        borderColor: color,
        borderStyle: "solid",
        borderWidth:
          position === "top-0 left-0"
            ? "2px 0 0 2px"
            : position === "top-0 right-0"
              ? "2px 2px 0 0"
              : position === "bottom-0 left-0"
                ? "0 0 2px 2px"
                : "0 2px 2px 0",
      }}
      aria-hidden="true"
    />
  );

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} style={{ padding: 0 }}>
      <div className="relative h-full w-full" style={{ ["--arm" as string]: `${armSize}px` }}>
        {arm("top-0 left-0")}
        {arm("top-0 right-0")}
        {arm("bottom-0 left-0")}
        {arm("bottom-0 right-0")}
      </div>
    </div>
  );
}
