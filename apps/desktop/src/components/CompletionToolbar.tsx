import { useEffect, useRef } from "react";
import type { RailItem } from "./captureActions";
import { Refresh } from "./icons";
import { ToolButton } from "./ToolButton";

export type CompletionToolbarState = "idle" | "working" | "save-pending";

type CompletionToolbarProps = {
  state: CompletionToolbarState;
  /** Buttons placed in the vertical rail: finishing actions and any moved tools. */
  items: readonly RailItem[];
  statusMessage: string;
  diagnostic: string | undefined;
  statusSide: "left" | "right";
  onRetrySave: () => void;
};

export function CompletionToolbar({
  state,
  items,
  statusMessage,
  diagnostic,
  statusSide,
  onRetrySave,
}: CompletionToolbarProps): React.JSX.Element {
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const disabled = state !== "idle";

  useEffect(() => {
    if (state === "save-pending") retryButtonRef.current?.focus();
  }, [state]);

  const statusPosition = statusSide === "left"
    ? "right-full top-0 mr-2"
    : "left-full top-0 ml-2";

  return (
    <div className="relative" data-capture-interactive="true">
      {items.length === 0 ? null : (
        <div
          aria-label="Capture actions"
          aria-busy={state === "working"}
          className="flex flex-col items-center gap-0.5 rounded-2xl border border-white/12 bg-[#161815]/96 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          role="toolbar"
        >
          {items.map((item) => (
            <ToolButton
              active={item.active ?? false}
              disabled={disabled || (item.disabled ?? false)}
              icon={item.icon}
              key={item.id}
              label={item.label}
              onClick={item.onSelect}
              {...(item.shortcut === undefined ? {} : { shortcut: item.shortcut })}
            />
          ))}
        </div>
      )}

      {state === "idle" && statusMessage === "" ? null : (
        <div
          aria-live="polite"
          className={`absolute z-40 w-64 rounded-xl border border-white/12 bg-[#1c1e1a]/98 p-3 text-stone-100 shadow-[0_18px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl ${statusPosition}`}
          data-placement={statusSide}
          role="status"
        >
          {state === "working" ? (
            <p className="flex items-center gap-2 text-xs font-semibold">
              <Refresh aria-hidden="true" className="animate-spin text-lime-300 motion-reduce:animate-none" size={14} />
              {statusMessage}
            </p>
          ) : null}
          {state === "save-pending" ? (
            <>
              <p className="text-xs font-semibold text-red-100">
                Copied, but could not save. Retry save or press Esc to cancel.
              </p>
              {diagnostic === undefined ? null : (
                <p className="mt-1.5 break-words text-[10px] leading-4 text-red-200/75">
                  {diagnostic}
                </p>
              )}
              <button
                className="mt-3 w-full rounded-lg bg-lime-300 px-3 py-2 text-xs font-semibold text-stone-950 outline-none transition hover:bg-lime-200 focus-visible:ring-2 focus-visible:ring-white active:scale-96 motion-reduce:transition-none motion-reduce:active:scale-100"
                ref={retryButtonRef}
                type="button"
                onClick={onRetrySave}
              >
                Retry save
              </button>
            </>
          ) : null}
          {state === "idle" ? <p className="text-xs leading-4 text-red-100">{statusMessage}</p> : null}
        </div>
      )}
    </div>
  );
}
