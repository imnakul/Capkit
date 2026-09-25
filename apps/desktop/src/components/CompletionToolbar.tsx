import { useEffect, useRef } from "react";
import type { CompletionAction } from "../domain/capture";
import { Clipboard, Copy, Download, Pin, Refresh, type CapkitIconProps } from "./icons";
import { ToolButton } from "./ToolButton";

export type CompletionToolbarState = "idle" | "working" | "save-pending";

type CompletionToolbarProps = {
  state: CompletionToolbarState;
  copyShortcut: string;
  copyAndSaveShortcut: string;
  saveShortcut: string;
  statusMessage: string;
  diagnostic: string | undefined;
  statusSide: "left" | "right";
  onComplete: (action: CompletionAction) => void;
  onRetrySave: () => void;
};

export function CompletionToolbar({
  state,
  copyShortcut,
  copyAndSaveShortcut,
  saveShortcut,
  statusMessage,
  diagnostic,
  statusSide,
  onComplete,
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
      <div
        aria-label="Capture actions"
        aria-busy={state === "working"}
        className="flex flex-col items-center gap-0.5 rounded-2xl border border-white/12 bg-[#161815]/96 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        role="toolbar"
      >
        <ToolButton
          disabled={disabled}
          icon={Clipboard}
          label="Copy"
          shortcut={copyShortcut}
          onClick={() => onComplete("copy")}
        />
        <ToolButton
          disabled={disabled}
          icon={CopyAndSaveIcon}
          label="Copy & Save"
          shortcut={copyAndSaveShortcut}
          onClick={() => onComplete("copy-and-save")}
        />
        <ToolButton
          disabled={disabled}
          icon={Download}
          label="Save"
          shortcut={saveShortcut}
          onClick={() => onComplete("save")}
        />
        <ToolButton
          disabled={disabled}
          icon={Pin}
          label="Pin"
          onClick={() => onComplete("pin")}
        />
      </div>

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

function CopyAndSaveIcon({ className }: CapkitIconProps): React.JSX.Element {
  return (
    <span className={`relative inline-flex size-[18px] items-center justify-center ${className ?? ""}`}>
      <Copy aria-hidden="true" className="absolute left-0 top-0" size={14} strokeWidth={2} />
      <Download aria-hidden="true" className="absolute bottom-0 right-0" size={14} strokeWidth={2} />
    </span>
  );
}
