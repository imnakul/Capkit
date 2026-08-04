import { useRef } from "react";
import { formatDuration } from "../../../domain/recording";
import type { Trim } from "../../../domain/videoScene";
import type { ZoomKeyframe } from "../../../domain/zoomKeyframes";

type Handle = "start" | "end" | "playhead";

/**
 * Trim handles, the playhead, and the zoom track.
 *
 * Trimming is non-destructive: the bounds are stored on the scene and applied
 * at export, so the source recording is never rewritten.
 */
export function Timeline({
  duration,
  trim,
  time,
  keyframes,
  clickTimes,
  onTrimChange,
  onSeek,
}: {
  duration: number;
  trim: Trim;
  time: number;
  keyframes: readonly ZoomKeyframe[];
  clickTimes: readonly number[];
  onTrimChange: (trim: Trim) => void;
  onSeek: (time: number) => void;
}): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Handle | null>(null);

  const percent = (value: number): number => (duration <= 0 ? 0 : (value / duration) * 100);

  function timeAt(clientX: number): number {
    const element = trackRef.current;
    if (element === null) return 0;
    const rect = element.getBoundingClientRect();
    const ratio = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
    return Math.min(Math.max(ratio, 0), 1) * duration;
  }

  function apply(handle: Handle, clientX: number): void {
    const value = timeAt(clientX);
    if (handle === "playhead") {
      onSeek(Math.min(Math.max(value, trim.start), trim.end));
      return;
    }
    if (handle === "start") {
      onTrimChange({ start: Math.min(value, trim.end - 0.2), end: trim.end });
      return;
    }
    onTrimChange({ start: trim.start, end: Math.max(value, trim.start + 0.2) });
  }

  function begin(handle: Handle, event: React.PointerEvent<HTMLElement>): void {
    event.preventDefault();
    if ("setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    dragRef.current = handle;
    apply(handle, event.clientX);
  }

  function move(event: React.PointerEvent<HTMLElement>): void {
    const handle = dragRef.current;
    if (handle === null) return;
    apply(handle, event.clientX);
  }

  function end(): void {
    dragRef.current = null;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[12px] text-stone-500 dark:text-stone-400">
        <span className="font-mono">{formatDuration(time)}</span>
        <span>
          Trim {formatDuration(trim.start)} – {formatDuration(trim.end)}
        </span>
        <span className="font-mono">{formatDuration(duration)}</span>
      </div>

      <div
        aria-label="Timeline"
        className="relative h-14 cursor-pointer select-none rounded-md border border-stone-300 bg-stone-200/60 dark:border-white/10 dark:bg-black/25"
        ref={trackRef}
        role="group"
        onPointerCancel={end}
        onPointerDown={(event) => begin("playhead", event)}
        onPointerMove={move}
        onPointerUp={end}
      >
        <div className="absolute inset-y-0 left-0 rounded-l-md bg-black/25" style={{ width: `${String(percent(trim.start))}%` }} />
        <div className="absolute inset-y-0 right-0 rounded-r-md bg-black/25" style={{ left: `${String(percent(trim.end))}%` }} />

        {/* Clicks are what the automatic zoom keys off, so they are shown. */}
        {clickTimes.map((value, index) => (
          <span
            aria-hidden="true"
            className="absolute top-1 h-2 w-0.5 rounded-full bg-[var(--snaphub-accent)]"
            key={`${String(value)}-${String(index)}`}
            style={{ left: `${String(percent(value))}%` }}
          />
        ))}

        <svg aria-hidden="true" className="absolute inset-x-0 bottom-0 h-7 w-full" preserveAspectRatio="none" viewBox="0 0 100 10">
          <polyline
            fill="none"
            points={zoomPolyline(keyframes, duration)}
            stroke="var(--snaphub-accent)"
            strokeWidth="0.6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <button
          aria-label="Trim start"
          className="absolute inset-y-0 w-3 cursor-ew-resize rounded-l-md border-2 border-white bg-stone-900/80 outline-none focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)]"
          style={{ left: `calc(${String(percent(trim.start))}% - 6px)` }}
          type="button"
          onPointerCancel={end}
          onPointerDown={(event) => begin("start", event)}
          onPointerMove={move}
          onPointerUp={end}
        />
        <button
          aria-label="Trim end"
          className="absolute inset-y-0 w-3 cursor-ew-resize rounded-r-md border-2 border-white bg-stone-900/80 outline-none focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)]"
          style={{ left: `calc(${String(percent(trim.end))}% - 6px)` }}
          type="button"
          onPointerCancel={end}
          onPointerDown={(event) => begin("end", event)}
          onPointerMove={move}
          onPointerUp={end}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
          style={{ left: `${String(percent(time))}%` }}
        />
      </div>
    </div>
  );
}

/** Draws the zoom curve across the track, 1× at the bottom. */
function zoomPolyline(keyframes: readonly ZoomKeyframe[], duration: number): string {
  if (keyframes.length === 0 || duration <= 0) return "0,10 100,10";
  const maximum = Math.max(1.01, ...keyframes.map((frame) => frame.scale));
  const points = keyframes.map((frame) => {
    const x = Math.min(100, Math.max(0, (frame.time / duration) * 100));
    const y = 10 - ((frame.scale - 1) / (maximum - 1)) * 9;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return ["0,10", ...points, "100,10"].join(" ");
}
