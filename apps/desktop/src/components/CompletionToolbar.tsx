import type { CompletionAction } from "../domain/capture";
import { Clipboard, Download, Pin, Tick } from "./icons";
import { ToolButton } from "./ToolButton";

type CompletionToolbarProps = {
  busy: boolean;
  copyShortcut: string;
  saveShortcut: string;
  onComplete: (action: CompletionAction) => void;
};

export function CompletionToolbar({
  busy,
  copyShortcut,
  saveShortcut,
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
        shortcut={copyShortcut}
        onClick={() => onComplete("copy")}
        onPointerUp={() => onComplete("copy")}
      />
      <ToolButton
        disabled={busy}
        icon={Download}
        label="Save"
        shortcut={saveShortcut}
        onClick={() => onComplete("save")}
        onPointerUp={() => onComplete("save")}
      />
      <ToolButton
        disabled={busy}
        icon={Pin}
        label="Pin"
        onClick={() => onComplete("pin")}
        onPointerUp={() => onComplete("pin")}
      />
      {busy ? (
        <span className="grid size-10 place-items-center text-lime-300" role="status">
          <Tick className="animate-pulse" aria-hidden="true" size={18} />
          <span className="sr-only">Finishing capture</span>
        </span>
      ) : null}
    </div>
  );
}
