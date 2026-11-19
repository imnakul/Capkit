import { buildNoteMarkdown } from "@snaphub/devtools-protocol/markdown";
import { maskSensitiveText } from "@snaphub/devtools-protocol/sensitive";
import type { InspectResult } from "../lib/tauri";
import type { Point, Rect } from "./capture";

/** What the pin landed on when the extension had nothing; `box` is in physical screen px. */
export type NoteFallback = { role: string; name: string; box: Rect };

/** One numbered pin placed during a capture; point notes have no `area`. */
export type CaptureNote = {
  id: string;
  counterId: string;
  number: number;
  anchor: Point;
  area: Rect | null;
  comment: string;
  detail: InspectResult | null;
  fallback: NoteFallback | null;
};

export type NotesAction =
  | { type: "add"; note: CaptureNote }
  | { type: "remove"; id: string }
  | { type: "comment"; id: string; comment: string }
  | { type: "lookup"; id: string; detail: InspectResult | null; fallback: NoteFallback | null }
  | { type: "sync"; counterIds: ReadonlySet<string> }
  | { type: "reset" };

/** Pins are never renumbered: the next number follows the highest in use. */
export function nextNoteNumber(notes: readonly CaptureNote[]): number {
  return notes.reduce((highest, note) => Math.max(highest, note.number), 0) + 1;
}

function update(
  notes: readonly CaptureNote[],
  id: string,
  change: (note: CaptureNote) => CaptureNote,
): readonly CaptureNote[] {
  if (!notes.some((note) => note.id === id)) return notes;
  return notes.map((note) => (note.id === id ? change(note) : note));
}

export function notesReducer(
  notes: readonly CaptureNote[],
  action: NotesAction,
): readonly CaptureNote[] {
  switch (action.type) {
    case "add":
      return [...notes, action.note];
    case "remove":
      return notes.some((note) => note.id === action.id)
        ? notes.filter((note) => note.id !== action.id)
        : notes;
    case "comment":
      return update(notes, action.id, (note) => ({ ...note, comment: action.comment }));
    case "lookup":
      return update(notes, action.id, (note) => ({
        ...note,
        detail: action.detail,
        fallback: action.fallback,
      }));
    case "sync": {
      const kept = notes.filter((note) => action.counterIds.has(note.counterId));
      return kept.length === notes.length ? notes : kept;
    }
    case "reset":
      return notes.length === 0 ? notes : [];
  }
}

export type NoteLookupStatus = "pending" | { failed: string } | "done";

/** The line under the comment box: what the pin landed on. */
export function noteSummary(note: CaptureNote, status: NoteLookupStatus | undefined): string {
  if (status === "pending") return "Reading element…";
  const elements = note.detail?.elements ?? [];
  if (elements.length > 0) {
    if (note.area !== null) {
      return `${String(elements.length)} ${elements.length === 1 ? "element" : "elements"} in area`;
    }
    return elements[0]?.label ?? "Element";
  }
  if (note.fallback !== null) return `${note.fallback.role}: ${note.fallback.name}`;
  const reason = typeof status === "object" ? status.failed : "no details";
  return `No element details (${reason})`;
}

export type NoteDelivery = {
  markdown: string;
  pageUrl: string | null;
  pageTitle: string | null;
  pinCount: number;
  detail: "extension" | "accessibility" | "none";
};

/** The Markdown for a finished capture, with anything sensitive masked. */
export function buildCaptureNote(
  notes: readonly CaptureNote[],
  screenshotPath: string,
  now: Date,
): NoteDelivery {
  const ordered = [...notes].sort((a, b) => a.number - b.number);
  const first = ordered.find((note) => note.detail?.tab != null)?.detail ?? null;
  const detail = ordered.some((note) => note.detail !== null)
    ? "extension"
    : ordered.some((note) => note.fallback !== null)
      ? "accessibility"
      : "none";
  const pageUrl = first?.tab?.url ?? null;
  const pageTitle = first?.tab?.title ?? null;
  const markdown = buildNoteMarkdown({
    pageTitle,
    pageUrl,
    capturedAt: now,
    utcOffsetMinutes: -now.getTimezoneOffset(),
    screenshotPath,
    cssViewport: first?.cssViewport ?? null,
    detail,
    notes: ordered.map((note) => ({
      number: note.number,
      comment: note.comment,
      details: note.detail !== null && note.detail.elements.length > 0 ? note.detail.elements : null,
      isArea: note.area !== null,
      fallback: note.fallback,
    })),
  });
  return {
    markdown: maskSensitiveText(markdown).text,
    pageUrl,
    pageTitle,
    pinCount: ordered.length,
    detail,
  };
}
