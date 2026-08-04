import { z } from "zod";

export const readableSourceSchema = z.enum(["accessible-text", "ocr-text", "visual-only"]);
export const readerModeSchema = z.enum(["auto", "plain", "markdown", "json", "code", "table"]);

export const readableRegionSchema = z.object({
  source: readableSourceSchema,
  text: z.string(),
  imagePath: z.string(),
  language: z.string().nullable(),
  warning: z.string().nullable(),
});

export type ReadableRegion = z.infer<typeof readableRegionSchema> & {
  imageUrl: string;
};
export type ReaderMode = z.infer<typeof readerModeSchema>;

export function detectReaderMode(text: string): Exclude<ReaderMode, "auto"> {
  const value = text.trim();
  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      JSON.parse(value);
      return "json";
    } catch {
      // Continue through the deterministic format checks.
    }
  }
  if (/^\s*\|.+\|\s*$/m.test(value) && /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/m.test(value)) {
    return "table";
  }
  if (/^(#{1,6}\s|[-*]\s|\d+\.\s|```|>\s|\*\*.+\*\*)/m.test(value)) {
    return "markdown";
  }
  if (/^(?:\s{2,}|\t|[{}();])|(?:const|let|function|class|SELECT|curl)\s/m.test(value)) {
    return "code";
  }
  return "plain";
}

export function parsePipeTable(text: string): string[][] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) => line.slice(1, -1).split("|").map((cell) => cell.trim()));
  return rows.filter((row, index) => index !== 1 || !row.every((cell) => /^:?-+:?$/.test(cell)));
}
