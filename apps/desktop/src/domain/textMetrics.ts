/** Line height multiple shared by the canvas, the editor and the Rust export. */
export const TEXT_LINE_HEIGHT = 1.2;
/** Smallest text box, so an empty or one-letter annotation stays clickable. */
export const MIN_TEXT_WIDTH = 24;

export type TextBlockSize = { width: number; height: number };

let measureContext: CanvasRenderingContext2D | null | undefined;

function context(): CanvasRenderingContext2D | null {
  if (measureContext !== undefined) return measureContext;
  measureContext = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  return measureContext;
}

/**
 * Measures multi-line text in CSS pixels. Uses a shared canvas context for real glyph widths
 * and falls back to an average-glyph estimate where canvas is unavailable (jsdom, workers).
 */
export function measureTextBlock(text: string, fontSize: number, fontFamily: string): TextBlockSize {
  const lines = text.split("\n");
  const ctx = context();
  let widest = 0;
  for (const line of lines) {
    let width = line.length * fontSize * 0.54;
    if (ctx !== null) {
      ctx.font = `${String(fontSize)}px "${fontFamily}"`;
      width = ctx.measureText(line).width;
    }
    widest = Math.max(widest, width);
  }
  return { width: Math.max(MIN_TEXT_WIDTH, Math.ceil(widest)), height: Math.ceil(lines.length * fontSize * TEXT_LINE_HEIGHT) };
}
