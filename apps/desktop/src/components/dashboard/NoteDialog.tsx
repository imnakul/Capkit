import { useCallback, useEffect, useRef, useState } from "react";
import { describeInvokeError, readNote, type NoteSummary } from "../../lib/tauri";
import { Cancel as Close, Clock, Copy, Tick as Check, View as Eye } from "../icons";

const copiedLabelMs = 1500;

type MarkdownState =
  | { status: "loading" }
  | { status: "ready"; markdown: string }
  | { status: "error"; message: string };

type NoteDialogProps = {
  note: NoteSummary;
  title: string;
  host: string | null;
  createdLabel: string;
  onClose: () => void;
  onCopy: (note: NoteSummary) => Promise<boolean>;
  onOpenPage: (note: NoteSummary) => Promise<void>;
};

/**
 * Shows one saved note in full: the screenshot at full width and the note's complete Markdown,
 * which the card can only preview. Escape, the backdrop and Close dismiss it; focus moves to
 * Close on open and stays inside the dialog until it closes.
 */
export function NoteDialog({ note, title, host, createdLabel, onClose, onCopy, onOpenPage }: NoteDialogProps): React.JSX.Element {
  const [markdown, setMarkdown] = useState<MarkdownState>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const copiedTimer = useRef<number | null>(null);
  const request = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const current = ++request.current;
    setMarkdown({ status: "loading" });
    try {
      const text = await readNote(note.id);
      if (current === request.current) setMarkdown({ status: "ready", markdown: text });
    } catch (error: unknown) {
      if (current === request.current) {
        setMarkdown({ status: "error", message: describeInvokeError(error, "Couldn't load this note.") });
      }
    }
  }, [note.id]);

  useEffect(() => {
    void load();
    return (): void => {
      request.current += 1;
    };
  }, [load]);

  useEffect(() => {
    closeRef.current?.focus();
    return (): void => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || dialogRef.current === null) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex='0']");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function copy(): Promise<void> {
    if (!(await onCopy(note))) return;
    setCopied(true);
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), copiedLabelMs);
  }

  const actionClass =
    "flex h-8 items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 text-[12px] font-semibold text-stone-700 outline-none transition hover:border-stone-400 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-[#333431] dark:text-stone-200 dark:hover:border-white/20";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-6 transition-opacity duration-150 ease-out starting:opacity-0 motion-reduce:transition-none"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby="note-dialog-title"
        aria-modal="true"
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-stone-300 bg-[#f7f7f4] shadow-[0_24px_64px_rgba(0,0,0,0.35)] dark:border-white/12 dark:bg-[#262724]"
        ref={dialogRef}
        role="dialog"
        onKeyDown={onKeyDown}
      >
        <header className="flex items-start justify-between gap-4 border-b border-stone-300/80 px-5 py-4 dark:border-white/9">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-stone-900 dark:text-stone-100" id="note-dialog-title" title={title}>{title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-400 dark:text-stone-500">
              {host !== null && host !== title ? <span className="font-mono">{host}</span> : null}
              <span className="flex items-center gap-1"><Clock aria-hidden="true" size={10} />{createdLabel}</span>
              <span>{note.pinCount === 1 ? "1 pin" : `${String(note.pinCount)} pins`}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className={actionClass} type="button" onClick={() => void copy()}>
              {copied ? <Check aria-hidden="true" size={12} /> : <Copy aria-hidden="true" size={12} />}
              {copied ? "Copied" : "Copy Markdown"}
            </button>
            <button className={actionClass} disabled={note.pageUrl === null} type="button" onClick={() => void onOpenPage(note)}>
              <Eye aria-hidden="true" size={12} />
              Open page
            </button>
            <button
              aria-label="Close note"
              className="grid size-8 place-items-center rounded-md text-stone-500 outline-none transition hover:bg-black/5 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:text-stone-400 dark:hover:bg-white/7 dark:hover:text-white"
              ref={closeRef}
              type="button"
              onClick={onClose}
            >
              <Close aria-hidden="true" size={14} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid place-items-center bg-stone-100 dark:bg-[#1d1e1c]">
            {imageFailed ? (
              <p className="px-6 py-10 text-[12px] text-stone-500 dark:text-stone-400">The screenshot for this note is missing.</p>
            ) : (
              <img alt={`Screenshot for ${title}`} className="max-h-[52vh] w-full object-contain" draggable={false} src={note.imageUrl} onError={() => setImageFailed(true)} />
            )}
          </div>
          <div className="px-5 py-4">
            {markdown.status === "loading" ? (
              <div aria-label="Loading note" className="space-y-2" role="status">
                {["w-11/12", "w-3/4", "w-5/6", "w-3/5"].map((width) => <div className={`h-3 animate-pulse rounded bg-stone-200 dark:bg-white/6 ${width}`} key={width} />)}
              </div>
            ) : null}
            {markdown.status === "error" ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-red-300/40 bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:border-red-300/15 dark:bg-red-300/5 dark:text-red-200" role="alert">
                <span>{markdown.message}</span>
                <button className="rounded px-2 py-1 text-[12px] font-semibold outline-none hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)]" type="button" onClick={() => void load()}>Retry</button>
              </div>
            ) : null}
            {markdown.status === "ready" ? (
              <pre
                aria-label="Note Markdown"
                className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-stone-700 outline-none focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:text-stone-300"
                tabIndex={0}
              >
                {markdown.markdown}
              </pre>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
