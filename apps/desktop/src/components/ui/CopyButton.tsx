import { playSoftClick } from "../../lib/clickSound";
import { Copy, Tick } from "../icons";

type CopyButtonProps = {
  label: string;
  copied: boolean;
  onCopy: () => void;
};

const layer = "col-start-1 row-start-1 transition-[opacity,transform] duration-300 ease-settle motion-reduce:transition-none";

/**
 * Hover-revealed copy action for a card. Pressing it dips to 0.96 and ticks at once;
 * the copy icon then glides into a check when `copied` turns true. It is icon-only (the
 * name is in `aria-label` and a live region), so the button never resizes, and it
 * uses frosted theme surfaces rather than fixed black or white.
 */
export function CopyButton({ label, copied, onCopy }: CopyButtonProps): React.JSX.Element {
  return (
    <button
      aria-label={label}
      className="absolute right-2 top-2 grid size-7 cursor-pointer place-items-center rounded-md border border-content/15 bg-background-base/50 text-content opacity-0 outline-none backdrop-blur-xl backdrop-saturate-150 transition-[opacity,transform] duration-150 hover:bg-background-base/70 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 group-focus-within:opacity-100 group-hover:opacity-100"
      type="button"
      onClick={() => {
        playSoftClick();
        onCopy();
      }}
    >
      <span aria-hidden="true" className="grid size-3.5 place-items-center">
        <Copy className={`${layer} ${copied ? "-rotate-12 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"}`} size={14} />
        <Tick className={`${layer} ${copied ? "rotate-0 scale-100 opacity-100" : "rotate-12 scale-50 opacity-0"}`} size={14} />
      </span>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
