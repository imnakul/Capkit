import { z } from "zod";
import { rectSchema } from "./capture";

/* -------------------------------------------------------------------------- */
/* Sources and devices                                                         */
/* -------------------------------------------------------------------------- */

export const recordingSourceKindSchema = z.enum(["display", "window"]);
export type RecordingSourceKind = z.infer<typeof recordingSourceKindSchema>;

export const recordingSourceSchema = z.object({
  id: z.string().min(1),
  kind: recordingSourceKindSchema,
  title: z.string(),
  bounds: rectSchema,
  displayId: z.string(),
  scaleFactor: z.number(),
  isPrimary: z.boolean(),
  refreshRate: z.number().default(60),
  /** A one-off downscaled preview; absent when that source could not be captured. */
  thumbnailPath: z.string().nullable(),
});

export type RecordingSource = z.infer<typeof recordingSourceSchema>;

export const audioDeviceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.enum(["microphone", "system"]),
  isDefault: z.boolean(),
});

export type AudioDevice = z.infer<typeof audioDeviceSchema>;

export const recordingStatsSchema = z.object({
  paused: z.boolean().default(false),
  elapsedSeconds: z.number(),
  encodedFrames: z.number(),
  droppedFrames: z.number(),
  bytesWritten: z.number(),
});

export type RecordingStats = z.infer<typeof recordingStatsSchema>;

export const recordingArtifactsSchema = z.object({
  id: z.string().min(1),
  directory: z.string(),
  videoPath: z.string(),
  cursorPath: z.string().nullable(),
  systemAudioPath: z.string().nullable(),
  microphonePath: z.string().nullable(),
  cameraPath: z.string().nullable().default(null),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  durationSeconds: z.number(),
  stats: recordingStatsSchema,
});

export type RecordingArtifacts = z.infer<typeof recordingArtifactsSchema>;

/* -------------------------------------------------------------------------- */
/* What the user is about to record                                            */
/* -------------------------------------------------------------------------- */

/**
 * How much of the screen to record.
 *
 * Every mode resolves to one display plus a crop before it reaches the backend,
 * because the encoder cannot change frame size once it has started.
 */
export const captureModeSchema = z.enum(["display", "window", "region"]);
export type CaptureMode = z.infer<typeof captureModeSchema>;

export const frameRates = [24, 30, 60] as const;
export type FrameRate = (typeof frameRates)[number] | "native";

export const countdownSeconds = [0, 3, 5, 10] as const;
export type CountdownSeconds = (typeof countdownSeconds)[number];

export const recorderSettingsSchema = z.object({
  mode: captureModeSchema,
  sourceId: z.string(),
  fps: z.union([z.literal(24), z.literal(30), z.literal(60), z.literal("native")]),
  countdown: z.union([z.literal(0), z.literal(3), z.literal(5), z.literal(10)]),
  systemAudio: z.boolean(),
  microphone: z.boolean(),
  microphoneDeviceId: z.string(),
  systemAudioDeviceId: z.string().default(""),
  /**
   * Burns the hardware cursor into the video.
   *
   * Off by default: the cursor is recorded as a separate track instead, which
   * is what lets the editor smooth its motion and zoom towards clicks. Turning
   * this on permanently bakes the raw pointer into the frames.
   */
  captureCursor: z.boolean(),
});

export type RecorderSettings = z.infer<typeof recorderSettingsSchema>;

export const defaultRecorderSettings: RecorderSettings = {
  mode: "display",
  sourceId: "",
  fps: 30,
  countdown: 3,
  systemAudio: true,
  microphone: false,
  microphoneDeviceId: "",
  systemAudioDeviceId: "",
  captureCursor: false,
};

export const recordRegionSelectionSchema = z.object({
  displayId: z.string().min(1),
  bounds: rectSchema,
});

export type RecordRegionSelection = z.infer<typeof recordRegionSelectionSchema>;

/** localStorage key holding the recorder's last configuration. */
export const recorderSettingsStorageKey = "capkit.recorder.settings.v1";

/** localStorage key holding recordings the user has not yet discarded. */
export const recordingLibraryStorageKey = "capkit.recordings.v1";

export const recordingLibrarySchema = z.array(recordingArtifactsSchema);

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                                */
/* -------------------------------------------------------------------------- */

/** `mm:ss`, or `h:mm:ss` once a recording passes an hour. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return hours > 0 ? `${String(hours)}:${pad(minutes)}:${pad(rest)}` : `${String(minutes)}:${pad(rest)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(Math.round(bytes))} B`;
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Fraction of frames the pacer had to repeat because nothing new arrived.
 *
 * Windows Graphics Capture only delivers on change, so a still screen legitimately
 * repeats frames; this is a health signal, not an error rate.
 */
export function repeatRatio(stats: RecordingStats): number {
  const total = stats.encodedFrames;
  return total <= 0 ? 0 : stats.droppedFrames / total;
}

/** Resolves a frame-rate setting against a display: "native" follows the
 * monitor's refresh rate, floored at 60. */
export function resolveFrameRate(fps: FrameRate, refreshRate: number): number {
  if (fps !== "native") return fps;
  return Math.max(60, Math.round(refreshRate));
}

/** Turns a chosen source and mode into the payload the backend expects. */
export function toRecordingRequest(
  settings: RecorderSettings,
  source: RecordingSource,
  region: { x: number; y: number; width: number; height: number } | null,
): {
  displayId: string;
  region: { x: number; y: number; width: number; height: number } | null;
  fps: number;
  captureCursor: boolean;
  systemAudio: boolean;
  microphone: boolean;
  microphoneDeviceId: string | null;
  systemAudioDeviceId: string | null;
} {
  // A window is recorded as the crop of its display that it currently occupies,
  // so it survives being resized mid-recording.
  const crop = settings.mode === "region" ? region : settings.mode === "window" ? source.bounds : null;
  return {
    displayId: source.displayId,
    region: crop,
    fps: resolveFrameRate(settings.fps, source.refreshRate),
    captureCursor: settings.captureCursor,
    systemAudio: settings.systemAudio,
    microphone: settings.microphone,
    microphoneDeviceId: settings.microphoneDeviceId === "" ? null : settings.microphoneDeviceId,
    systemAudioDeviceId: settings.systemAudioDeviceId === "" ? null : settings.systemAudioDeviceId,
  };
}

/** Reads stored recorder settings, falling back to defaults on any problem. */
export function readRecorderSettings(raw: string | null): RecorderSettings {
  if (raw === null) return defaultRecorderSettings;
  const parsed = recorderSettingsSchema.safeParse(JSON.parse(raw) as unknown);
  return parsed.success ? parsed.data : defaultRecorderSettings;
}
