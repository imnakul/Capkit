import { confirm } from "@tauri-apps/plugin-dialog";
import { Clock3, CloudUpload, Eye, FolderOpen, HardDrive, Images, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SavedCapture } from "../../domain/capture";
import {
  describeInvokeError,
  deleteSavedCapture,
  getSaveDirectory,
  listSavedCaptures,
  listenForSavedCapture,
  openSaveDirectory,
  openSavedCapture,
} from "../../lib/tauri";

type LibraryState =
  | { status: "loading"; captures: readonly SavedCapture[] }
  | { status: "ready"; captures: readonly SavedCapture[] }
  | { status: "error"; captures: readonly SavedCapture[]; message: string };

type CaptureMenu = { capture: SavedCapture; left: number; top: number };

type SavedCapturesViewProps = {
  cloudConfigured: boolean;
  onShowcase: () => void;
};

export function SavedCapturesView({ cloudConfigured, onShowcase }: SavedCapturesViewProps): React.JSX.Element {
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
    const menuHeight = 164;
    setMenu({
      capture,
      left: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      top: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    });
  }

  return (
    <section aria-labelledby="saved-captures-title" className="mx-auto max-w-[1120px] px-7 pb-12 pt-7">
      <header className="flex items-end justify-between gap-6 border-b border-stone-300/80 pb-5 dark:border-white/10">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">Local workspace</p>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] text-[#171815] dark:text-stone-100" id="saved-captures-title">Saved captures</h1>
          <p className="mt-1.5 text-xs leading-5 text-stone-500 dark:text-stone-400">Only images explicitly saved by Snaphub appear here. Clipboard-only captures stay private and unindexed.</p>
        </div>
        <button
          aria-label="Refresh saved captures"
          className="grid size-8 shrink-0 place-items-center rounded-md border border-stone-300 bg-white text-stone-500 outline-none transition hover:border-stone-400 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:opacity-50 dark:border-white/10 dark:bg-[#30312e] dark:text-stone-400 dark:hover:text-white"
          disabled={library.status === "loading"}
          type="button"
          onClick={() => void refresh()}
        >
          <RefreshCw aria-hidden="true" className={library.status === "loading" ? "animate-spin" : ""} size={14} />
        </button>
      </header>

      <div className="mt-5 flex min-h-12 items-center gap-3 rounded-lg border border-stone-300/80 bg-white/65 px-3.5 dark:border-white/9 dark:bg-[#2b2c29]">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-500 dark:bg-white/6 dark:text-stone-400"><FolderOpen aria-hidden="true" size={14} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-stone-400 dark:text-stone-500">Saving to</p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-stone-700 dark:text-stone-300" title={directory}>{directory}</p>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-stone-400">{library.captures.length} files</span>
        <button aria-label="Open save folder" className="flex shrink-0 items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-stone-600 outline-none transition hover:border-stone-400 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:border-white/10 dark:bg-[#333431] dark:text-stone-300 dark:hover:border-white/20 dark:hover:text-white" type="button" onClick={() => void openFolder()}><FolderOpen aria-hidden="true" size={12} />Open folder</button>
      </div>

      {library.status === "error" ? <div className="mt-4 rounded-md border border-red-300/40 bg-red-50 px-3 py-2 text-[11px] text-red-800 dark:border-red-300/15 dark:bg-red-300/5 dark:text-red-200" role="alert">{library.message}</div> : null}
      {actionError === null ? null : <div className="mt-4 rounded-md border border-red-300/40 bg-red-50 px-3 py-2 text-[11px] text-red-800 dark:border-red-300/15 dark:bg-red-300/5 dark:text-red-200" role="alert">{actionError}</div>}

      {library.status === "loading" && library.captures.length === 0 ? <LoadingGrid /> : null}
      {library.status !== "loading" && library.captures.length === 0 ? <EmptyLibrary /> : null}
      {library.captures.length > 0 ? (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {library.captures.map((capture) => <CaptureCard capture={capture} key={capture.path} onContextMenu={showContextMenu} onView={(selected) => void viewCapture(selected)} />)}
        </div>
      ) : null}
      {menu === null ? null : (
        <div className="fixed z-50 w-[196px] overflow-hidden rounded-lg border border-stone-300 bg-[#f7f7f4] p-1.5 text-stone-700 shadow-[0_18px_48px_rgba(0,0,0,0.28)] dark:border-white/12 dark:bg-[#2b2c29] dark:text-stone-200" ref={menuRef} role="menu" style={{ left: menu.left, top: menu.top }}>
          <ContextAction icon={Eye} label="View" onClick={() => void viewCapture(menu.capture)} />
          <ContextAction disabled={!cloudConfigured} icon={CloudUpload} label="Upload to Cloud" title={cloudConfigured ? "Upload this capture" : "Connect Cloud before uploading"} onClick={() => undefined} />
          <ContextAction icon={Images} label="Showcase" onClick={() => { setMenu(null); onShowcase(); }} />
          <div className="my-1 border-t border-stone-300/80 dark:border-white/9" />
          <ContextAction destructive icon={Trash2} label="Delete" onClick={() => void deleteCapture(menu.capture)} />
        </div>
      )}
    </section>
  );
}

type CaptureCardProps = {
  capture: SavedCapture;
  onView: (capture: SavedCapture) => void;
  onContextMenu: (event: React.MouseEvent, capture: SavedCapture) => void;
};

function CaptureCard({ capture, onView, onContextMenu }: CaptureCardProps): React.JSX.Element {
  return (
    <button aria-label={`View ${capture.fileName}`} className="group min-w-0 overflow-hidden rounded-lg border border-stone-300/80 bg-white text-left outline-none transition-colors hover:border-stone-400 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:border-white/9 dark:bg-[#2b2c29] dark:hover:border-white/16" type="button" onClick={() => onView(capture)} onContextMenu={(event) => onContextMenu(event, capture)}>
      <div className="grid aspect-[4/3] place-items-center overflow-hidden bg-[linear-gradient(135deg,#ecece8_25%,transparent_25%),linear-gradient(225deg,#ecece8_25%,transparent_25%),linear-gradient(45deg,#ecece8_25%,transparent_25%),linear-gradient(315deg,#ecece8_25%,#f6f6f3_25%)] bg-[length:16px_16px] bg-[position:8px_0,8px_0,0_0,0_0] dark:bg-[#20211f]">
        <img alt={`Saved capture ${capture.fileName}`} className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.015]" loading="lazy" src={capture.thumbnailUrl} />
      </div>
      <div className="border-t border-stone-200 px-3 py-2.5 dark:border-white/8">
        <p className="truncate text-[11px] font-semibold text-stone-800 dark:text-stone-200" title={capture.fileName}>{capture.fileName}</p>
        <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[9px] text-stone-400 dark:text-stone-500">
          <span>{capture.width} × {capture.height}</span>
          <span>{formatBytes(capture.sizeBytes)}</span>
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-[9px] text-stone-400 dark:text-stone-500"><Clock3 aria-hidden="true" size={10} />{formatDate(capture.modifiedAt)}</p>
      </div>
    </button>
  );
}

type ContextActionProps = { icon: typeof Eye; label: string; onClick: () => void; disabled?: boolean; destructive?: boolean; title?: string };
function ContextAction({ icon: Icon, label, onClick, disabled = false, destructive = false, title }: ContextActionProps): React.JSX.Element {
  return <button aria-label={label} className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[10px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:cursor-not-allowed disabled:opacity-35 ${destructive ? "text-red-600 hover:bg-red-500/8 dark:text-red-300" : "hover:bg-black/5 dark:hover:bg-white/7"}`} disabled={disabled} role="menuitem" title={title} type="button" onClick={onClick}><Icon aria-hidden="true" size={13} />{label}</button>;
}

function LoadingGrid(): React.JSX.Element {
  return <div aria-label="Loading saved captures" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4" role="status">{Array.from({ length: 8 }, (_, index) => <div className="aspect-[4/3] animate-pulse rounded-lg border border-stone-300/60 bg-stone-200/60 dark:border-white/6 dark:bg-white/4" key={index} />)}</div>;
}

function EmptyLibrary(): React.JSX.Element {
  return <div className="mt-5 grid min-h-72 place-items-center rounded-lg border border-dashed border-stone-300 bg-white/35 text-center dark:border-white/10 dark:bg-white/[0.015]"><div><span className="mx-auto grid size-10 place-items-center rounded-lg border border-stone-300 bg-white text-stone-400 dark:border-white/10 dark:bg-[#2b2c29]"><HardDrive aria-hidden="true" size={17} /></span><h2 className="mt-3 text-sm font-semibold">No saved captures yet</h2><p className="mx-auto mt-1 max-w-xs text-[11px] leading-5 text-stone-500 dark:text-stone-400">Use Save in the capture toolbar or your Capture &amp; save shortcut. Copied screenshots will not appear here.</p></div></div>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${String(bytes)} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
