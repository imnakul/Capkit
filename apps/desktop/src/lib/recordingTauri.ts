import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import {
  audioDeviceSchema,
  recordingArtifactsSchema,
  recordingSourceSchema,
  recordingStatsSchema,
  recordRegionSelectionSchema,
  type AudioDevice,
  type RecorderSettings,
  type RecordingArtifacts,
  type RecordingSource,
  type RecordingStats,
  type RecordRegionSelection,
  toRecordingRequest,
} from "../domain/recording";
import { cursorTrackSchema, type CursorTrack } from "../domain/cursorTrack";

/** Displays and windows the user can record. Empty outside the desktop shell. */
export async function listRecordingSources(): Promise<readonly RecordingSource[]> {
  if (!isTauri()) return [];
  const raw = await invoke("list_recording_sources");
  return recordingSourceSchema.array().parse(raw);
}

export async function listAudioDevices(): Promise<readonly AudioDevice[]> {
  if (!isTauri()) return [];
  const raw = await invoke("list_audio_devices");
  return audioDeviceSchema.array().parse(raw);
}

export async function recordingSupported(): Promise<boolean> {
  if (!isTauri()) return false;
  return Boolean(await invoke("recording_supported"));
}

export async function startRecording(
  settings: RecorderSettings,
  source: RecordingSource,
  region: { x: number; y: number; width: number; height: number } | null,
): Promise<void> {
  await invoke("start_recording", { request: toRecordingRequest(settings, source, region) });
}

export async function stopRecording(): Promise<RecordingArtifacts> {
  const raw = await invoke("stop_recording");
  return recordingArtifactsSchema.parse(raw);
}

export async function cancelRecording(): Promise<void> {
  await invoke("cancel_recording");
}

/** Live counters, or `null` when nothing is recording. */
export async function recordingStatus(): Promise<RecordingStats | null> {
  const raw = await invoke("recording_status");
  return raw === null ? null : recordingStatsSchema.parse(raw);
}

/** Hides a window from screen capture, so the dock never lands in the video. */
export async function setCaptureExclusion(label: string, excluded: boolean): Promise<void> {
  await invoke("set_capture_exclusion", { label, excluded });
}

/**
 * Reveals the recorder and excludes it from capture in one step.
 *
 * The exclusion is a property of the live window and does not survive
 * recreation, so it is applied next to the reveal rather than at build time.
 */
export async function recorderReady(): Promise<void> {
  await invoke("recorder_ready");
}

/** Pauses or resumes; returns the paused state the backend settled on. */
export async function setRecordingPaused(paused: boolean): Promise<boolean> {
  return Boolean(await invoke("set_recording_paused", { paused }));
}

/** Fits the recorder window to its content; the backend anchors and clamps it. */
export async function fitRecorder(width: number, height: number): Promise<void> {
  await invoke("fit_recorder", { width, height });
}

/**
 * Shows a click-through outline around exactly what is about to be, or is
 * being, recorded. Bounds are in physical desktop pixels, matching a source's
 * own `bounds`.
 */
export async function showRecordingBorder(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<void> {
  await invoke("show_recording_border", { bounds });
}

export async function hideRecordingBorder(): Promise<void> {
  await invoke("hide_recording_border").catch(() => undefined);
}

export async function openCamera(): Promise<void> {
  await invoke("open_camera");
}

export async function cameraReady(mode: "live" | "blocked"): Promise<void> {
  await invoke("camera_ready", { mode });
}

export async function prepareCameraPermission(): Promise<void> {
  await invoke("prepare_camera_permission");
}

export async function openCameraPrivacySettings(): Promise<void> {
  await invoke("open_camera_privacy_settings");
}

export async function closeCamera(): Promise<void> {
  await invoke("close_camera");
}

export async function openRecorder(): Promise<void> {
  await invoke("open_recorder");
}

export async function closeRecorder(): Promise<void> {
  await invoke("close_recorder");
}

export async function beginCameraTrack(extension: string): Promise<void> {
  await invoke("begin_camera_track", { extension });
}

export async function appendCameraChunk(bytes: Uint8Array): Promise<void> {
  await invoke("append_camera_chunk", bytes);
}

/** Asks the camera window to flush its track, then waits for `finished` or
 * 3000 ms. A timeout is not an error: the track keeps whatever was flushed.
 * Subscribing before emitting closes the race between the two. */
export async function finishCameraTrack(timeoutMs = 3000): Promise<void> {
  const { emit, listen } = await import("@tauri-apps/api/event");
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, timeoutMs);
    void listen("snaphub://camera-track-finished", () => done())
      .then(() => emit("snaphub://camera-track-finish"))
      .catch(() => undefined);
  });
}

export async function openRecordRegion(displayId: string): Promise<void> {
  await invoke("open_record_region", { displayId });
}

export async function recordRegionReady(): Promise<void> {
  await invoke("record_region_ready");
}

export async function confirmRecordRegion(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<void> {
  await invoke("confirm_record_region", box);
}

export async function cancelRecordRegion(): Promise<void> {
  await invoke("cancel_record_region");
}

export async function listenForRecordRegion(
  onSelected: (selection: RecordRegionSelection) => void,
  onCancelled: () => void,
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  const stopSelected = await listen<unknown>("snaphub://record-region-selected", (event) => {
    const parsed = recordRegionSelectionSchema.safeParse(event.payload);
    if (!parsed.success) {
      console.error("SH-RECORD-REGION-001", parsed.error);
      return;
    }
    onSelected(parsed.data);
  });
  const stopCancelled = await listen("snaphub://record-region-cancelled", () => onCancelled());
  return (): void => {
    stopSelected();
    stopCancelled();
  };
}

export async function listenForAudioFailure(onFailed: (kind: string) => void): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  const stop = await listen<{ kind: string }>("snaphub://recording-audio-failed", (event) => {
    if (event.payload.kind !== "system" && event.payload.kind !== "microphone") return;
    onFailed(event.payload.kind);
  });
  return (): void => {
    stop();
  };
}

/** Reads the cursor samples recorded alongside a video. */
export async function loadCursorTrack(path: string): Promise<CursorTrack | null> {
  try {
    const response = await fetch(convertFileSrc(path));
    return cursorTrackSchema.parse(await response.json());
  } catch {
    // A recording without a readable cursor track still plays; it just cannot
    // offer smooth-cursor or zoom-on-click.
    return null;
  }
}

/** Renderable URL for a recorded artefact. */
export function recordingSrc(path: string): string {
  return isTauri() ? convertFileSrc(path) : path;
}
