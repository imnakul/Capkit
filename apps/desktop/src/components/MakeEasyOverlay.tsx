import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { Rect } from "../domain/capture";
import {
  detectReaderMode,
  parsePipeTable,
  type ReadableRegion,
  type ReaderMode,
} from "../domain/readable";
import { useSnaphubSettings } from "../domain/settings";
import {
  dismissMakeEasy,
  extractReadableRegion,
  requestMakeEasySession,
  restartMakeEasySelection,
  setMakeEasyAlwaysOnTop,
  showMakeEasyReader,
  showMakeEasySurface,
} from "../lib/tauri";
import {
  Cancel,
  Copy,
  MagicWand,
  Pin,
  Refresh,
  Scan,
  Tick,
  View,
} from "./icons";

type Phase = "loading" | "selecting" | "extracting" | "reader" | "error";
type ReaderTheme = "paper" | "dark" | "contrast";
type Point = { x: number; y: number };

const markdownComponents: Components = {
  a: ({ children }) => <span className="font-medium underline decoration-stone-400 underline-offset-2">{children}</span>,
  h1: ({ children }) => <h1 className="mb-4 mt-7 text-2xl font-semibold tracking-tight first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-3 mt-7 text-xl font-semibold tracking-tight">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-6 text-base font-semibold">{children}</h3>,
  p: ({ children }) => <p className="my-3">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-current/30 pl-4 opacity-80">{children}</blockquote>,
  code: ({ children }) => <code className="rounded bg-black/8 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10">{children}</code>,
  pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-lg border border-current/10 bg-black/5 p-4 font-mono text-[0.86em] dark:bg-white/5">{children}</pre>,
  table: ({ children }) => <table className="my-5 w-full border-collapse text-left">{children}</table>,
  th: ({ children }) => <th className="border-b-2 border-current/25 px-3 py-2 text-xs font-semibold uppercase tracking-wider">{children}</th>,
  td: ({ children }) => <td className="border-b border-current/12 px-3 py-2 align-top">{children}</td>,
};

export function MakeEasyOverlay(): React.JSX.Element {
  const { settings } = useSnaphubSettings();
  const [phase, setPhase] = useState<Phase>("loading");
  const [start, setStart] = useState<Point | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [result, setResult] = useState<ReadableRegion | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void requestMakeEasySession()
      .then((session) => {
        setSnapshotUrl(session.snapshotUrl);
        return showMakeEasySurface();
      })
      .then(() => {
        if (active) setPhase("selecting");
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(String(reason));
          setPhase("error");
        }
      });
    return (): void => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") void dismissMakeEasy();
    };
    window.addEventListener("keydown", handleKey);
    return (): void => window.removeEventListener("keydown", handleKey);
  }, []);

  const begin = useCallback((event: React.PointerEvent<HTMLElement>): void => {
    if (phase !== "selecting" || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    setStart(point);
    setSelection({ ...point, width: 0, height: 0 });
  }, [phase]);

  const move = useCallback((event: React.PointerEvent<HTMLElement>): void => {
    if (start === null || phase !== "selecting") return;
    setSelection({
      x: Math.min(start.x, event.clientX),
      y: Math.min(start.y, event.clientY),
      width: Math.abs(event.clientX - start.x),
      height: Math.abs(event.clientY - start.y),
    });
  }, [phase, start]);

  const finish = useCallback(async (event: React.PointerEvent<HTMLElement>): Promise<void> => {
    if (start === null || selection === null || phase !== "selecting") return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setStart(null);
    if (selection.width < 24 || selection.height < 24) {
      setSelection(null);
      return;
    }
    setPhase("extracting");
    try {
      const next = await extractReadableRegion(selection);
      setResult(next);
      setPhase("reader");
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await showMakeEasyReader(selection);
    } catch (reason: unknown) {
      setError(String(reason));
      setPhase("error");
    }
  }, [phase, selection, start]);

  if (phase === "reader" && result !== null) {
    return <Reader result={result} onNewRegion={() => {
      setResult(null);
      setSelection(null);
      setPhase("selecting");
      void restartMakeEasySelection();
    }} />;
  }

  return (
    <main
      aria-label="Make it Easy region selector"
      autoFocus
      className="relative h-screen w-screen cursor-crosshair select-none overflow-hidden bg-transparent"
      role="application"
      style={{ "--capkit-accent": settings.accentColor } as React.CSSProperties}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") void dismissMakeEasy();
      }}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={(event) => void finish(event)}
    >
      {snapshotUrl === "" ? null : (
        <img
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full object-fill"
          draggable="false"
          src={snapshotUrl}
        />
      )}
      {selection === null ? <div className="pointer-events-none absolute inset-0 bg-black/28" /> : null}
      {selection !== null ? (
        <>
          <div
            className="pointer-events-none absolute border-2 border-[var(--capkit-accent)] bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]"
            style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}
          />
          <div
            className="pointer-events-none absolute -translate-y-full rounded-t-md bg-[#171815] px-2.5 py-1 font-mono text-[11px] font-semibold text-white shadow-lg"
            style={{ left: selection.x, top: selection.y }}
          >
            {Math.round(selection.width)} × {Math.round(selection.height)}
          </div>
        </>
      ) : null}
      <div className="pointer-events-none absolute left-1/2 top-8 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-white/15 bg-[#171815]/94 px-3.5 py-2 text-xs font-medium text-white shadow-2xl backdrop-blur-md">
        <Scan size={15} />
        Drag over anything that is hard to read
        <kbd className="ml-2 border-l border-white/15 pl-3 font-mono text-[10px] text-white/55">ESC</kbd>
      </div>
      <button
        aria-label="Cancel Make it Easy"
        className="absolute right-8 top-8 grid size-9 cursor-pointer place-items-center rounded-lg border border-white/15 bg-[#171815]/94 text-white/70 shadow-xl outline-none backdrop-blur-md transition hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--capkit-accent)]"
        title="Cancel (Escape)"
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => void dismissMakeEasy()}
      >
        <Cancel size={17} />
      </button>
      {phase === "extracting" ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/45">
          <div className="flex items-center gap-3 rounded-xl border border-white/12 bg-[#171815] px-5 py-4 text-sm font-semibold text-white shadow-2xl">
            <MagicWand className="animate-pulse text-[var(--capkit-accent)]" size={18} />
            Making it easier to read…
          </div>
        </div>
      ) : null}
      {phase === "error" ? (
        <div className="absolute inset-0 grid cursor-default place-items-center bg-black/50">
          <div className="w-[min(440px,calc(100vw-32px))] rounded-xl border border-white/10 bg-[#20211f] p-5 text-white shadow-2xl">
            <p className="text-sm font-semibold">This region could not be read</p>
            <p className="mt-2 text-xs leading-5 text-white/60">{error}</p>
            <button aria-label="Close Make it Easy" className="mt-4 rounded-md bg-white px-3 py-2 text-xs font-semibold text-stone-900" type="button" onClick={() => void dismissMakeEasy()}>Close</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

type ReaderProps = { result: ReadableRegion; onNewRegion: () => void };

function Reader({ result, onNewRegion }: ReaderProps): React.JSX.Element {
  const [mode, setMode] = useState<ReaderMode>("auto");
  const [theme, setTheme] = useState<ReaderTheme>("paper");
  const [showOriginal, setShowOriginal] = useState(result.source === "visual-only");
  const [fontSize, setFontSize] = useState(17);
  const [lineHeight, setLineHeight] = useState(1.7);
  const [pinned, setPinned] = useState(true);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(result.text);
  const [copied, setCopied] = useState(false);
  const resolvedMode = mode === "auto" ? detectReaderMode(text) : mode;

  const copyText = async (): Promise<void> => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  const themeClasses = theme === "paper"
    ? "bg-[#f6f3eb] text-[#242520]"
    : theme === "dark"
      ? "bg-[#242523] text-[#eceae3]"
      : "bg-black text-white";

  return (
    <main className="h-screen w-screen overflow-hidden rounded-xl border border-white/10 bg-[#1e1f1d] text-stone-200 shadow-2xl" role="application">
      <header className="flex h-12 items-center gap-2 border-b border-white/8 px-3" data-tauri-drag-region>
        <div className="grid size-7 place-items-center rounded-md bg-[#d9ff43] text-[#171815]"><MagicWand size={15} /></div>
        <div className="min-w-0 flex-1" data-tauri-drag-region>
          <p className="truncate text-xs font-semibold">Make it Easy</p>
          <p className="text-[10px] text-white/45">{result.source === "ocr-text" ? `Windows OCR${result.language === null ? "" : ` · ${result.language}`}` : "Enhanced original"}</p>
        </div>
        <ReaderIconButton label="Choose another region" onClick={onNewRegion}><Refresh size={15} /></ReaderIconButton>
        <ReaderIconButton label={pinned ? "Allow other windows above" : "Keep reader on top"} active={pinned} onClick={() => {
          const next = !pinned;
          setPinned(next);
          void setMakeEasyAlwaysOnTop(next);
        }}><Pin size={15} /></ReaderIconButton>
        <ReaderIconButton label="Close Make it Easy" onClick={() => void dismissMakeEasy()}><Cancel size={15} /></ReaderIconButton>
      </header>

      <div className="flex h-[calc(100%-3rem)] flex-col">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/8 px-3 py-2">
          <div className="flex rounded-md bg-black/22 p-0.5">
            <Segment active={!showOriginal} label="Readable" onClick={() => setShowOriginal(false)} />
            <Segment active={showOriginal} label="Original" onClick={() => setShowOriginal(true)} />
          </div>
          {!showOriginal ? (
            <div className="ml-1 flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
              {(["auto", "plain", "markdown", "json", "code", "table"] as const).map((item) => (
                <button aria-label={`Use ${item} reading mode`} aria-pressed={mode === item} className="rounded px-2 py-1 text-[10px] font-semibold capitalize text-white/50 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-[#d9ff43] aria-pressed:bg-white/9 aria-pressed:text-white" key={item} type="button" onClick={() => setMode(item)}>{item}</button>
              ))}
            </div>
          ) : <div className="flex-1" />}
          <select aria-label="Reader theme" className="h-7 rounded-md border border-white/10 bg-[#292a27] px-2 text-[10px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#d9ff43]" value={theme} onChange={(event) => setTheme(event.currentTarget.value as ReaderTheme)}>
            <option value="paper">Paper</option><option value="dark">Dark</option><option value="contrast">High contrast</option>
          </select>
        </div>

        {result.warning !== null ? (
          <div className="border-b border-amber-300/15 bg-amber-300/7 px-4 py-2 text-[11px] leading-4 text-amber-100/75">{result.warning}</div>
        ) : null}

        <section className={`min-h-0 flex-1 overflow-auto ${themeClasses}`} aria-label={showOriginal ? "Original selected region" : "Readable content"}>
          {showOriginal ? (
            <div className="grid min-h-full place-items-center p-5">
              <img alt="Original selected region" className="max-h-full max-w-full rounded border border-black/10 object-contain shadow-xl contrast-[1.08]" src={result.imageUrl} />
            </div>
          ) : editing ? (
            <textarea aria-label="Edit extracted text" className="h-full w-full resize-none bg-transparent p-7 font-mono text-sm leading-6 outline-none" spellCheck="false" value={text} onChange={(event) => setText(event.currentTarget.value)} />
          ) : (
            <div className="mx-auto max-w-3xl p-7 sm:p-9" style={{ fontSize, lineHeight }}>
              <ReadableContent mode={resolvedMode} text={text} />
            </div>
          )}
        </section>

        <footer className="flex h-12 items-center gap-2 border-t border-white/8 px-3">
          {!showOriginal ? (
            <>
              <button aria-label="Decrease text size" className="size-7 rounded border border-white/10 text-xs hover:bg-white/7" type="button" onClick={() => setFontSize((value) => Math.max(13, value - 1))}>A−</button>
              <button aria-label="Increase text size" className="size-7 rounded border border-white/10 text-xs hover:bg-white/7" type="button" onClick={() => setFontSize((value) => Math.min(28, value + 1))}>A+</button>
              <button aria-label="Change line spacing" className="h-7 rounded border border-white/10 px-2 font-mono text-[10px] hover:bg-white/7" type="button" onClick={() => setLineHeight((value) => value >= 1.9 ? 1.45 : Number((value + 0.2).toFixed(2)))}>Line {lineHeight.toFixed(2)}</button>
              <button aria-label={editing ? "Finish editing extracted text" : "Edit extracted text"} aria-pressed={editing} className="h-7 rounded px-2 text-[10px] font-semibold text-white/60 hover:bg-white/7 hover:text-white" type="button" onClick={() => setEditing((value) => !value)}>{editing ? "Done editing" : "Edit text"}</button>
            </>
          ) : <span className="text-[10px] text-white/40">Original region · locally captured</span>}
          <div className="flex-1" />
          <button aria-label="Copy readable text" className="flex h-8 items-center gap-1.5 rounded-md bg-[#d9ff43] px-3 text-[11px] font-semibold text-[#171815] outline-none transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40" disabled={text.length === 0} type="button" onClick={() => void copyText()}>{copied ? <Tick size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy text"}</button>
        </footer>
      </div>
    </main>
  );
}

function ReadableContent({ mode, text }: { mode: Exclude<ReaderMode, "auto">; text: string }): React.JSX.Element {
  if (text.trim() === "") return <EmptyReadable />;
  if (mode === "markdown") return <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>;
  if (mode === "json") {
    try {
      const value: unknown = JSON.parse(text);
      return <pre className="overflow-x-auto font-mono text-[0.88em] leading-relaxed">{JSON.stringify(value, null, 2)}</pre>;
    } catch {
      return <pre className="whitespace-pre-wrap font-mono text-[0.88em]">{text}</pre>;
    }
  }
  if (mode === "code") return <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[0.88em]">{text}</pre>;
  if (mode === "table") {
    const rows = parsePipeTable(text);
    return <div className="overflow-x-auto"><table className="w-full border-collapse text-left"><tbody>{rows.map((row, rowIndex) => <tr key={`${String(rowIndex)}-${row.join("-")}`}>{row.map((cell, cellIndex) => {
      const Cell = rowIndex === 0 ? "th" : "td";
      return <Cell className="border-b border-current/15 px-3 py-2 align-top" key={`${String(cellIndex)}-${cell}`}>{cell}</Cell>;
    })}</tr>)}</tbody></table></div>;
  }
  return <div className="whitespace-pre-wrap">{text}</div>;
}

function EmptyReadable(): React.JSX.Element {
  return <div className="mx-auto max-w-sm py-16 text-center"><View className="mx-auto opacity-30" size={28} /><p className="mt-3 text-sm font-semibold">No text was found</p><p className="mt-1 text-xs opacity-60">Switch to Original, or choose a tighter region with clearer text.</p></div>;
}

function Segment({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }): React.JSX.Element {
  return <button aria-label={`Show ${label.toLowerCase()}`} aria-pressed={active} className="rounded px-2.5 py-1 text-[10px] font-semibold text-white/50 outline-none transition focus-visible:ring-2 focus-visible:ring-[#d9ff43] aria-pressed:bg-white/10 aria-pressed:text-white" type="button" onClick={onClick}>{label}</button>;
}

function ReaderIconButton({ active = false, children, label, onClick }: { active?: boolean; children: React.ReactNode; label: string; onClick: () => void }): React.JSX.Element {
  return <button aria-label={label} aria-pressed={active} className="grid size-7 place-items-center rounded-md text-white/55 outline-none transition hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-[#d9ff43] aria-pressed:bg-white/10 aria-pressed:text-[#d9ff43]" title={label} type="button" onClick={onClick}>{children}</button>;
}
