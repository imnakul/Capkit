import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { Cancel, Copy, Grip, Lock, RotateClockwise, Save, Tick } from "./icons";
import { ToolButton } from "./ToolButton";

type PinnedViewProps = { path: string; windowLabel?: string };
type PinnedCaptureEntryProps = { windowLabel: string };

export function PinnedCaptureEntry({
  windowLabel,
}: PinnedCaptureEntryProps): React.JSX.Element {
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void invoke<string>("pinned_capture_path", { label: windowLabel })
      .then(setPath)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return undefined;
  }, [windowLabel]);

  if (path !== null) {
    return <PinnedView path={path} windowLabel={windowLabel} />;
  }
  return <PinnedLoading error={error} />;
}

function PinnedLoading({ error }: { error: string | null }): React.JSX.Element {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") void getCurrentWindow().close();
    }
    window.addEventListener("keydown", handleKeyDown);
    return (): void => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <main className="grid h-screen w-screen place-items-center rounded-xl bg-[#151713] text-stone-300">
      <div className="max-w-64 px-6 text-center text-xs">
        {error === null ? "Loading pinned capture…" : "Pinned capture could not be loaded."}
      </div>
    </main>
  );
}

export function PinnedView({ path, windowLabel }: PinnedViewProps): React.JSX.Element {
  const [rotation, setRotation] = useState(0);
  const [locked, setLocked] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const imageUrl = convertFileSrc(path);

  async function close(): Promise<void> {
    await getCurrentWindow().close();
  }

  async function toggleLocked(): Promise<void> {
    const next = !locked;
    await getCurrentWindow().setResizable(!next);
    setLocked(next);
  }

  async function copy(): Promise<void> {
    if (windowLabel === undefined) return;
    await invoke("copy_pinned_capture", { label: windowLabel });
    setMessage("Copied");
  }

  async function save(): Promise<void> {
    if (windowLabel === undefined) return;
    await invoke<string>("save_pinned_capture", { label: windowLabel });
    setMessage("Saved");
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        void close();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return (): void => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <main className="group relative grid h-screen w-screen place-items-center overflow-hidden rounded-xl bg-[#11130f]/90">
      <button
        aria-label="Move pinned image"
        className="absolute left-2 top-2 flex size-8 items-center justify-center rounded-lg border border-white/10 bg-[#161815]/95 text-stone-300 opacity-0 shadow-xl backdrop-blur-xl transition-opacity motion-reduce:transition-none group-hover:opacity-100 group-focus-within:opacity-100 cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-lime-300 hover:bg-white/10 hover:text-white"
        title="Drag to move"
        type="button"
        onKeyDown={(event) => {
          const step = event.shiftKey ? 50 : 10;
          let dx = 0;
          let dy = 0;
          if (event.key === "ArrowLeft") dx = -step;
          else if (event.key === "ArrowRight") dx = step;
          else if (event.key === "ArrowUp") dy = -step;
          else if (event.key === "ArrowDown") dy = step;
          else return;

          event.preventDefault();
          void (async (): Promise<void> => {
            try {
              const currentWindow = getCurrentWindow();
              const position = await currentWindow.outerPosition();
              await currentWindow.setPosition(
                new PhysicalPosition(position.x + dx, position.y + dy),
              );
            } catch {
              setMessage("Could not move the pin");
            }
          })();
        }}
        onPointerDown={(event) => {
          if (event.button === 0) {
            event.preventDefault();
            void getCurrentWindow()
              .startDragging()
              .catch(() => {
                setMessage("Could not move the pin");
              });
          }
        }}
      >
        <Grip aria-hidden="true" size={16} />
      </button>
      {!imageReady && !imageFailed ? (
        <span className="text-xs text-stone-400" role="status">Loading capture…</span>
      ) : null}
      {imageFailed ? <span className="text-xs text-red-300">Capture image is unavailable.</span> : null}
      <img
        alt="Pinned CapKit capture"
        className="absolute inset-0 max-h-full max-w-full place-self-center object-contain transition-transform duration-200 data-[ready=false]:opacity-0"
        data-ready={imageReady}
        draggable={false}
        src={imageUrl}
        style={{ opacity: imageReady ? opacity : 0, transform: `rotate(${String(rotation)}deg)` }}
        onError={() => setImageFailed(true)}
        onLoad={() => setImageReady(true)}
      />
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-[#161815]/95 p-1.5 opacity-0 shadow-2xl backdrop-blur-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <ToolButton icon={RotateClockwise} label="Rotate" onClick={() => setRotation((value) => value + 90)} />
        <ToolButton active={locked} icon={Lock} label="Lock size" onClick={() => void toggleLocked()} />
        <ToolButton disabled={windowLabel === undefined} icon={Copy} label="Copy image" onClick={() => void copy()} />
        <ToolButton disabled={windowLabel === undefined} icon={Save} label="Save image" onClick={() => void save()} />
        <label className="flex items-center px-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
          Opacity
          <input
            aria-label="Pinned image opacity"
            className="ml-2 w-16 accent-lime-300"
            max="1"
            min="0.2"
            step="0.05"
            type="range"
            value={opacity}
            onChange={(event) => setOpacity(Number(event.currentTarget.value))}
          />
        </label>
        <ToolButton icon={Cancel} label="Close" onClick={() => void close()} />
      </div>
      {message !== null ? (
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-md border border-white/10 bg-[#161815]/95 px-2.5 py-1.5 text-[10px] font-semibold text-stone-200 shadow-xl" role="status">
          <Tick aria-hidden="true" className="text-lime-300" size={12} />
          {message}
        </div>
      ) : null}
    </main>
  );
}
