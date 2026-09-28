import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cameraShapes, type CameraShape } from "../domain/videoScene";
import { Cancel, CircleShape, RoundedSquareShape, SquareShape } from "./icons";
import {
  cameraReady,
  closeCamera,
  openCameraPrivacySettings,
  prepareCameraPermission,
} from "../lib/recordingTauri";

const shapeClass: Readonly<Record<CameraShape, string>> = {
  circle: "rounded-full",
  rounded: "rounded-[22%]",
  square: "rounded-none",
};

/** Hard clip for the live image. A transformed video escapes `overflow:
 * hidden` + radius in Chromium, so the clip follows the border shape. */
const shapeClip: Readonly<Record<CameraShape, string>> = {
  circle: "[clip-path:circle(50%)]",
  rounded: "[clip-path:inset(0_round_22%)]",
  square: "",
};

const shapeIcon: Readonly<Record<CameraShape, typeof CircleShape>> = {
  circle: CircleShape,
  rounded: RoundedSquareShape,
  square: SquareShape,
};

const shapeLabel: Readonly<Record<CameraShape, string>> = {
  circle: "Circle camera",
  rounded: "Rounded camera",
  square: "Square camera",
};

type CameraFailure =
  | { kind: "blocked" }
  | { kind: "missing" }
  | { kind: "busy" }
  | { kind: "failed" };

const failureCopy: Record<CameraFailure["kind"], string> = {
  blocked: "Windows is blocking camera access for Capkit.",
  missing: "No camera was found. Connect one and try again.",
  busy: "The camera is being used by another app. Close it and try again.",
  failed: "The camera could not be started.",
};

function failureFor(error: unknown): CameraFailure {
  const name = error instanceof DOMException
    ? error.name
    : typeof error === "object" && error !== null && "name" in error
      ? String((error).name)
      : "";
  if (name === "NotAllowedError" || name === "SecurityError") return { kind: "blocked" };
  if (name === "NotFoundError" || name === "OverconstrainedError") return { kind: "missing" };
  if (name === "NotReadableError" || name === "AbortError") return { kind: "busy" };
  return { kind: "failed" };
}

/**
 * The floating webcam window.
 *
 * It is excluded from screen capture like the recorder dock: the camera is
 * recorded as its own track, so letting the preview appear in the screen video
 * would put two copies of the presenter in the export.
 *
 * The window stays hidden until the stream starts (or fails), then the
 * backend places it: a bottom-left bubble when live, a centred panel when
 * blocked. The dock's Camera button is the user's consent, so access is
 * granted for this webview before asking, and a decline can be retried.
 */
export function CameraPreview(): React.JSX.Element {
  const [shape, setShape] = useState<CameraShape>("circle");
  const [failure, setFailure] = useState<CameraFailure | null>(null);
  const [retrying, setRetrying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback((): void => {
    const stream = streamRef.current;
    if (stream !== null) for (const track of stream.getTracks()) track.stop();
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async (): Promise<boolean> => {
    try {
      await prepareCameraPermission();
    } catch {
      // Fall through to getUserMedia: the old behaviour stays the fallback.
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current !== null) videoRef.current.srcObject = stream;
      setFailure(null);
      await cameraReady("live");
      return true;
    } catch (error: unknown) {
      stopStream();
      setFailure(failureFor(error));
      await cameraReady("blocked").catch(() => undefined);
      return false;
    }
  }, [stopStream]);

  useEffect(() => {
    document.documentElement.classList.add("on-screen-surface");
    return (): void => document.documentElement.classList.remove("on-screen-surface");
  }, []);

  useEffect(() => {
    const lifetime: { active: boolean; frame?: number } = { active: true };
    const frame = window.requestAnimationFrame(() => {
      if (lifetime.active) void startStream();
    });
    lifetime.frame = frame;
    return (): void => {
      lifetime.active = false;
      if (lifetime.frame !== undefined) window.cancelAnimationFrame(lifetime.frame);
      const stream = streamRef.current;
      if (stream !== null) for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    };
  }, [startStream]);

  const retry = useCallback(async (): Promise<void> => {
    setRetrying(true);
    try {
      await startStream();
    } finally {
      setRetrying(false);
    }
  }, [startStream]);

  return (
    <div className="group flex h-screen w-screen items-center justify-center bg-transparent p-1">
      {failure === null ? (
        <div className={`relative size-full border-2 border-white/70 bg-black shadow-[0_18px_48px_rgba(0,0,0,0.5)] ${shapeClass[shape]}`}>
          <div
            className={`size-full ${shapeClip[shape]}`}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              if (event.target instanceof Element && event.target.closest("[data-camera-control]") !== null) return;
              event.preventDefault();
              void getCurrentWindow().startDragging().catch(() => undefined);
            }}
          >
            <video
              aria-label="Camera preview"
              autoPlay
              className="size-full -scale-x-100 object-cover"
              muted
              playsInline
              ref={videoRef}
            />
          </div>
          {/* Controls stay hidden until hover so the preview reads as a camera,
              not a widget, while the presenter is on screen. */}
          <div
            aria-label="Camera shape"
            className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/55 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            data-camera-control="true"
            role="group"
          >
            {cameraShapes.map((option) => {
              const Icon = shapeIcon[option];
              return (
                <button
                  aria-label={shapeLabel[option]}
                  aria-pressed={shape === option}
                  className="grid size-[22px] place-items-center rounded text-stone-300 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white aria-pressed:bg-white aria-pressed:text-stone-900"
                  key={option}
                  type="button"
                  onClick={() => setShape(option)}
                >
                  <Icon aria-hidden="true" size={12} />
                </button>
              );
            })}
            <button
              aria-label="Close the camera"
              className="grid size-[22px] place-items-center rounded text-[#ff8a80] outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white"
              type="button"
              onClick={() => void closeCamera()}
            >
              <Cancel aria-hidden="true" size={12} />
            </button>
          </div>
        </div>
      ) : (
        <div className="grid max-w-xs place-items-center gap-2.5 rounded-2xl border border-white/12 bg-[#171815]/95 p-4 text-center">
          <p className="text-[12px] leading-4 text-stone-300" role="status">
            {failureCopy[failure.kind]}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {failure.kind === "blocked" ? (
              <button
                className="rounded-md bg-[var(--snaphub-accent)] px-2.5 py-1 text-[11px] font-bold text-[#171815] outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white"
                type="button"
                onClick={() => void openCameraPrivacySettings().catch(() => undefined)}
              >
                Open camera settings
              </button>
            ) : null}
            <button
              className="rounded-md border border-white/20 px-2.5 py-1 text-[11px] font-semibold text-stone-200 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
              disabled={retrying}
              type="button"
              onClick={() => void retry()}
            >
              {retrying ? "Trying…" : "Try again"}
            </button>
            <button
              aria-label="Close the camera"
              className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-[#ff8a80] outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white"
              type="button"
              onClick={() => void closeCamera()}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
