import { useCallback, useEffect, useRef, useState } from "react";
import { describeInvokeError, readNote, type NoteSummary } from "../../lib/tauri";
import { Cancel as Close, Clock, Copy, Tick as Check, View as Eye } from "../icons";
import { LAYER } from "../layers";
import { Button } from "../ui/Button";

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

  return (
    <div
      className="fixed inset-0 grid place-items-center bg-black/55 p-6 transition-opacity duration-150 ease-out starting:opacity-0 motion-reduce:transition-none"
      style={{ zIndex: LAYER.dialog }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby="note-dialog-title"
        aria-modal="true"
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-content/10 bg-background-base shadow-2xl transition-[transform,opacity] duration-200 ease-arrive starting:scale-95 starting:opacity-0 motion-reduce:transition-none"
        ref={dialogRef}
        role="dialog"
        onKeyDown={onKeyDown}
      >
        <header className="flex items-start justify-between gap-4 border-b border-content/10 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-content" id="note-dialog-title" title={title}>{title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-content/60">
              {host !== null && host !== title ? <span className="font-mono">{host}</span> : null}
              <span className="flex items-center gap-1"><Clock aria-hidden="true" size={10} />{createdLabel}</span>
              <span>{note.pinCount === 1 ? "1 pin" : `${String(note.pinCount)} pins`}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button className="h-8" onClick={() => void copy()}>
              <span aria-hidden="true" className="relative grid size-3 place-items-center">
            <Copy className={`absolute transition-[opacity,transform,filter] duration-200 ease-arrive motion-reduce:transition-none ${copied ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0"}`} size={12} />
            <Check className={`absolute transition-[opacity,transform,filter] duration-200 ease-arrive motion-reduce:transition-none ${copied ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]"}`} size={12} />
          </span>
              {copied ? "Copied" : "Copy Markdown"}
            </Button>
            <Button className="h-8" disabled={note.pageUrl === null} onClick={() => void onOpenPage(note)}>
              <Eye aria-hidden="true" size={12} />
              Open page
            </Button>
            <button
              aria-label="Close note"
              className="grid size-8 place-items-center rounded-md text-content/60 outline-none transition-colors duration-120 hover:bg-content/6 hover:text-content focus-visible:ring-2 focus-visible:ring-accent/50 motion-reduce:transition-none"
              ref={closeRef}
              type="button"
              onClick={onClose}
            >
              <Close aria-hidden="true" size={14} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid place-items-center bg-content/6">
            {imageFailed ? (
              <p className="px-6 py-10 text-[12px] text-content/60">The screenshot for this note is missing.</p>
            ) : (
              <img alt={`Screenshot for ${title}`} className="max-h-[52vh] w-full object-contain" draggable={false} src={note.imageUrl} onError={() => setImageFailed(true)} />
            )}
          </div>
          <div className="px-5 py-4">
            {markdown.status === "loading" ? (
              <div aria-label="Loading note" className="space-y-2" role="status">
                {["w-11/12", "w-3/4", "w-5/6", "w-3/5"].map((width) => <div className={`h-3 animate-pulse rounded bg-content/8 motion-reduce:animate-none ${width}`} key={width} />)}
              </div>
            ) : null}
            {markdown.status === "error" ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger" role="alert">
                <span>{markdown.message}</span>
                <Button variant="ghost" onClick={() => void load()}>Retry</Button>
              </div>
            ) : null}
            {markdown.status === "ready" ? (
              <pre
                aria-label="Note Markdown"
                className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-content outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
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
