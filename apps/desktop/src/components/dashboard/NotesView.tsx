import { confirm } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cleanupUnsavedNotes,
  copyNote,
  deleteNote,
  describeInvokeError,
  listNotes,
  openNoteUrl,
  startNoteDrag,
  type NoteSummary,
} from "../../lib/tauri";
import {
  Clock,
  Copy,
  Delete as Trash2,
  Magnifier,
  NotePin,
  Refresh as RefreshCw,
  Tick as Check,
  View as Eye,
} from "../icons";
import { NoteDialog } from "./NoteDialog";

const pageSize = 60;
const searchDebounceMs = 250;
const dragThresholdPx = 4;
const copiedLabelMs = 1500;

type NotesState =
  | { status: "loading"; notes: readonly NoteSummary[] }
  | { status: "ready"; notes: readonly NoteSummary[]; hasMore: boolean }
  | { status: "error"; notes: readonly NoteSummary[]; message: string };

type NoteMenu = { note: NoteSummary; left: number; top: number };

function hostOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function titleOf(note: NoteSummary): string {
  return note.pageTitle ?? hostOf(note.pageUrl) ?? "Screen capture";
}

export function NotesView(): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [state, setState] = useState<NotesState>({ status: "loading", notes: [] });
  const [menu, setMenu] = useState<NoteMenu | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<NoteSummary | null>(null);
  const openedFrom = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);

  const load = useCallback(async (search: string, offset: number): Promise<void> => {
    const current = ++sequence.current;
    setState((previous) => ({ status: "loading", notes: offset === 0 ? [] : previous.notes }));
    try {
      const page = await listNotes(search, pageSize, offset);
      if (current !== sequence.current) return;
      setState((previous) => ({
        status: "ready",
        notes: offset === 0 ? page : [...previous.notes, ...page],
        hasMore: page.length === pageSize,
      }));
    } catch (error: unknown) {
      if (current !== sequence.current) return;
      setState((previous) => ({
        status: "error",
        notes: previous.notes,
        message: describeInvokeError(error, "Notes could not be loaded"),
      }));
    }
  }, []);

  useEffect(() => {
    void cleanupUnsavedNotes().catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), searchDebounceMs);
    return (): void => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    void load(debouncedQuery, 0);
  }, [debouncedQuery, load]);

  useEffect(() => {
    if (menu === null) return;
    function closeOutside(event: PointerEvent): void {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenu(null);
    }
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") setMenu(null);
    }
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return (): void => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  async function copyMarkdown(note: NoteSummary): Promise<boolean> {
    setMenu(null);
    setActionError(null);
    try {
      await copyNote(note.id);
      return true;
    } catch (error: unknown) {
      setActionError(describeInvokeError(error, "Couldn't copy this note."));
      return false;
    }
  }

  async function openPage(note: NoteSummary): Promise<void> {
    setMenu(null);
    setActionError(null);
    try {
      await openNoteUrl(note.id);
    } catch (error: unknown) {
      setActionError(describeInvokeError(error, "Couldn't open the page."));
    }
  }

  async function copyUrl(note: NoteSummary): Promise<void> {
    setMenu(null);
    setActionError(null);
    if (note.pageUrl === null) return;
    try {
      await navigator.clipboard.writeText(note.pageUrl);
    } catch {
      setActionError("Couldn't copy the URL.");
    }
  }

  async function remove(note: NoteSummary): Promise<void> {
    setMenu(null);
    const approved = await confirm("Delete this note? This can't be undone.", {
      title: "Delete note",
      kind: "warning",
    });
    if (!approved) return;
    try {
      await deleteNote(note.id);
      await load(debouncedQuery, 0);
    } catch (error: unknown) {
      setActionError(describeInvokeError(error, "Couldn't delete this note."));
    }
  }

  function drag(note: NoteSummary): void {
    setActionError(null);
    startNoteDrag(note.id).catch(() => setActionError("Couldn't start dragging this note."));
  }

  function showNote(note: NoteSummary): void {
    setMenu(null);
    if (document.activeElement instanceof HTMLElement) openedFrom.current = document.activeElement;
    setOpenNote(note);
  }

  function closeNote(): void {
    setOpenNote(null);
    openedFrom.current?.focus();
    openedFrom.current = null;
  }

  function openMenu(note: NoteSummary, x: number, y: number): void {
    setMenu({
      note,
      left: Math.max(8, Math.min(x, window.innerWidth - 204)),
      top: Math.max(8, Math.min(y, window.innerHeight - 200)),
    });
  }

  const loading = state.status === "loading";
  const searching = debouncedQuery !== "";

  return (
    <section aria-labelledby="notes-title" className="px-7 pb-12 pt-7">
      <header className="flex items-end justify-between gap-6 border-b border-stone-300/80 pb-5 dark:border-white/10">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">Developer tools</p>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] text-[#171815] dark:text-stone-100" id="notes-title">Notes</h1>
          <p className="mt-1.5 text-xs leading-5 text-stone-500 dark:text-stone-400">Saved notes stay on this device. Copy one to paste the image and its Markdown into an AI chat.</p>
        </div>
        <button
          aria-label="Refresh notes"
          className="grid size-8 shrink-0 place-items-center rounded-md border border-stone-300 bg-white text-stone-500 outline-none transition hover:border-stone-400 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:opacity-50 dark:border-white/10 dark:bg-[#30312e] dark:text-stone-400 dark:hover:text-white"
          disabled={loading}
          type="button"
          onClick={() => void load(debouncedQuery, 0)}
        >
          <RefreshCw aria-hidden="true" className={loading ? "animate-spin" : ""} size={14} />
        </button>
      </header>

      <label className="mt-5 flex min-h-10 items-center gap-2.5 rounded-lg border border-stone-300/80 bg-white/65 px-3 focus-within:ring-2 focus-within:ring-[var(--snaphub-accent)] dark:border-white/9 dark:bg-[#2b2c29]">
        <Magnifier aria-hidden="true" className="shrink-0 text-stone-400" size={14} />
        <input
          aria-label="Search notes"
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-stone-400"
          placeholder="Search page, URL or comment"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>

      {state.status === "error" ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-red-300/40 bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:border-red-300/15 dark:bg-red-300/5 dark:text-red-200" role="alert">
          <span>{state.message}</span>
          <button className="rounded px-2 py-1 text-[12px] font-semibold outline-none hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)]" type="button" onClick={() => void load(debouncedQuery, 0)}>Retry</button>
        </div>
      ) : null}
      {actionError === null ? null : <div className="mt-4 rounded-md border border-red-300/40 bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:border-red-300/15 dark:bg-red-300/5 dark:text-red-200" role="alert">{actionError}</div>}

      {loading && state.notes.length === 0 ? (
        <div aria-label="Loading notes" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4" role="status">
          {Array.from({ length: 8 }, (_, index) => <div className="aspect-[4/3] animate-pulse rounded-lg border border-stone-300/60 bg-stone-200/60 dark:border-white/6 dark:bg-white/4" key={index} />)}
        </div>
      ) : null}

      {state.status === "ready" && state.notes.length === 0 ? (
        <div className="mt-5 grid min-h-64 place-items-center rounded-lg border border-dashed border-stone-300 bg-white/35 px-6 text-center dark:border-white/10 dark:bg-white/[0.015]">
          <div>
            <span className="mx-auto grid size-10 place-items-center rounded-lg border border-stone-300 bg-white text-stone-400 dark:border-white/10 dark:bg-[#2b2c29]"><NotePin aria-hidden="true" size={17} /></span>
            <p className="mx-auto mt-3 max-w-xs text-[13px] leading-5 text-stone-500 dark:text-stone-400">
              {searching ? `No notes match '${debouncedQuery}'` : "No notes yet. Use the Note tool (N) in a capture, then press S to save it."}
            </p>
          </div>
        </div>
      ) : null}

      {state.notes.length > 0 ? (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {state.notes.map((note) => (
            <NoteCard key={note.id} note={note} onCopy={copyMarkdown} onDrag={drag} onMenu={openMenu} onOpen={showNote} />
          ))}
        </div>
      ) : null}

      {state.status === "ready" && state.hasMore ? (
        <div className="mt-5 flex justify-center">
          <button className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-stone-600 outline-none transition hover:border-stone-400 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:border-white/10 dark:bg-[#333431] dark:text-stone-300" type="button" onClick={() => void load(debouncedQuery, state.notes.length)}>Load more</button>
        </div>
      ) : null}

      {menu === null ? null : (
        <div className="fixed z-50 w-[196px] overflow-hidden rounded-lg border border-stone-300 bg-[#f7f7f4] p-1.5 text-stone-700 shadow-[0_18px_48px_rgba(0,0,0,0.28)] dark:border-white/12 dark:bg-[#2b2c29] dark:text-stone-200" ref={menuRef} role="menu" style={{ left: menu.left, top: menu.top }}>
          <MenuItem icon={NotePin} label="Open note" onClick={() => showNote(menu.note)} />
          <MenuItem icon={Copy} label="Copy Markdown" onClick={() => void copyMarkdown(menu.note)} />
          <MenuItem disabled={menu.note.pageUrl === null} icon={Eye} label="Open page" onClick={() => void openPage(menu.note)} />
          <MenuItem disabled={menu.note.pageUrl === null} icon={Copy} label="Copy URL" onClick={() => void copyUrl(menu.note)} />
          <div className="my-1 border-t border-stone-300/80 dark:border-white/9" />
          <MenuItem destructive icon={Trash2} label="Delete" onClick={() => void remove(menu.note)} />
        </div>
      )}

      {openNote === null ? null : (
        <NoteDialog
          createdLabel={formatDate(openNote.createdAt)}
          host={hostOf(openNote.pageUrl)}
          note={openNote}
          title={titleOf(openNote)}
          onClose={closeNote}
          onCopy={copyMarkdown}
          onOpenPage={openPage}
        />
      )}
    </section>
  );
}

type NoteCardProps = {
  note: NoteSummary;
  onCopy: (note: NoteSummary) => Promise<boolean>;
  onDrag: (note: NoteSummary) => void;
  onMenu: (note: NoteSummary, x: number, y: number) => void;
  onOpen: (note: NoteSummary) => void;
};

function NoteCard({ note, onCopy, onDrag, onMenu, onOpen }: NoteCardProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);
  const title = titleOf(note);
  const host = hostOf(note.pageUrl);

  useEffect(() => (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  async function copy(): Promise<void> {
    if (!(await onCopy(note))) return;
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), copiedLabelMs);
  }

  function onPointerMove(event: React.PointerEvent): void {
    const start = pressStart.current;
    if (start === null || dragStarted.current || (event.buttons & 1) === 0) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < dragThresholdPx) return;
    dragStarted.current = true;
    pressStart.current = null;
    onDrag(note);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
      event.preventDefault();
      const box = event.currentTarget.getBoundingClientRect();
      onMenu(note, box.left + 16, box.top + 16);
    }
  }

  return (
    <div className="group relative min-w-0">
      <button
        aria-label={`Open note: ${title}`}
        aria-haspopup="dialog"
        className="block w-full min-w-0 overflow-hidden rounded-lg border border-stone-300/80 bg-white text-left outline-none transition-colors hover:border-stone-400 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:border-white/9 dark:bg-[#2b2c29] dark:hover:border-white/16"
        type="button"
        onClick={() => {
          pressStart.current = null;
          if (dragStarted.current) {
            dragStarted.current = false;
            return;
          }
          onOpen(note);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onMenu(note, event.clientX, event.clientY);
        }}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragStarted.current = false;
          pressStart.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={onPointerMove}
        onPointerUp={() => { pressStart.current = null; }}
      >
        <div className="grid aspect-[4/3] place-items-center overflow-hidden bg-stone-100 dark:bg-[#20211f]">
          <img alt="" className="h-full w-full object-contain" draggable={false} loading="lazy" src={note.imageUrl} />
        </div>
        <div className="border-t border-stone-200 px-3 py-2.5 dark:border-white/8">
          <h2 className="truncate text-[13px] font-semibold text-stone-800 dark:text-stone-200" title={title}>{title}</h2>
          {host !== null && host !== title ? <p className="mt-0.5 truncate font-mono text-[11px] text-stone-400">{host}</p> : null}
          {note.firstComment === null || note.firstComment === "" ? null : <p className="mt-1.5 line-clamp-2 text-[12px] leading-4 text-stone-500 dark:text-stone-400">{note.firstComment}</p>}
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-stone-400 dark:text-stone-500">
            <span className="flex items-center gap-1"><Clock aria-hidden="true" size={10} />{formatDate(note.createdAt)}</span>
            <span>{note.pinCount === 1 ? "1 pin" : `${String(note.pinCount)} pins`}</span>
          </div>
        </div>
      </button>
      <button
        aria-label={`Copy Markdown for ${title}`}
        className="absolute right-2 top-2 flex h-7 items-center gap-1 rounded-md bg-black/60 px-2 text-[11px] font-semibold text-white opacity-0 outline-none backdrop-blur transition-opacity duration-150 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] group-focus-within:opacity-100 group-hover:opacity-100"
        type="button"
        onClick={() => void copy()}
      >
        {copied ? <Check aria-hidden="true" size={12} /> : <Copy aria-hidden="true" size={12} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

type MenuItemProps = { icon: typeof Eye; label: string; onClick: () => void; disabled?: boolean; destructive?: boolean };

function MenuItem({ icon: Icon, label, onClick, disabled = false, destructive = false }: MenuItemProps): React.JSX.Element {
  return (
    <button
      aria-label={label}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:cursor-not-allowed disabled:opacity-35 ${destructive ? "text-red-600 hover:bg-red-500/8 dark:text-red-300" : "hover:bg-black/5 dark:hover:bg-white/7"}`}
      disabled={disabled}
      role="menuitem"
      type="button"
      onClick={onClick}
    >
      <Icon aria-hidden="true" size={13} />
      {label}
    </button>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
