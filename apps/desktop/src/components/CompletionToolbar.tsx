import { Check, Clipboard, Download, Pin } from "lucide-react";
import type { CompletionAction } from "../domain/capture";
import { ToolButton } from "./ToolButton";

type CompletionToolbarProps = {
  busy: boolean;
  onComplete: (action: CompletionAction) => void;
};

export function CompletionToolbar({
  busy,
  onComplete,
}: CompletionToolbarProps): React.JSX.Element {
  return (
    <div
      aria-label="Capture actions"
      className="flex flex-col items-center gap-0.5 rounded-2xl border border-white/12 bg-[#161815]/96 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      role="toolbar"
    >
      <ToolButton
        disabled={busy}
        icon={Clipboard}
        label="Copy"
        shortcut="Enter"
        onClick={() => onComplete("copy")}
      />
      <ToolButton
        disabled={busy}
        icon={Download}
        label="Save"
        shortcut="Ctrl S"
        onClick={() => onComplete("save")}
      />
      <ToolButton disabled={busy} icon={Pin} label="Pin" onClick={() => onComplete("pin")} />
      {busy ? (
        <span className="grid size-10 place-items-center text-lime-300" role="status">
          <Check className="animate-pulse" aria-hidden="true" size={18} />
          <span className="sr-only">Finishing capture</span>
        </span>
      ) : null}
    </div>
  );
}
