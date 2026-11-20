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
 * the copy icon then glides into a check when `copied` turns true. The icons are stacked and
 * cross-faded in a fixed box and the label keeps its width, so nothing shifts.
 */
export function CopyButton({ label, copied, onCopy }: CopyButtonProps): React.JSX.Element {
  return (
    <button
      aria-label={label}
      className="absolute right-2 top-2 flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-black/60 px-2 text-[11px] font-medium text-white opacity-0 outline-none backdrop-blur transition-[opacity,transform] duration-150 hover:bg-black/75 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 group-focus-within:opacity-100 group-hover:opacity-100"
      type="button"
      onClick={() => {
        playSoftClick();
        onCopy();
      }}
    >
      <span aria-hidden="true" className="grid size-3 place-items-center">
        <Copy className={`${layer} ${copied ? "-rotate-12 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100"}`} size={12} />
        <Tick className={`${layer} ${copied ? "rotate-0 scale-100 opacity-100" : "rotate-12 scale-50 opacity-0"}`} size={12} />
      </span>
      {/* Reserves the wider word's width and fades the new one in, so the button never resizes. */}
      <span
        className="min-w-[2.9rem] text-left transition-opacity duration-300 ease-settle starting:opacity-0 motion-reduce:transition-none"
        key={copied ? "copied" : "copy"}
      >
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
