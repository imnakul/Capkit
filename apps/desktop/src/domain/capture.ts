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
