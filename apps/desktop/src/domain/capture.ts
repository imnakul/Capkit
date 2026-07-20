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

export const completionActionSchema = z.enum(["copy", "save", "save-as", "pin"]);
export type CompletionAction = z.infer<typeof completionActionSchema>;

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
