import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Lock, RotateCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ToolButton } from "./ToolButton";

type PinnedViewProps = { path: string };
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
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") void getCurrentWindow().close();
    }
    window.addEventListener("keydown", handleKeyDown);
    return (): void => window.removeEventListener("keydown", handleKeyDown);
  }, [windowLabel]);

  if (path !== null) return <PinnedView path={path} />;
  return (
    <main className="grid h-screen w-screen place-items-center rounded-xl bg-[#151713] text-stone-300">
      <div className="max-w-64 px-6 text-center text-xs">
        {error === null ? "Loading pinned capture…" : "Pinned capture could not be loaded."}
      </div>
    </main>
  );
}

export function PinnedView({ path }: PinnedViewProps): React.JSX.Element {
  const [rotation, setRotation] = useState(0);
  const [locked, setLocked] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
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
    await navigator.clipboard.writeText(path);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") void close();
    }
    window.addEventListener("keydown", handleKeyDown);
    return (): void => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <main className="group relative grid h-screen w-screen place-items-center overflow-hidden rounded-xl bg-[#11130f]/90">
      {!imageReady && !imageFailed ? (
        <span className="text-xs text-stone-400" role="status">Loading capture…</span>
      ) : null}
      {imageFailed ? <span className="text-xs text-red-300">Capture image is unavailable.</span> : null}
      <img
        alt="Pinned ShotHub capture"
        className="absolute inset-0 max-h-full max-w-full place-self-center object-contain transition-transform duration-200 data-[ready=false]:opacity-0"
        data-ready={imageReady}
        draggable={false}
        src={imageUrl}
        style={{ opacity: imageReady ? opacity : 0, transform: `rotate(${String(rotation)}deg)` }}
        onError={() => setImageFailed(true)}
        onLoad={() => setImageReady(true)}
      />
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-[#161815]/95 p-1.5 opacity-0 shadow-2xl backdrop-blur-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <ToolButton icon={RotateCw} label="Rotate" onClick={() => setRotation((value) => value + 90)} />
        <ToolButton active={locked} icon={Lock} label="Lock size" onClick={() => void toggleLocked()} />
        <ToolButton icon={Copy} label="Copy path" onClick={() => void copy()} />
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
        <ToolButton icon={X} label="Close" onClick={() => void close()} />
      </div>
    </main>
  );
}
