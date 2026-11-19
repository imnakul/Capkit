import { z } from "zod";

export const pointSchema = z.object({ x: z.number(), y: z.number() });
export const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

export type Point = z.infer<typeof pointSchema>;
export type Rect = z.infer<typeof rectSchema>;

export const capturePhaseSchema = z.enum([
  "idle",
  "triggered",
  "snapshot-ready",
  "selecting",
  "editing",
  "exporting",
  "completed",
  "cancelled",
  "failed",
]);

export type CapturePhase = z.infer<typeof capturePhaseSchema>;

export const displaySchema = z.object({
  id: z.string(),
  name: z.string(),
  bounds: rectSchema,
  scaleFactor: z.number().positive(),
  isPrimary: z.boolean(),
});

export type Display = z.infer<typeof displaySchema>;

export const captureSessionSchema = z.object({
  id: z.uuid(),
  phase: capturePhaseSchema,
  display: displaySchema,
  snapshotUrl: z.string(),
  colorSpace: z.enum(["srgb", "display-p3", "hdr", "unknown"]),
  createdAt: z.iso.datetime({ offset: true }),
});

export type CaptureSession = z.infer<typeof captureSessionSchema>;

export const detectedTargetSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["window", "ui-region"]),
  bounds: rectSchema,
});

export type DetectedTarget = z.infer<typeof detectedTargetSchema>;

export const completionActionSchema = z.enum([
  "copy",
  "copy-and-save",
  "save",
  "save-as",
  "pin",
  "note-image",
]);
export type CompletionAction = z.infer<typeof completionActionSchema>;

export const colorFormatSchema = z.enum(["hex", "rgb"]);
export type ColorFormat = z.infer<typeof colorFormatSchema>;

export const pickedColorSchema = z.object({
  hex: z.string().regex(/^#[0-9A-F]{6}$/),
  copied: z.string().min(1),
});
export type PickedColor = z.infer<typeof pickedColorSchema>;

/** Word bounds are selection-local logical pixels, ready to become annotations. */
export const recognizedWordSchema = z.object({
  text: z.string(),
  bounds: rectSchema,
});
export type RecognizedWord = z.infer<typeof recognizedWordSchema>;

export const recognizedLineSchema = z.object({
  text: z.string(),
  words: z.array(recognizedWordSchema),
});
export type RecognizedLine = z.infer<typeof recognizedLineSchema>;

export const recognizedTextSchema = z.object({
  text: z.string(),
  lines: z.array(recognizedLineSchema),
  language: z.string(),
});
export type RecognizedText = z.infer<typeof recognizedTextSchema>;

export const textCopyResultSchema = z.object({
  status: z.enum(["copied", "empty"]),
  text: z.string(),
  cleanupWarning: z.string().nullable().optional(),
});
export type TextCopyResult = z.infer<typeof textCopyResultSchema>;

export const scrollingCaptureResultSchema = z.object({
  outputPath: z.string(),
  frameCount: z.number().int().positive(),
  stickyHeaderHeight: z.number().int().nonnegative(),
  stoppedReason: z.enum(["frame-limit", "end-reached", "no-progress", "manual-ready", "no-change"]),
});

export type ScrollingCaptureResult = z.infer<typeof scrollingCaptureResultSchema> & {
  previewUrl: string;
};

export const savedCaptureSchema = z.object({
  path: z.string().min(1),
  fileName: z.string().min(1),
  thumbnailPath: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sizeBytes: z.number().int().nonnegative(),
  modifiedAt: z.iso.datetime({ offset: true }),
});

export type SavedCapture = z.infer<typeof savedCaptureSchema> & {
  thumbnailUrl: string;
};

/**
 * The library entry for a path reported by the native side.
 *
 * Windows paths are case-insensitive and either separator is valid, so a
 * completion result and a directory listing can spell the same file
 * differently.
 */
export function findSavedCapture(captures: readonly SavedCapture[], path: string): SavedCapture | null {
  const normalize = (value: string): string => value.replaceAll("/", "\\").toLowerCase();
  const target = normalize(path);
  return captures.find((capture) => normalize(capture.path) === target) ?? null;
}
