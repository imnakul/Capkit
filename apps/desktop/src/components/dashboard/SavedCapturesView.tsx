import { confirm } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SavedCapture } from "../../domain/capture";
import { useSnaphubSettings } from "../../domain/settings";
import {
  copySavedCapture,
  describeInvokeError,
  deleteSavedCapture,
  getSaveDirectory,
  listSavedCaptures,
  listenForSavedCapture,
  openSaveDirectory,
  openSavedCapture,
  startSavedCaptureDrag,
} from "../../lib/tauri";
import {
  Clock as Clock3,
  Copy,
  Tick as Check,
  Delete as Trash2,
  FolderOpen,
  HardDrive,
  Image as Images,
  Refresh as RefreshCw,
  View as Eye,
} from "../icons";
import { LAYER } from "../layers";
import { Button } from "../ui/Button";
import { Keycap } from "../ui/Keycap";
import { PageHeader } from "../ui/PageHeader";

type LibraryState =
  | { status: "loading"; captures: readonly SavedCapture[] }
  | { status: "ready"; captures: readonly SavedCapture[] }
  | { status: "error"; captures: readonly SavedCapture[]; message: string };

type CaptureMenu = { capture: SavedCapture; left: number; top: number };

type SavedCapturesViewProps = {
  onShowcase: (capture?: SavedCapture) => void;
};

export function SavedCapturesView({ onShowcase }: SavedCapturesViewProps): React.JSX.Element {
  const [directory, setDirectory] = useState("Loading save location…");
  const [library, setLibrary] = useState<LibraryState>({ status: "loading", captures: [] });
  const [menu, setMenu] = useState<CaptureMenu | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLibrary((current) => ({ status: "loading", captures: current.captures }));
    try {
      const [nextDirectory, captures] = await Promise.all([
        getSaveDirectory(),
        listSavedCaptures(),
      ]);
      setDirectory(nextDirectory);
      setLibrary({ status: "ready", captures });
    } catch (error: unknown) {
      setLibrary((current) => ({
        status: "error",
        captures: current.captures,
        message: describeInvokeError(error, "Saved captures could not be loaded"),
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    let disposed = false;
    let stopListening: (() => void) | null = null;
    void listenForSavedCapture(() => void refresh()).then((unlisten) => {
      if (disposed) unlisten();
      else stopListening = unlisten;
    });
    return (): void => {
      disposed = true;
      stopListening?.();
    };
  }, [refresh]);

  useEffect(() => {
    if (menu === null) return;
    function closeMenu(event: PointerEvent): void {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenu(null);
    }
    function closeFromKeyboard(event: KeyboardEvent): void {
      if (event.key === "Escape") setMenu(null);
    }
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeFromKeyboard);
    return (): void => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [menu]);

  async function viewCapture(capture: SavedCapture): Promise<void> {
    setMenu(null);
    setActionError(null);
    try {
      await openSavedCapture(capture.path);
    } catch (error: unknown) {
      setActionError(describeInvokeError(error, `Could not open ${capture.fileName}`));
    }
  }

  async function copyCapture(capture: SavedCapture): Promise<boolean> {
    setMenu(null);
    setActionError(null);
    try {
      await copySavedCapture(capture.path);
      return true;
    } catch {
      setActionError("Couldn't copy this capture.");
      void refresh();
      return false;
    }
  }

  function dragCapture(capture: SavedCapture): void {
    setActionError(null);
    startSavedCaptureDrag(capture.path).catch(() => {
      setActionError("Couldn't start dragging this capture.");
      void refresh();
    });
  }

  async function openFolder(): Promise<void> {
    setActionError(null);
    try {
      await openSaveDirectory();
    } catch (error: unknown) {
      setActionError(describeInvokeError(error, "The save folder could not be opened"));
    }
  }

  async function deleteCapture(capture: SavedCapture): Promise<void> {
    setMenu(null);
    const approved = await confirm(`Permanently delete ${capture.fileName}?`, {
      title: "Delete saved capture",
      kind: "warning",
    });
    if (!approved) return;
    try {
      await deleteSavedCapture(capture.path);
      await refresh();
    } catch (error: unknown) {
      setActionError(describeInvokeError(error, `Could not delete ${capture.fileName}`));
    }
  }

  function showContextMenu(event: React.MouseEvent, capture: SavedCapture): void {
    event.preventDefault();
    const menuWidth = 196;
    const menuHeight = 200;
    setMenu({
      capture,
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    });
  }

  return (
    <section aria-labelledby="saved-captures-title" className="px-7 pb-12 pt-7">
      <PageHeader
        title="Screenshots"
        trailing={
          <span className="flex items-center gap-3">
            <span className="tabular-nums">{library.captures.length} {library.captures.length === 1 ? "file" : "files"}</span>
            <Button aria-label="Refresh saved captures" disabled={library.status === "loading"} variant="ghost" onClick={() => void refresh()}>
              <RefreshCw aria-hidden="true" className={library.status === "loading" ? "animate-spin motion-reduce:animate-none" : ""} size={13} />
            </Button>
          </span>
        }
      />

      <div className="flex min-h-12 items-center gap-3 rounded-lg border border-content/10 bg-content/4 px-3.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-content/6 text-content/60"><FolderOpen aria-hidden="true" size={14} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-content/45">Saving to</p>
          <p className="mt-0.5 truncate font-mono text-[12px] text-content" title={directory}>{directory}</p>
        </div>
        <Button aria-label="Open save folder" onClick={() => void openFolder()}><FolderOpen aria-hidden="true" size={12} />Open folder</Button>
      </div>

      {library.status === "error" ? <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger" role="alert">{library.message}</div> : null}
      {actionError === null ? null : <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger" role="alert">{actionError}</div>}

      {library.status === "loading" && library.captures.length === 0 ? <LoadingGrid /> : null}
      {library.status !== "loading" && library.captures.length === 0 ? <EmptyLibrary /> : null}
      {library.captures.length > 0 ? (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {library.captures.map((capture) => <CaptureCard capture={capture} key={capture.path} onContextMenu={showContextMenu} onCopy={copyCapture} onDrag={dragCapture} onView={(selected) => void viewCapture(selected)} />)}
        </div>
      ) : null}
      {menu === null ? null : (
        <div className="fixed w-[196px] overflow-hidden rounded-lg border border-content/10 bg-background-base p-1.5 text-content shadow-xl" ref={menuRef} role="menu" style={{ left: menu.left, top: menu.top, zIndex: LAYER.popover }}>
          <ContextAction icon={Eye} label="View" onClick={() => void viewCapture(menu.capture)} />
          <ContextAction icon={Copy} label="Copy" onClick={() => void copyCapture(menu.capture)} />
          <ContextAction icon={Images} label="Showcase" onClick={() => { setMenu(null); onShowcase(menu.capture); }} />
          <div className="my-1 border-t border-content/10" />
          <ContextAction destructive icon={Trash2} label="Delete" onClick={() => void deleteCapture(menu.capture)} />
        </div>
      )}
    </section>
  );
}

type CaptureCardProps = {
  capture: SavedCapture;
  onView: (capture: SavedCapture) => void;
  onCopy: (capture: SavedCapture) => Promise<boolean>;
  onDrag: (capture: SavedCapture) => void;
  onContextMenu: (event: React.MouseEvent, capture: SavedCapture) => void;
};

const dragThresholdPx = 5;
const copiedLabelMs = 1500;

function CaptureCard({ capture, onView, onCopy, onDrag, onContextMenu }: CaptureCardProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);

  useEffect(() => (): void => {
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
  }, []);

  async function copy(): Promise<void> {
    const succeeded = await onCopy(capture);
    if (!succeeded) return;
    setCopied(true);
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), copiedLabelMs);
  }

  function handleKeyDown(event: React.KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void copy();
    }
  }

  // No pointer capture here: the OS drag needs the button still down and the
  // webview must keep seeing the moves.
  function handlePointerDown(event: React.PointerEvent): void {
    if (event.button !== 0) return;
    dragStarted.current = false;
    pressStart.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerMove(event: React.PointerEvent): void {
    const start = pressStart.current;
    if (start === null || dragStarted.current || (event.buttons & 1) === 0) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < dragThresholdPx) return;
    dragStarted.current = true;
    pressStart.current = null;
    onDrag(capture);
  }

  function handleClick(event: React.MouseEvent): void {
    pressStart.current = null;
    if (dragStarted.current) {
      dragStarted.current = false;
      event.preventDefault();
      return;
    }
    onView(capture);
  }

  return (
    <div aria-label={capture.fileName} className="group relative min-w-0" role="group" onKeyDown={handleKeyDown}>
      <button aria-label={`View ${capture.fileName}`} className="block w-full min-w-0 overflow-hidden rounded-lg border border-content/10 bg-content/4 text-left outline-none transition-colors duration-150 hover:border-content/20 focus-visible:ring-2 focus-visible:ring-accent/50 motion-reduce:transition-none" type="button" onClick={handleClick} onContextMenu={(event) => onContextMenu(event, capture)} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={() => { pressStart.current = null; }}>
        <div className="grid aspect-[4/3] place-items-center overflow-hidden bg-content/6 outline outline-1 -outline-offset-1 outline-content/10">
          <img alt={`Saved capture ${capture.fileName}`} className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.015] motion-reduce:transition-none motion-reduce:group-hover:scale-100" draggable={false} loading="lazy" src={capture.thumbnailUrl} />
        </div>
        <div className="border-t border-content/8 px-3 py-2.5">
          <p className="truncate text-[13px] font-medium text-content" title={capture.fileName}>{capture.fileName}</p>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] tabular-nums text-content/60">
            <span>{capture.width} × {capture.height}</span>
            <span>{formatBytes(capture.sizeBytes)}</span>
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-content/60"><Clock3 aria-hidden="true" size={10} />{formatDate(capture.modifiedAt)}</p>
        </div>
      </button>
      <button aria-label={`Copy ${capture.fileName}`} className="absolute right-2 top-2 flex h-7 items-center gap-1 rounded-md bg-black/60 px-2 text-[11px] font-medium text-white opacity-0 outline-none backdrop-blur transition-opacity duration-150 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/50 motion-reduce:transition-none group-focus-within:opacity-100 group-hover:opacity-100" type="button" onClick={() => void copy()}>
        {copied ? <Check aria-hidden="true" size={12} /> : <Copy aria-hidden="true" size={12} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

type ContextActionProps = { icon: typeof Eye; label: string; onClick: () => void; disabled?: boolean; destructive?: boolean; title?: string };
function ContextAction({ icon: Icon, label, onClick, disabled = false, destructive = false, title }: ContextActionProps): React.JSX.Element {
  return <button aria-label={label} className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12px] font-medium outline-none transition-colors duration-120 focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none ${destructive ? "text-danger hover:bg-danger/10" : "hover:bg-content/6"}`} disabled={disabled} role="menuitem" title={title} type="button" onClick={onClick}><Icon aria-hidden="true" size={13} />{label}</button>;
}

function LoadingGrid(): React.JSX.Element {
  return <div aria-label="Loading saved captures" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" role="status">{Array.from({ length: 8 }, (_, index) => <div className="aspect-[4/3] animate-pulse rounded-lg border border-content/8 bg-content/6 motion-reduce:animate-none" key={index} />)}</div>;
}

function EmptyLibrary(): React.JSX.Element {
  const { settings } = useSnaphubSettings();
  return (
    <div className="mt-5 grid min-h-72 place-items-center rounded-lg border border-dashed border-content/15 text-center">
      <div>
        <span className="mx-auto grid size-10 place-items-center rounded-lg bg-content/6 text-content/45"><HardDrive aria-hidden="true" size={17} /></span>
        <h2 className="mt-3 text-[13px] font-semibold text-content">No saved captures yet</h2>
        <p className="mx-auto mt-1 max-w-xs text-[12px] leading-5 text-content/60">Use Save in the capture toolbar or press <Keycap>{settings.shortcuts.captureAndSave}</Keycap> to capture and save. Copied screenshots will not appear here.</p>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${String(bytes)} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
