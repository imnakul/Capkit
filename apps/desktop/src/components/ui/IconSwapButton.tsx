import { playSoftClick } from "../../lib/clickSound";

type IconSwapButtonProps = {
  label: string;
  /** Screen-reader text for each state, announced politely when it changes. */
  statusText: { off: string; on: string };
  active: boolean;
  /** Pixels from the card's right edge; lets several actions sit side by side. */
  offsetRightClass: string;
  /** Keep the button visible when `active`, instead of only on card hover/focus. */
  persistWhenActive?: boolean;
  idleIcon: React.ReactNode;
  activeIcon: React.ReactNode;
  onPress: () => void;
};


const layerClass = "col-start-1 row-start-1 transition-[opacity,transform] duration-300 ease-settle motion-reduce:transition-none";

/**
 * Frosted, hover-revealed card action whose icon glides into another icon when `active`
 * turns true. Pressing it dips to 0.96 and ticks at once, before any async work. It is
 * icon-only, so the button never resizes; the name lives in `aria-label` and a live region.
 */
export function IconSwapButton({
  label,
  statusText,
  active,
  offsetRightClass,
  persistWhenActive = false,
  idleIcon,
  activeIcon,
  onPress,
}: IconSwapButtonProps): React.JSX.Element {
  const visibility = persistWhenActive && active ? "opacity-100" : "opacity-0";
  return (
    <button
      aria-label={label}
      className={`absolute top-2 ${offsetRightClass} ${visibility} grid size-7 cursor-pointer place-items-center rounded-md border border-content/15 bg-background-base/50 text-content outline-none backdrop-blur-xl backdrop-saturate-150 transition-[opacity,transform] duration-150 hover:bg-background-base/70 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 group-focus-within:opacity-100 group-hover:opacity-100`}
      type="button"
      onClick={() => {
        playSoftClick();
        onPress();
      }}
    >
      <span aria-hidden="true" className="grid size-3.5 place-items-center">
        <span className={`${layerClass} col-start-1 row-start-1 ${active ? "-rotate-12 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"}`}>{idleIcon}</span>
        <span className={`${layerClass} ${active ? "rotate-0 scale-100 opacity-100" : "rotate-12 scale-50 opacity-0"}`}>{activeIcon}</span>
      </span>
      <span aria-live="polite" className="sr-only">
        {active ? statusText.on : statusText.off}
      </span>
    </button>
  );
}
