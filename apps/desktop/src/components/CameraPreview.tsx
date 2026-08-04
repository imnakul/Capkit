import { useEffect, useRef, useState } from "react";
import { cameraShapes, type CameraShape } from "../domain/videoScene";
import { cameraReady, closeCamera } from "../lib/recordingTauri";

const shapeClass: Readonly<Record<CameraShape, string>> = {
  circle: "rounded-full",
  rounded: "rounded-[22%]",
  square: "rounded-none",
};

/**
 * The floating webcam window.
 *
 * It is excluded from screen capture like the recorder dock: the camera is
 * recorded as its own track, so letting the preview appear in the screen video
 * would put two copies of the presenter in the export.
 */
export function CameraPreview(): React.JSX.Element {
  const [shape, setShape] = useState<CameraShape>("circle");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    document.documentElement.classList.add("on-screen-surface");
    return (): void => document.documentElement.classList.remove("on-screen-surface");
  }, []);

  useEffect(() => {
    const lifetime = { active: true };
    void (async (): Promise<void> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!lifetime.active) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current !== null) videoRef.current.srcObject = stream;
      } catch {
        if (lifetime.active) setError("No camera is available, or access was declined.");
      }
    })();
    return (): void => {
      lifetime.active = false;
      const stream = streamRef.current;
      if (stream !== null) for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      void cameraReady().catch(() => setError("The camera window could not be shown."));
    });
    return (): void => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="group flex h-screen w-screen items-center justify-center bg-transparent p-1">
      {error === null ? (
        <div className={`relative size-full overflow-hidden border-2 border-white/70 bg-black shadow-[0_18px_48px_rgba(0,0,0,0.5)] ${shapeClass[shape]}`}>
          <video
            aria-label="Camera preview"
            autoPlay
            className="size-full -scale-x-100 object-cover"
            muted
            playsInline
            ref={videoRef}
          />
          {/* Controls stay hidden until hover so the preview reads as a camera,
              not a widget, while the presenter is on screen. */}
          <div
            aria-label="Camera shape"
            className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/55 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            role="group"
          >
            {cameraShapes.map((option) => (
              <button
                aria-label={`Use a ${option} camera`}
                aria-pressed={shape === option}
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-stone-300 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white aria-pressed:bg-white aria-pressed:text-stone-900"
                key={option}
                type="button"
                onClick={() => setShape(option)}
              >
                {option}
              </button>
            ))}
            <button
              aria-label="Close the camera"
              className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#ff8a80] outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white"
              type="button"
              onClick={() => void closeCamera()}
            >
              close
            </button>
          </div>
        </div>
      ) : (
        <div className="grid size-full place-items-center rounded-2xl border border-white/12 bg-[#171815]/95 p-3 text-center">
          <p className="text-[12px] leading-4 text-stone-300" role="status">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}
