import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { z } from "zod";
import type { AnnotationScene } from "../domain/annotations";
import type { SnaphubSettings } from "../domain/settings";
import {
  mediaFileSchema,
  mediaFolderSchema,
  toMediaItems,
  type MediaFolder,
  type MediaItem,
} from "../domain/showcase";
import {
  captureSessionSchema,
  completionActionSchema,
  detectedTargetSchema,
  displaySchema,
  pointSchema,
  rectSchema,
  scrollingCaptureResultSchema,
  savedCaptureSchema,
  type CaptureSession,
  type CompletionAction,
  type DetectedTarget,
  type Display,
  type Point,
  type Rect,
  type ScrollingCaptureResult,
  type SavedCapture,
} from "../domain/capture";

const backendSessionSchema = captureSessionSchema.omit({ snapshotUrl: true }).extend({
  snapshotPath: z.string(),
});
const onScreenSessionSchema = z.object({ display: displaySchema });

export const completionResultSchema = z
  .discriminatedUnion("status", [
    z.object({
      action: completionActionSchema,
      cleanupWarning: z.string().nullable(),
      diagnostic: z.null(),
      outputPath: z.string().nullable(),
      status: z.literal("completed"),
    }),
    z.object({
      action: z.literal("copy-and-save"),
      cleanupWarning: z.null(),
      diagnostic: z.string().min(1),
      outputPath: z.null(),
      status: z.literal("save-pending"),
    }),
  ])
  .superRefine((result, context) => {
    if (result.status === "completed" && result.action === "copy-and-save" && result.outputPath === null) {
      context.addIssue({
        code: "custom",
        message: "A completed Copy & Save action requires an output path",
        path: ["outputPath"],
      });
    }
  });

const registeredGlobalShortcutsSchema = z.object({
  capture: z.string().min(1),
  captureAndCopy: z.string().min(1),
  captureAndSave: z.string().min(1),
  onScreenToggle: z.string().min(1),
  recordToggle: z.string().min(1),
});

export type CompletionResult = z.infer<typeof completionResultSchema>;
export type OnScreenSession = z.infer<typeof onScreenSessionSchema>;

export async function updateGlobalShortcuts(
  shortcuts: SnaphubSettings["shortcuts"],
): Promise<SnaphubSettings["shortcuts"]> {
  if (!isTauri()) return shortcuts;
  const raw: unknown = await invoke("update_global_shortcuts", {
    shortcuts: {
      capture: shortcuts.capture,
      captureAndCopy: shortcuts.captureAndCopy,
      captureAndSave: shortcuts.captureAndSave,
      onScreenToggle: shortcuts.onScreenToggle,
      recordToggle: shortcuts.recordToggle,
    },
  });
  return {
    ...shortcuts,
    ...registeredGlobalShortcutsSchema.parse(raw),
  };
}

export async function requestCapture(): Promise<CaptureSession> {
  if (!isTauri()) return createDemoSession();

  const raw: unknown = await invoke("begin_capture");
  const parsed = backendSessionSchema.parse(raw);
  const snapshotUrl = convertFileSrc(parsed.snapshotPath);
  // CaptureBackdrop decodes this URL after the session commits and reveals the
  // surface only after the image has painted.
  return {
    id: parsed.id,
    phase: parsed.phase,
    display: parsed.display,
    snapshotUrl,
    colorSpace: parsed.colorSpace,
    createdAt: parsed.createdAt,
  };
}

export async function showCaptureSurface(): Promise<void> {
  if (!isTauri()) return;
  await invoke("show_capture_surface");
}

export async function requestOnScreenSession(): Promise<OnScreenSession> {
  if (!isTauri()) return { display: createDemoSession().display };
  const raw: unknown = await invoke("on_screen_session");
  return onScreenSessionSchema.parse(raw);
}

export async function requestOnScreenSnapshot(
  revealAfterCapture = true,
): Promise<string> {
  if (!isTauri()) return createDemoSession().snapshotUrl;
  const raw: unknown = await invoke("on_screen_snapshot", {
    revealAfter: revealAfterCapture,
  });
  const parsed = backendSessionSchema.parse(raw);
  const snapshotUrl = convertFileSrc(parsed.snapshotPath);
  await preloadImage(snapshotUrl);
  return snapshotUrl;
}

export async function showOnScreenSurface(): Promise<void> {
  if (!isTauri()) return;
  await invoke("on_screen_ready");
}

export async function dismissOnScreen(): Promise<void> {
  if (!isTauri()) return;
  await invoke("dismiss_on_screen");
}

export async function saveOnScreenCapture(): Promise<string> {
  if (!isTauri()) return "Demo/CapKit.png";
  const raw: unknown = await invoke("save_on_screen_capture");
  return z.string().min(1).parse(raw);
}

export async function dismissCapture(): Promise<void> {
  if (!isTauri()) return;
  await invoke("dismiss_capture");
}

export async function completeCapture(
  action: CompletionAction,
  sessionId: string,
  selection: Rect,
  scene: AnnotationScene,
): Promise<CompletionResult> {
  if (!isTauri()) {
    return createDemoCompletionResult(action);
  }

  const raw: unknown = await invoke("complete_capture", {
    request: { action, sessionId, selection, scene },
  });
  return completionResultSchema.parse(raw);
}

export async function retryCaptureSave(sessionId: string): Promise<CompletionResult> {
  if (!isTauri()) return createDemoCompletionResult("copy-and-save");
  const raw: unknown = await invoke("retry_capture_save", { sessionId });
  return completionResultSchema.parse(raw);
}

export async function cancelCapture(sessionId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("cancel_capture", { sessionId });
}

type ScrollingMode = "automatic" | "manual-start" | "manual-add";

export async function captureScrolling(
  mode: ScrollingMode,
  sessionId: string,
  selection: Rect,
): Promise<ScrollingCaptureResult> {
  if (!isTauri()) throw new Error("Scrolling capture requires the Windows desktop app");
  const command =
    mode === "automatic"
      ? "capture_scrolling_automatic"
      : mode === "manual-start"
        ? "begin_manual_scrolling_capture"
        : "add_manual_scrolling_frame";
  const raw: unknown = await invoke(command, {
    request: { sessionId, selection, maxFrames: 18, wheelSteps: 6 },
  });
  const parsed = scrollingCaptureResultSchema.parse(raw);
  const previewUrl = convertFileSrc(parsed.outputPath);
  await preloadImage(previewUrl);
  return { ...parsed, previewUrl };
}

export async function cancelManualScrolling(sessionId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("cancel_manual_scrolling_capture", { sessionId });
}

export async function discardScrollingOutput(outputPath: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("discard_scrolling_output", { outputPath });
}

export async function completeScrollingCapture(
  action: CompletionAction,
  sessionId: string,
  outputPath: string,
): Promise<CompletionResult> {
  if (!isTauri()) return createDemoCompletionResult(action);
  const raw: unknown = await invoke("complete_scrolling_capture", {
    action,
    sessionId,
    outputPath,
  });
  return completionResultSchema.parse(raw);
}

export async function detectTargets(
  point: Point,
  display: Display,
  includeUiRegions: boolean,
): Promise<readonly DetectedTarget[]> {
  const safePoint = pointSchema.parse(point);
  if (!isTauri()) {
    const demo = { x: window.innerWidth * 0.07, y: window.innerHeight * 0.1, width: window.innerWidth * 0.62, height: window.innerHeight * 0.68 };
    const inside =
      safePoint.x >= demo.x &&
      safePoint.x <= demo.x + demo.width &&
      safePoint.y >= demo.y &&
      safePoint.y <= demo.y + demo.height;
    return inside
      ? [{ id: "demo-window", title: "Product workspace", kind: "window", bounds: demo }]
      : [];
  }
  const scale = display.scaleFactor;
  const physicalPoint = {
    x: (display.bounds.x + safePoint.x) * scale,
    y: (display.bounds.y + safePoint.y) * scale,
  };
  const raw: unknown = await invoke("detect_targets", {
    point: physicalPoint,
    includeUiRegions,
  });
  return toDisplayLocalTargets(z.array(detectedTargetSchema).parse(raw), display);
}

export async function getSaveDirectory(): Promise<string> {
  if (!isTauri()) return "Pictures\\Capkit";
  const raw: unknown = await invoke("get_save_directory");
  return z.string().min(1).parse(raw);
}

export async function setSaveDirectory(directory: string): Promise<string> {
  if (!isTauri()) return directory;
  const raw: unknown = await invoke("set_save_directory", { directory });
  return z.string().min(1).parse(raw);
}

export async function resetSaveDirectory(): Promise<string> {
  if (!isTauri()) return "Pictures\\Capkit";
  const raw: unknown = await invoke("reset_save_directory");
  return z.string().min(1).parse(raw);
}

export async function listSavedCaptures(): Promise<readonly SavedCapture[]> {
  if (!isTauri()) return [];
  const raw: unknown = await invoke("list_saved_captures");
  return z.array(savedCaptureSchema).parse(raw).map((capture) => ({
    ...capture,
    thumbnailUrl: convertFileSrc(capture.thumbnailPath),
  }));
}

export async function listenForSavedCapture(callback: () => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return listen("snaphub://capture-saved", callback);
}

export async function openSaveDirectory(): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_save_directory");
}

export async function getRecordingDirectory(): Promise<string> {
  if (!isTauri()) return "Videos\\Capkit";
  const raw: unknown = await invoke("get_recording_directory");
  return z.string().min(1).parse(raw);
}

export async function setRecordingDirectory(directory: string): Promise<string> {
  if (!isTauri()) return directory;
  const raw: unknown = await invoke("set_recording_directory", { directory });
  return z.string().min(1).parse(raw);
}

export async function resetRecordingDirectory(): Promise<string> {
  if (!isTauri()) return "Videos\\Capkit";
  const raw: unknown = await invoke("reset_recording_directory");
  return z.string().min(1).parse(raw);
}

export async function openRecordingDirectory(): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_recording_directory");
}

export async function openSavedCapture(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_saved_capture", { path });
}

export async function deleteSavedCapture(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("delete_saved_capture", { path });
}

/**
 * Adapts a saved capture into Showcase media.
 *
 * The full-size file already sits inside the asset-protocol scope, so the
 * studio composes against it rather than the library thumbnail.
 */
export function savedCaptureToMedia(capture: SavedCapture): MediaItem {
  return {
    path: capture.path,
    fileName: capture.fileName,
    sizeBytes: capture.sizeBytes,
    modifiedAt: capture.modifiedAt,
    url: isTauri() ? convertFileSrc(capture.path) : capture.thumbnailUrl,
  };
}

/**
 * Registers images the user picked from anywhere on disk and returns them with
 * renderable asset URLs. Outside the desktop shell this resolves to nothing —
 * the Showcase studio falls back to a browser file input there.
 */
export async function importMediaFiles(paths: readonly string[]): Promise<readonly MediaItem[]> {
  if (!isTauri()) return [];
  const raw: unknown = await invoke("import_media_files", { paths });
  return toMediaItems(z.array(mediaFileSchema).parse(raw), convertFileSrc);
}

/** Lists the images inside an attached background folder, newest first. */
export async function listFolderImages(directory: string): Promise<MediaFolder> {
  if (!isTauri()) return { path: directory, name: directory, images: [] };
  const raw: unknown = await invoke("list_folder_images", { directory });
  const parsed = mediaFolderSchema.parse(raw);
  return { path: parsed.path, name: parsed.name, images: toMediaItems(parsed.images, convertFileSrc) };
}

export function describeInvokeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  if (typeof error === "string" && error.trim() !== "") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = Reflect.get(error, "message");
    if (typeof message === "string" && message.trim() !== "") return message;
  }
  return fallback;
}

export async function listTargets(display: Display): Promise<readonly DetectedTarget[]> {
  if (!isTauri()) {
    return [
      {
        id: "demo-window",
        title: "Product workspace",
        kind: "window",
        bounds: {
          x: window.innerWidth * 0.07,
          y: window.innerHeight * 0.1,
          width: window.innerWidth * 0.62,
          height: window.innerHeight * 0.68,
        },
      },
    ];
  }

  const raw: unknown = await invoke("list_targets");
  return toDisplayLocalTargets(z.array(detectedTargetSchema).parse(raw), display);
}

function toDisplayLocalTargets(
  targets: readonly DetectedTarget[],
  display: Display,
): readonly DetectedTarget[] {
  const scale = display.scaleFactor;
  return targets.map((target) => ({
    ...target,
    bounds: {
      x: target.bounds.x / scale - display.bounds.x,
      y: target.bounds.y / scale - display.bounds.y,
      width: target.bounds.width / scale,
      height: target.bounds.height / scale,
    },
  }));
}

export async function listenForCaptureRequest(callback: () => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return listen("snaphub://capture-requested", callback);
}

function preloadImage(source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      image.src = "";
      reject(new Error("The frozen screenshot could not be loaded in time"));
    }, 5_000);
    image.onload = (): void => {
      window.clearTimeout(timeout);
      resolve();
    };
    image.onerror = (): void => {
      window.clearTimeout(timeout);
      reject(new Error("The frozen screenshot could not be loaded"));
    };
    image.src = source;
  });
}

function createDemoCompletionResult(action: CompletionAction): CompletionResult {
  return {
    action,
    cleanupWarning: null,
    diagnostic: null,
    outputPath:
      action === "save" || action === "copy-and-save" ? "Demo/Capkit.png" : null,
    status: "completed",
  };
}

function createDemoSession(): CaptureSession {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return captureSessionSchema.parse({
    id: crypto.randomUUID(),
    phase: "snapshot-ready",
    display: {
      id: "demo-display",
      name: "Demo display",
      bounds: { x: 0, y: 0, width, height },
      scaleFactor: window.devicePixelRatio,
      isPrimary: true,
    },
    snapshotUrl: "",
    colorSpace: "srgb",
    createdAt: new Date().toISOString(),
  });
}

export function validateSelection(value: unknown): Rect {
  return rectSchema.parse(value);
}
