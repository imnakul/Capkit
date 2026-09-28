import { useCallback, useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cameraShapes, type CameraShape } from "../domain/videoScene";
import { Cancel, CircleShape, RoundedSquareShape, SquareShape } from "./icons";
import {
  appendCameraChunk,
  beginCameraTrack,
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
type CameraMime = { type: string; extension: "mp4" | "webm" };

function pickCameraMime(): CameraMime | null {
  if (typeof MediaRecorder === "undefined") return null;
  if (MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")) {
    return { type: "video/mp4;codecs=avc1", extension: "mp4" };
  }
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
    return { type: "video/webm;codecs=vp9", extension: "webm" };
  }
  if (MediaRecorder.isTypeSupported("video/webm")) {
    return { type: "video/webm", extension: "webm" };
  }
  return null;
}

export function CameraPreview(): React.JSX.Element {
  const [shape, setShape] = useState<CameraShape>("circle");
  const [failure, setFailure] = useState<CameraFailure | null>(null);
  const [retrying, setRetrying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const appendFailedRef = useRef(false);

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
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder !== null && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Already stopping; the window is going away anyway.
        }
      }
      const stream = streamRef.current;
      if (stream !== null) for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    };
  }, [startStream]);

  // Camera track: records the preview's stream while a recording runs.
  useEffect(() => {
    let stops: (() => void)[] = [];
    void (async (): Promise<void> => {
      stops = [
        await listen("snaphub://recording-started", () => {
          const stream = streamRef.current;
          if (stream === null || recorderRef.current !== null) return;
          const mime = pickCameraMime();
          if (mime === null) return;
          void beginCameraTrack(mime.extension)
            .then(() => {
              if (streamRef.current !== stream) return;
              const recorder = new MediaRecorder(stream, {
                mimeType: mime.type,
                videoBitsPerSecond: 4_000_000,
              });
              recorderRef.current = recorder;
              appendFailedRef.current = false;
              recorder.ondataavailable = (event: BlobEvent): void => {
                if (event.data.size === 0) return;
                event.data.arrayBuffer().then((buffer) => {
                  chainRef.current = chainRef.current.then(() =>
                    appendCameraChunk(new Uint8Array(buffer)).catch(() => {
                      appendFailedRef.current = true;
                      const active = recorderRef.current;
                      recorderRef.current = null;
                      if (active !== null && active.state !== "inactive") {
                        try {
                          active.stop();
                        } catch {
                          // Already stopping.
                        }
                      }
                    }),
                  );
                }).catch(() => undefined);
              };
              recorder.start(1000);
            })
            .catch(() => undefined);
        }),
        await listen<{ paused: boolean }>("snaphub://recording-paused", (event) => {
          const recorder = recorderRef.current;
          if (recorder === null) return;
          try {
            if (event.payload.paused && recorder.state === "recording") recorder.pause();
            else if (!event.payload.paused && recorder.state === "paused") recorder.resume();
          } catch {
            // A recorder that cannot pause keeps recording; the track stays usable.
          }
        }),
        await listen("snaphub://camera-track-finish", () => {
          const recorder = recorderRef.current;
          if (recorder === null) {
            void emit("snaphub://camera-track-finished").catch(() => undefined);
            return;
          }
          recorderRef.current = null;
          const finished = new Promise<void>((resolve) => {
            const done = (): void => resolve();
            recorder.ondataavailable = (event: BlobEvent): void => {
              if (event.data.size === 0) return;
              event.data.arrayBuffer().then((buffer) => {
                chainRef.current = chainRef.current.then(() =>
                  appendCameraChunk(new Uint8Array(buffer)).catch(() => undefined),
                );
              }).catch(() => undefined);
            };
            recorder.onstop = (): void => done();
            try {
              recorder.stop();
            } catch {
              done();
            }
          });
          void finished.then(() => chainRef.current).then(() => {
            void emit("snaphub://camera-track-finished").catch(() => undefined);
          });
        }),
      ];
    })();
    return (): void => {
      for (const stop of stops) stop();
      stops = [];
    };
  }, []);

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
