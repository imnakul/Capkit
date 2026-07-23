import {
  Check,
  Clipboard,
  Download,
  GalleryVerticalEnd,
  Hand,
  Pin,
  RefreshCw,
  X,
} from "lucide-react";
import type { CompletionAction, Rect, ScrollingCaptureResult } from "../domain/capture";

export type ScrollingCaptureState =
  | { phase: "setup" }
  | { phase: "running"; mode: "automatic" | "manual-start" | "manual-add" }
  | { phase: "preview"; mode: "automatic" | "manual"; result: ScrollingCaptureResult; completionError?: string }
  | { phase: "error"; message: string };

type ScrollingCapturePanelProps = {
  anchor: Rect;
  state: ScrollingCaptureState;
  onAutomatic: () => void;
  onManualStart: () => void;
  onManualAdd: () => void;
  onComplete: (action: CompletionAction) => void;
  onClose: () => void;
};

export function ScrollingCapturePanel({
  anchor,
  state,
  onAutomatic,
  onManualStart,
  onManualAdd,
  onComplete,
  onClose,
}: ScrollingCapturePanelProps): React.JSX.Element {
  const running = state.phase === "running";
  const position = panelPosition(anchor);
  return (
    <aside
      aria-label="Scrolling capture"
      className="absolute z-50 flex max-h-[calc(100vh-2rem)] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-white/12 bg-[#1c1e1a]/98 text-stone-100 shadow-[0_24px_80px_rgba(0,0,0,0.58)] backdrop-blur-xl"
      data-capture-interactive="true"
      style={position}
    >
      <header className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-lime-300 text-stone-950">
          <GalleryVerticalEnd aria-hidden="true" size={16} strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold">{state.phase === "setup" ? "Choose how to scroll" : "Scrolling capture"}</h2>
          <p className="mt-0.5 text-[10px] text-stone-400">{state.phase === "setup" ? "Capture starts as soon as you choose" : "Build one continuous vertical image"}</p>
        </div>
        <button
          aria-label="Close scrolling capture"
          className="grid size-8 place-items-center rounded-md text-stone-400 outline-none hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-lime-300"
          disabled={running}
          type="button"
          onClick={onClose}
        >
          <X aria-hidden="true" size={15} />
        </button>
      </header>

      {state.phase === "setup" ? (
        <div className="space-y-3 p-4">
          <button
            aria-label="Start automatic scrolling capture"
            className="group flex w-full items-start gap-3 rounded-lg border border-lime-300/35 bg-lime-300/8 p-3 text-left outline-none transition hover:border-lime-300/70 hover:bg-lime-300/12 focus-visible:ring-2 focus-visible:ring-lime-300"
            type="button"
            onClick={onAutomatic}
          >
            <GalleryVerticalEnd aria-hidden="true" className="mt-0.5 text-lime-300" size={16} />
            <span><span className="block text-xs font-semibold">Automatic</span><span className="mt-1 block text-[10px] leading-4 text-stone-400">CapKit scrolls, detects the end, removes repeated headers, and stitches.</span></span>
          </button>
          <button
            aria-label="Start manual scrolling capture"
            className="flex w-full items-start gap-3 rounded-lg border border-white/10 p-3 text-left outline-none transition hover:border-white/20 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-lime-300"
            type="button"
            onClick={onManualStart}
          >
            <Hand aria-hidden="true" className="mt-0.5 text-stone-300" size={16} />
            <span><span className="block text-xs font-semibold">Manual fallback</span><span className="mt-1 block text-[10px] leading-4 text-stone-400">For canvases or apps that reject synthetic scrolling. You control each scroll.</span></span>
          </button>
          <p className="text-[9px] leading-4 text-stone-500">Keep the pointer inside the selected scrollable area before starting.</p>
        </div>
      ) : null}

      {state.phase === "running" ? (
        <div className="grid min-h-48 place-items-center px-6 py-8 text-center" role="status">
          <div>
            <RefreshCw aria-hidden="true" className="mx-auto animate-spin text-lime-300" size={20} />
            <p className="mt-3 text-xs font-semibold">
              {state.mode === "automatic" ? "Scrolling and matching frames" : state.mode === "manual-add" ? "Scroll the page now" : "Capturing the first frame"}
            </p>
            <p className="mt-1 text-[10px] leading-4 text-stone-400">
              {state.mode === "manual-add" ? "The overlay is hidden for two seconds." : "CapKit will restore this preview automatically."}
            </p>
          </div>
        </div>
      ) : null}

      {state.phase === "error" ? (
        <div className="space-y-3 p-4">
          <div className="rounded-lg border border-red-300/20 bg-red-300/7 p-3 text-[10px] leading-4 text-red-100">{state.message}</div>
          <div className="flex gap-2">
            <ActionButton icon={RefreshCw} label="Retry automatic" onClick={onAutomatic} />
            <ActionButton icon={Hand} label="Use manual" onClick={onManualStart} />
          </div>
        </div>
      ) : null}

      {state.phase === "preview" ? (
        <>
          {state.completionError === undefined ? null : <div className="mx-3 mt-3 rounded-lg border border-red-300/20 bg-red-300/7 p-3 text-[10px] leading-4 text-red-100" role="alert">{state.completionError}<span className="mt-1 block text-red-200/65">The stitched preview is still available. Retry Copy, Save, or Pin below.</span></div>}
          <div className="m-3 mb-0 h-72 overflow-auto rounded-lg border border-white/10 bg-[#10120f]">
            <img alt="Stitched scrolling capture preview" className="h-auto w-full" src={state.result.previewUrl} />
          </div>
          <div className="p-3">
            <div className="mb-3 flex items-center justify-between text-[9px] text-stone-400">
              <span className="flex items-center gap-1.5"><Check aria-hidden="true" className="text-lime-300" size={11} />{state.result.frameCount} frames stitched</span>
              <span>{statusLabel(state.result)}</span>
            </div>
            {state.mode === "manual" ? (
              <div className="mb-2">
                <button
                  aria-label="Hide CapKit and capture the next manually scrolled frame"
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-white/12 bg-white/5 px-3 py-2 text-[10px] font-semibold outline-none hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-lime-300"
                  type="button"
                  onClick={onManualAdd}
                >
                  <Hand aria-hidden="true" size={13} />Scroll once, then add frame
                </button>
                <p className="mt-1.5 text-center text-[9px] text-stone-500">CapKit hides for two seconds; scroll the selected area once.</p>
              </div>
            ) : null}
            <div className="grid grid-cols-4 gap-1.5">
              <ActionButton icon={RefreshCw} label="Retry" onClick={onAutomatic} />
              <ActionButton icon={Clipboard} label="Copy" onClick={() => onComplete("copy")} />
              <ActionButton icon={Download} label="Save" onClick={() => onComplete("save")} />
              <ActionButton icon={Pin} label="Pin" onClick={() => onComplete("pin")} />
            </div>
          </div>
        </>
      ) : null}
    </aside>
  );
}

type ActionButtonProps = { icon: typeof RefreshCw; label: string; onClick: () => void };
function ActionButton({ icon: Icon, label, onClick }: ActionButtonProps): React.JSX.Element {
  return <button aria-label={label} className="flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 px-2 text-[9px] font-semibold text-stone-300 outline-none hover:border-white/20 hover:bg-white/7 hover:text-white focus-visible:ring-2 focus-visible:ring-lime-300" type="button" onClick={onClick}><Icon aria-hidden="true" size={12} />{label}</button>;
}

function statusLabel(result: ScrollingCaptureResult): string {
  if (result.stoppedReason === "end-reached") return "End detected";
  if (result.stoppedReason === "no-progress") return "No automatic movement";
  if (result.stoppedReason === "no-change") return "No new content detected";
  if (result.stickyHeaderHeight > 0) return "Sticky header handled";
  return result.stoppedReason === "frame-limit" ? "Frame limit reached" : "Ready for next frame";
}

function panelPosition(anchor: Rect): React.CSSProperties {
  const margin = 16;
  const gap = 12;
  const panelWidth = Math.min(368, window.innerWidth - margin * 2);
  const panelHeight = Math.min(560, window.innerHeight - margin * 2);
  const right = anchor.x + anchor.width + gap;
  const left = anchor.x - panelWidth - gap;
  const preferredLeft = right + panelWidth <= window.innerWidth - margin
    ? right
    : left >= margin
      ? left
      : Math.max(margin, Math.min(anchor.x, window.innerWidth - panelWidth - margin));
  return {
    left: preferredLeft,
    top: Math.max(margin, Math.min(anchor.y, window.innerHeight - panelHeight - margin)),
  };
}
