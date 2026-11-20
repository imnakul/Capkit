import { useEffect } from "react";
import { playSoftClick } from "../../lib/clickSound";
import { Copy, Tick } from "../icons";

type CopyButtonProps = {
  label: string;
  copied: boolean;
  onCopy: () => void;
};

const iconLayer =
  "col-start-1 row-start-1 transition-[opacity,transform,filter] duration-200 ease-settle motion-reduce:transition-none";

/**
 * Hover-revealed copy action for a card. The copy icon morphs into a check once
 * `copied` turns true and a soft tick plays; pressing it dips to 0.96.
 */
export function CopyButton({ label, copied, onCopy }: CopyButtonProps): React.JSX.Element {
  useEffect(() => {
    if (copied) playSoftClick();
  }, [copied]);

  return (
    <button
      aria-label={label}
      className="absolute right-2 top-2 flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-black/60 px-2 text-[11px] font-medium text-white opacity-0 outline-none backdrop-blur transition-[opacity,transform] duration-150 hover:bg-black/75 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 group-focus-within:opacity-100 group-hover:opacity-100"
      type="button"
      onClick={onCopy}
    >
      <span aria-hidden="true" className="grid size-3 place-items-center">
        <Copy
          className={`${iconLayer} ${copied ? "scale-[0.25] opacity-0 blur-[2px]" : "scale-100 opacity-100 blur-0"}`}
          size={12}
        />
        <Tick
          className={`${iconLayer} ${copied ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[2px]"}`}
          size={12}
        />
      </span>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
