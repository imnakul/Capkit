import type { Rect, RecognizedLine, RecognizedText } from "../domain/capture";
import { findSensitiveSpans, maskPreview, type SensitiveKind } from "@snaphub/devtools-protocol/sensitive";

export {
  SENSITIVE_KIND_LABELS,
  findSensitiveSpans,
  maskPreview,
  maskSensitiveText,
  passesLuhn,
  shannonEntropy,
} from "@snaphub/devtools-protocol/sensitive";
export type { SensitiveKind, SensitiveSpan, WebSensitiveKind } from "@snaphub/devtools-protocol/sensitive";

export type RedactionSuggestion = {
  id: string;
  kind: SensitiveKind | "password";
  /** A masked preview, so the list never repeats a full secret. */
  preview: string;
  /** Selection-local logical pixels, padded and clamped to the selection. */
  bounds: Rect;
};

const BOUNDS_PADDING = 3;

type PositionedWord = {
  start: number;
  end: number;
  bounds: Rect;
};

// OCR line text is its words joined by separators that vary by script, so
// each word is located in order rather than assuming single spaces.
function positionWords(line: RecognizedLine): PositionedWord[] {
  const positioned: PositionedWord[] = [];
  let cursor = 0;
  for (const word of line.words) {
    if (word.text.length === 0) continue;
    const start = line.text.indexOf(word.text, cursor);
    if (start < 0) continue;
    positioned.push({ start, end: start + word.text.length, bounds: word.bounds });
    cursor = start + word.text.length;
  }
  return positioned;
}

function unionBounds(rects: readonly Rect[]): Rect {
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function padAndClamp(rect: Rect, limit: { width: number; height: number }): Rect {
  const left = Math.max(0, rect.x - BOUNDS_PADDING);
  const top = Math.max(0, rect.y - BOUNDS_PADDING);
  const right = Math.min(limit.width, rect.x + rect.width + BOUNDS_PADDING);
  const bottom = Math.min(limit.height, rect.y + rect.height + BOUNDS_PADDING);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/**
 * Turns recognised text into redaction suggestions. Each match covers the
 * whole words it touches, because OCR reports boxes per word, not per character.
 */
export function suggestRedactions(
  recognized: RecognizedText,
  selection: { width: number; height: number },
): RedactionSuggestion[] {
  const suggestions: RedactionSuggestion[] = [];
  recognized.lines.forEach((line, lineIndex) => {
    const words = positionWords(line);
    for (const span of findSensitiveSpans(line.text)) {
      const covered = words.filter((word) => word.start < span.end && word.end > span.start);
      if (covered.length === 0) continue;
      const bounds = padAndClamp(unionBounds(covered.map((word) => word.bounds)), selection);
      if (bounds.width <= 0 || bounds.height <= 0) continue;
      suggestions.push({
        id: `${String(lineIndex)}:${String(span.start)}`,
        kind: span.kind,
        preview: maskPreview(line.text.slice(span.start, span.end)),
        bounds,
      });
    }
  });
  return suggestions;
}

/** What the browser extension reports for one piece of sensitive page text. */
export type WebSensitiveReport = {
  kind: SensitiveKind | "password";
  /** Already masked by the extension; masked again here so it never leaks. */
  preview: string;
  /** Display-local logical pixels, one rectangle per line the text spans. */
  rects: readonly Rect[];
};

/**
 * Turns the extension's exact rectangles into redaction suggestions in
 * selection-local pixels. Rectangles outside the selection are dropped and the
 * rest are padded and clamped, so a blackout never spills past the capture.
 */
export function suggestRedactionsFromWeb(
  reports: readonly WebSensitiveReport[],
  selection: Rect,
): RedactionSuggestion[] {
  const suggestions: RedactionSuggestion[] = [];
  reports.forEach((report, reportIndex) => {
    report.rects.forEach((rect, rectIndex) => {
      const local = { x: rect.x - selection.x, y: rect.y - selection.y, width: rect.width, height: rect.height };
      if (local.x >= selection.width || local.y >= selection.height || local.x + local.width <= 0 || local.y + local.height <= 0) return;
      const bounds = padAndClamp(local, selection);
      if (bounds.width <= 0 || bounds.height <= 0) return;
      suggestions.push({
        id: `web:${String(reportIndex)}:${String(rectIndex)}`,
        kind: report.kind,
        preview: maskPreview(report.preview),
        bounds,
      });
    });
  });
  return suggestions;
}
