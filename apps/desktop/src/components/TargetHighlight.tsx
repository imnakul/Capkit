import type { Rect } from "../domain/capture";
import { prefersReducedMotion } from "../lib/motion";

/** Fast enough to stay with the cursor, long enough to read as a glide. */
export const TARGET_GLIDE =
  "left 140ms cubic-bezier(0.22, 1, 0.36, 1), top 140ms cubic-bezier(0.22, 1, 0.36, 1), width 140ms cubic-bezier(0.22, 1, 0.36, 1), height 140ms cubic-bezier(0.22, 1, 0.36, 1)";

type TargetHighlightProps = {
  bounds: Rect;
  label: string;
};

/**
 * The hover outline in detection mode. It stays mounted while the pointer moves
 * between targets, so changing `bounds` glides it to the next target. The first
 * appearance is instant because a freshly mounted element has nothing to
 * transition from.
 */
export function TargetHighlight({ bounds, label }: TargetHighlightProps): React.JSX.Element {
  return (
    <div
      aria-label={label}
      className="pointer-events-none absolute z-10 border-2 border-lime-300/95 bg-lime-300/8 shadow-[0_0_0_1px_rgba(0,0,0,0.72),0_0_24px_rgba(217,255,67,0.12)]"
      data-testid="target-highlight"
      style={{
        height: bounds.height,
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        transition: prefersReducedMotion() ? undefined : TARGET_GLIDE,
      }}
    />
  );
}
