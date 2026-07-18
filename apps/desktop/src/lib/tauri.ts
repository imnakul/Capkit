import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { z } from "zod";
import type { AnnotationScene } from "../domain/annotations";
import {
  captureSessionSchema,
  completionActionSchema,
  detectedTargetSchema,
  pointSchema,
  rectSchema,
  type CaptureSession,
  type CompletionAction,
  type DetectedTarget,
  type Display,
  type Point,
  type Rect,
} from "../domain/capture";

const backendSessionSchema = captureSessionSchema.omit({ snapshotUrl: true }).extend({
  snapshotPath: z.string(),
});

const completionResultSchema = z.object({
  action: completionActionSchema,
  outputPath: z.string().nullable(),
});

export type CompletionResult = z.infer<typeof completionResultSchema>;

export async function requestCapture(): Promise<CaptureSession> {
  if (!isTauri()) return createDemoSession();

  const raw: unknown = await invoke("begin_capture");
  const parsed = backendSessionSchema.parse(raw);
  const snapshotUrl = convertFileSrc(parsed.snapshotPath);
  await preloadImage(snapshotUrl);
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
  if (!isTauri()) return { action, outputPath: action === "save" ? "Demo/ShotHub.png" : null };

  const raw: unknown = await invoke("complete_capture", {
    request: { action, sessionId, selection, scene },
  });
  return completionResultSchema.parse(raw);
}

export async function cancelCapture(sessionId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("cancel_capture", { sessionId });
}

export async function detectTargets(point: Point): Promise<readonly DetectedTarget[]> {
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
  const raw: unknown = await invoke("detect_targets", { point: safePoint });
  return z.array(detectedTargetSchema).parse(raw);
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
  const scale = display.scaleFactor;
  return z.array(detectedTargetSchema).parse(raw).map((target) => ({
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
  return listen("shothub://capture-requested", callback);
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
