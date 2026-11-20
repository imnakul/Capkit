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
  StickyNote,
  Refresh as RefreshCw,
  View as Eye,
} from "../icons";
import { LAYER } from "../layers";
import { Button } from "../ui/Button";
import { CopyButton } from "../ui/CopyButton";
import { PageHeader } from "../ui/PageHeader";
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
    <section aria-labelledby="notes-title" className="px-7 pb-8 pt-4">
      <PageHeader
        title="Page notes"
        trailing={
          <Button aria-label="Refresh notes" disabled={loading} variant="ghost" onClick={() => void load(debouncedQuery, 0)}>
            <RefreshCw aria-hidden="true" className={loading ? "animate-spin motion-reduce:animate-none" : ""} size={13} />
          </Button>
        }
      />

      <label className="flex min-h-10 items-center gap-2.5 rounded-lg border border-content/10 bg-content/4 px-3 focus-within:ring-2 focus-within:ring-accent/50">
        <Magnifier aria-hidden="true" className="shrink-0 text-content/45" size={14} />
        <input
          aria-label="Search notes"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-content outline-none placeholder:text-content/45"
          placeholder="Search page, URL or comment"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>

      {state.status === "error" ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger" role="alert">
          <span>{state.message}</span>
          <Button variant="ghost" onClick={() => void load(debouncedQuery, 0)}>Retry</Button>
        </div>
      ) : null}
      {actionError === null ? null : <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger" role="alert">{actionError}</div>}

      {loading && state.notes.length === 0 ? (
        <div aria-label="Loading notes" className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(18rem,22rem))] gap-3" role="status">
          {Array.from({ length: 8 }, (_, index) => <div className="aspect-[4/3] animate-pulse rounded-lg border border-content/8 bg-content/6 motion-reduce:animate-none" key={index} />)}
        </div>
      ) : null}

      {state.status === "ready" && state.notes.length === 0 ? (
        <div className="mt-5 grid min-h-64 place-items-center rounded-lg border border-dashed border-content/15 px-6 text-center">
          <div>
            <span className="mx-auto grid size-10 place-items-center rounded-lg bg-content/6 text-content/45"><StickyNote aria-hidden="true" size={17} /></span>
            <p className="mx-auto mt-3 max-w-xs text-[12px] leading-5 text-content/60">
              {searching ? `No notes match '${debouncedQuery}'` : "No notes yet. Use the Note tool (N) in a capture, then press S to save it."}
            </p>
          </div>
        </div>
      ) : null}

      {state.notes.length > 0 ? (
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(18rem,22rem))] gap-3">
          {state.notes.map((note) => (
            <NoteCard key={note.id} note={note} onCopy={copyMarkdown} onDrag={drag} onMenu={openMenu} onOpen={showNote} />
          ))}
        </div>
      ) : null}

      {state.status === "ready" && state.hasMore ? (
        <div className="mt-5 flex justify-center">
          <Button onClick={() => void load(debouncedQuery, state.notes.length)}>Load more</Button>
        </div>
      ) : null}

      {menu === null ? null : (
        <div className="fixed w-[196px] overflow-hidden rounded-lg border border-content/10 bg-background-base p-1.5 text-content shadow-xl" ref={menuRef} role="menu" style={{ left: menu.left, top: menu.top, zIndex: LAYER.popover }}>
          <MenuItem icon={StickyNote} label="Open note" onClick={() => showNote(menu.note)} />
          <MenuItem icon={Copy} label="Copy Markdown" onClick={() => void copyMarkdown(menu.note)} />
          <MenuItem disabled={menu.note.pageUrl === null} icon={Eye} label="Open page" onClick={() => void openPage(menu.note)} />
          <MenuItem disabled={menu.note.pageUrl === null} icon={Copy} label="Copy URL" onClick={() => void copyUrl(menu.note)} />
          <div className="my-1 border-t border-content/10" />
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
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), copiedLabelMs);
    if (!(await onCopy(note))) {
      window.clearTimeout(timer.current);
      setCopied(false);
    }
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
        className="block w-full min-w-0 overflow-hidden rounded-lg border border-content/10 bg-content/4 text-left outline-none transition-colors duration-150 hover:border-content/20 focus-visible:ring-2 focus-visible:ring-accent/50 motion-reduce:transition-none"
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
        <div className="grid aspect-[16/10] place-items-center overflow-hidden bg-content/6 outline outline-1 -outline-offset-1 outline-content/10">
          <img alt="" className="h-full w-full object-contain" draggable={false} loading="lazy" src={note.imageUrl} />
        </div>
        <div className="border-t border-content/8 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="min-w-0 truncate text-[13px] font-medium text-content" title={title}>{title}</h2>
            {host !== null && host !== title ? <p className="max-w-[45%] shrink-0 truncate font-mono text-[11px] text-content/60" title={host}>{host}</p> : null}
          </div>
          {note.firstComment === null || note.firstComment === "" ? null : <p className="mt-1.5 line-clamp-2 text-[12px] leading-4 text-content/60">{note.firstComment}</p>}
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] tabular-nums text-content/60">
            <span className="flex items-center gap-1"><Clock aria-hidden="true" size={10} />{formatDate(note.createdAt)}</span>
            <span>{note.pinCount === 1 ? "1 pin" : `${String(note.pinCount)} pins`}</span>
          </div>
        </div>
      </button>
      <CopyButton copied={copied} label={`Copy Markdown for ${title}`} onCopy={() => void copy()} />
    </div>
  );
}

type MenuItemProps = { icon: typeof Eye; label: string; onClick: () => void; disabled?: boolean; destructive?: boolean };

function MenuItem({ icon: Icon, label, onClick, disabled = false, destructive = false }: MenuItemProps): React.JSX.Element {
  return (
    <button
      aria-label={label}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12px] font-medium outline-none transition-colors duration-120 focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none ${destructive ? "text-danger hover:bg-danger/10" : "hover:bg-content/6"}`}
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
