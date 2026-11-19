import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { z } from "zod";
import { cssViewportSchema, elementDetailsSchema } from "@snaphub/devtools-protocol/protocol";
import type { AnnotationScene } from "../domain/annotations";
import type { SnaphubSettings } from "../domain/settings";
import { updateStatusSchema, type UpdateStatus } from "../domain/updates";
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
  pickedColorSchema,
  pointSchema,
  recognizedTextSchema,
  rectSchema,
  scrollingCaptureResultSchema,
  savedCaptureSchema,
  textCopyResultSchema,
  type CaptureSession,
  type ColorFormat,
  type CompletionAction,
  type PickedColor,
  type DetectedTarget,
  type Display,
  type Point,
  type RecognizedText,
  type Rect,
  type ScrollingCaptureResult,
  type SavedCapture,
  type TextCopyResult,
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

export async function showCaptureSurface(reducedMotion = false): Promise<void> {
  if (!isTauri()) return;
  await invoke("show_capture_surface", { reducedMotion });
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
  noteId?: string,
): Promise<CompletionResult> {
  if (!isTauri()) {
    return createDemoCompletionResult(action);
  }

  const raw: unknown = await invoke("complete_capture", {
    request: { action, sessionId, selection, scene, noteId },
  });
  return completionResultSchema.parse(raw);
}

/** Copies the snapshot colour at a display-local logical point; the backend reads the physical pixel. */
export async function pickCaptureColor(
  sessionId: string,
  point: Point,
  format: ColorFormat,
): Promise<PickedColor> {
  if (!isTauri()) throw new Error("Colour picking requires the desktop app");
  const raw: unknown = await invoke("pick_capture_color", {
    request: { sessionId, point, format },
  });
  return pickedColorSchema.parse(raw);
}

export async function isTextRecognitionSupported(): Promise<boolean> {
  if (!isTauri()) return false;
  const raw: unknown = await invoke("text_recognition_supported");
  return z.boolean().parse(raw);
}

/** Reads text in the raw selection (annotations excluded). The capture stays open. */
export async function recognizeCaptureText(
  sessionId: string,
  selection: Rect,
): Promise<RecognizedText> {
  if (!isTauri()) throw new Error("Text recognition requires the desktop app");
  const raw: unknown = await invoke("recognize_capture_text", {
    request: { sessionId, selection },
  });
  return recognizedTextSchema.parse(raw);
}

/** Copies the selection's text and closes the capture; `empty` leaves it open. */
export async function copyCaptureText(
  sessionId: string,
  selection: Rect,
): Promise<TextCopyResult> {
  if (!isTauri()) throw new Error("Text recognition requires the desktop app");
  const raw: unknown = await invoke("copy_capture_text", {
    request: { sessionId, selection },
  });
  return textCopyResultSchema.parse(raw);
}

export async function retryCaptureSave(sessionId: string): Promise<CompletionResult> {
  if (!isTauri()) return createDemoCompletionResult("copy-and-save");
  const raw: unknown = await invoke("retry_capture_save", { sessionId });
  return completionResultSchema.parse(raw);
}

export async function cancelCapture(
  sessionId: string,
  reducedMotion = false,
): Promise<void> {
  if (!isTauri()) return;
  await invoke("cancel_capture", { sessionId, reducedMotion });
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

/** Shows the dashboard with a saved capture open in Showcase. The path must be inside the save folder. */
export async function openInShowcase(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_in_showcase", { path });
}

/** The capture sent to Showcase since the dashboard last asked, if any. Each request is returned once. */
export async function takePendingShowcase(): Promise<string | null> {
  if (!isTauri()) return null;
  const raw: unknown = await invoke("take_pending_showcase");
  return z.string().min(1).nullable().parse(raw);
}

/** Fires when a capture is sent to Showcase while the dashboard is already open. */
export async function listenForShowcaseRequest(callback: () => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return listen("capkit://showcase-requested", callback);
}

export async function deleteSavedCapture(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("delete_saved_capture", { path });
}

const savedCapturePathSchema = z.string().min(1);

export async function copySavedCapture(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("copy_saved_capture", { path: savedCapturePathSchema.parse(path) });
}

/** Starts a native OS file drag; must be called synchronously from a pointer move. */
export async function startSavedCaptureDrag(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("start_saved_capture_drag", { path: savedCapturePathSchema.parse(path) });
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

async function invokeUpdate(command: string): Promise<UpdateStatus> {
  if (!isTauri()) return { state: "idle" };
  const raw: unknown = await invoke(command);
  return updateStatusSchema.parse(raw);
}

/** Runs the one launch check per process; later calls return the current status. */
export function autoCheckForUpdate(): Promise<UpdateStatus> {
  return invokeUpdate("auto_check_for_update");
}

export function checkForUpdate(): Promise<UpdateStatus> {
  return invokeUpdate("check_for_update");
}

export function installUpdate(): Promise<UpdateStatus> {
  return invokeUpdate("install_update");
}

export function getUpdateStatus(): Promise<UpdateStatus> {
  return invokeUpdate("update_status");
}

export async function listenForUpdateStatus(handler: (status: UpdateStatus) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return listen<unknown>("capkit://update-status", (event) => {
    const parsed = updateStatusSchema.safeParse(event.payload);
    if (parsed.success) handler(parsed.data);
  });
}

export function validateSelection(value: unknown): Rect {
  return rectSchema.parse(value);
}

// ---------------------------------------------------------------------------
// Browser link (CapKit Inspector extension)
// ---------------------------------------------------------------------------

const browserNameSchema = z.object({ name: z.string(), version: z.string() });

export const browserLinkStatusSchema = z.object({
  enabled: z.boolean(),
  state: z.enum(["off", "listening", "error"]),
  port: z.number().int().nullable(),
  error: z.string().nullable(),
  connected: z.array(browserNameSchema),
  paired: z.array(
    z.object({ origin: z.string(), browser: browserNameSchema, pairedAt: z.string() }),
  ),
});
export type BrowserLinkStatus = z.infer<typeof browserLinkStatusSchema>;

const pairingCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/), expiresAt: z.string() });
export type PairingCode = z.infer<typeof pairingCodeSchema>;

const webSensitiveMatchSchema = z.object({
  kind: z.enum(["token", "card", "email", "phone", "secret", "password"]),
  preview: z.string(),
  rects: z.array(rectSchema),
});

/** Sensitive text the extension found in the page, in display-local logical pixels. */
export type WebSensitiveMatch = z.infer<typeof webSensitiveMatchSchema>;

const offlineLinkStatus: BrowserLinkStatus = {
  enabled: false,
  state: "off",
  port: null,
  error: null,
  connected: [],
  paired: [],
};

export async function getBrowserLinkStatus(): Promise<BrowserLinkStatus> {
  if (!isTauri()) return offlineLinkStatus;
  return browserLinkStatusSchema.parse(await invoke("browser_link_status"));
}

export async function setBrowserLinkEnabled(enabled: boolean): Promise<BrowserLinkStatus> {
  if (!isTauri()) return { ...offlineLinkStatus, enabled };
  return browserLinkStatusSchema.parse(await invoke("browser_link_set_enabled", { enabled }));
}

export async function startBrowserPairing(): Promise<PairingCode> {
  const raw: unknown = await invoke("browser_link_start_pairing");
  return pairingCodeSchema.parse(raw);
}

export async function cancelBrowserPairing(): Promise<void> {
  if (!isTauri()) return;
  await invoke("browser_link_cancel_pairing");
}

export async function forgetBrowser(origin: string): Promise<BrowserLinkStatus> {
  if (!isTauri()) return offlineLinkStatus;
  return browserLinkStatusSchema.parse(await invoke("browser_link_forget", { origin }));
}

export async function listenForBrowserLinkStatus(
  callback: (status: BrowserLinkStatus) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return listen("browser-link://status", (event) => {
    const parsed = browserLinkStatusSchema.safeParse(event.payload);
    if (parsed.success) callback(parsed.data);
  });
}

/**
 * Sensitive text in the browser page behind `area` (display-local logical
 * pixels), or null when no connected extension can answer.
 */
export async function findSensitiveWeb(
  area: Rect,
  display: Display,
): Promise<readonly WebSensitiveMatch[] | null> {
  if (!isTauri()) return null;
  const scale = display.scaleFactor;
  const raw: unknown = await invoke("find_sensitive_web", {
    area: {
      x: (display.bounds.x + area.x) * scale,
      y: (display.bounds.y + area.y) * scale,
      width: area.width * scale,
      height: area.height * scale,
    },
  });
  if (raw === null) return null;
  return z
    .array(webSensitiveMatchSchema)
    .parse(raw)
    .map((match) => ({
      ...match,
      rects: match.rects.map((rect) => ({
        x: rect.x / scale - display.bounds.x,
        y: rect.y / scale - display.bounds.y,
        width: rect.width / scale,
        height: rect.height / scale,
      })),
    }));
}

const inspectResultSchema = z.object({
  tab: z.object({ url: z.string(), title: z.string() }).nullable(),
  cssViewport: cssViewportSchema.nullable(),
  elements: z.array(elementDetailsSchema),
});

/** Element details from the connected browser extension for a point or area. */
export type InspectResult = z.infer<typeof inspectResultSchema>;

/**
 * Asks the connected extension about the page behind a display-local point or
 * area (logical pixels). Null when no extension can answer.
 */
export async function inspectWebTarget(
  target: { point: Point } | { area: Rect },
  display: Display,
): Promise<InspectResult | null> {
  if (!isTauri()) return null;
  const scale = display.scaleFactor;
  const toPhysicalPoint = (point: Point): Point => ({
    x: (display.bounds.x + point.x) * scale,
    y: (display.bounds.y + point.y) * scale,
  });
  const raw: unknown = await invoke(
    "inspect_web_target",
    "point" in target
      ? { point: toPhysicalPoint(target.point), area: null }
      : {
          point: null,
          area: {
            ...toPhysicalPoint(target.area),
            width: target.area.width * scale,
            height: target.area.height * scale,
          },
        },
  );
  if (raw === null) return null;
  return inspectResultSchema.parse(raw);
}

const noteDetailSchema = z.enum(["extension", "accessibility", "none"]);

export const noteSummarySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  pageUrl: z.string().nullable(),
  pageTitle: z.string().nullable(),
  imagePath: z.string(),
  pinCount: z.number().int(),
  detail: noteDetailSchema,
  firstComment: z.string().nullable(),
});
export type NoteSummary = z.infer<typeof noteSummarySchema> & { imageUrl: string };

export type NoteDeliveryMode = "copy" | "save" | "copy-and-save";

export type NoteDeliveryRequest = {
  noteId: string;
  markdown: string;
  pageUrl: string | null;
  pageTitle: string | null;
  pinCount: number;
  detail: z.infer<typeof noteDetailSchema>;
  mode: NoteDeliveryMode;
};

const deliverySchema = z.object({
  copied: z.boolean(),
  saved: noteSummarySchema.nullable(),
  diagnostic: z.string().nullable(),
});
export type NoteDelivery = z.infer<typeof deliverySchema>;

const withImageUrl = (note: z.infer<typeof noteSummarySchema>): NoteSummary => ({
  ...note,
  imageUrl: convertFileSrc(note.imagePath),
});

export async function deliverNote(request: NoteDeliveryRequest): Promise<NoteDelivery> {
  if (!isTauri()) return { copied: true, saved: null, diagnostic: null };
  const raw: unknown = await invoke("deliver_note", { request });
  return deliverySchema.parse(raw);
}

export async function listNotes(
  query: string,
  limit: number,
  offset: number,
): Promise<readonly NoteSummary[]> {
  if (!isTauri()) return [];
  const raw: unknown = await invoke("notes_list", {
    query: query === "" ? null : query,
    limit,
    offset,
  });
  return z.array(noteSummarySchema).parse(raw).map(withImageUrl);
}

export async function copyNote(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("notes_copy", { id });
}

export async function deleteNote(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("notes_delete", { id });
}

export async function cleanupUnsavedNotes(): Promise<void> {
  if (!isTauri()) return;
  await invoke("notes_cleanup_unsaved");
}

export async function openNoteUrl(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("notes_open_url", { id });
}

/** Starts a native file drag of the note's Markdown; call synchronously from a pointer move. */
export async function startNoteDrag(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("notes_start_drag", { id });
}
