import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { Cancel, Copy, Lock, PointerOff, RotateClockwise, Save, Tick } from "./icons";
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
  const [clickThrough, setClickThrough] = useState(false);
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

  async function enableClickThrough(): Promise<void> {
    if (windowLabel === undefined) return;
    await invoke("set_pinned_click_through", { label: windowLabel, enabled: true });
    setClickThrough(true);
    setMessage("Click-through on · restore from the CapKit tray");
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      if (clickThrough && windowLabel !== undefined) {
        void invoke("set_pinned_click_through", { label: windowLabel, enabled: false }).then(() => {
          setClickThrough(false);
          setMessage("Click-through off");
        });
        return;
      }
      void close();
    }
    window.addEventListener("keydown", handleKeyDown);
    return (): void => window.removeEventListener("keydown", handleKeyDown);
  }, [clickThrough, windowLabel]);

  return (
    <main className="group relative grid h-screen w-screen place-items-center overflow-hidden rounded-xl bg-[#11130f]/90">
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
        <ToolButton disabled={windowLabel === undefined} icon={PointerOff} label="Click through" onClick={() => void enableClickThrough()} />
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
