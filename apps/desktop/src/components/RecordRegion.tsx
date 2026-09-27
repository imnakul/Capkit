import { useCallback, useEffect, useRef, useState } from "react";
import { cancelRecordRegion, confirmRecordRegion, recordRegionReady } from "../lib/recordingTauri";

type Drag = { readonly startX: number; readonly startY: number; readonly x: number; readonly y: number };

const minimumSize = 32;

/**
 * Live region picker for recording.
 *
 * Deliberately not the capture overlay: that one shows a frozen snapshot, which
 * is wrong when the point is to frame moving content before recording it.
 */
export function RecordRegion(): React.JSX.Element {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [committed, setCommitted] = useState<Drag | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("on-screen-surface");
    return (): void => document.documentElement.classList.remove("on-screen-surface");
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void recordRegionReady().catch(() => undefined);
    });
    return (): void => window.cancelAnimationFrame(frame);
  }, []);

  const confirm = useCallback((box: { x: number; y: number; width: number; height: number }): void => {
    void confirmRecordRegion(box).catch(() => undefined);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Enter" && committed !== null) {
        const box = normalize(committed);
        if (box.width >= minimumSize && box.height >= minimumSize) {
          event.preventDefault();
          confirm(box);
        }
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      void cancelRecordRegion().catch(() => undefined);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return (): void => window.removeEventListener("keydown", onKeyDown, true);
  }, [committed, confirm]);

  function begin(event: React.PointerEvent<HTMLDivElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    setCommitted(null);
    setDrag({ startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY });
  }

  function move(event: React.PointerEvent<HTMLDivElement>): void {
    setDrag((current) =>
      current === null ? null : { ...current, x: event.clientX, y: event.clientY },
    );
  }

  function end(): void {
    setDrag((current) => {
      if (current === null) return null;
      const box = normalize(current);
      if (box.width >= minimumSize && box.height >= minimumSize) setCommitted(current);
      return null;
    });
  }

  const live = drag ?? committed;
  const box = live === null ? null : normalize(live);

  return (
    <div
      aria-label="Choose a region to record"
      className="fixed inset-0 cursor-crosshair select-none bg-black/35"
      ref={surfaceRef}
      role="application"
      onPointerCancel={end}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
    >
      {box === null ? (
        <p className="absolute left-1/2 top-8 -translate-x-1/2 rounded-md border border-white/12 bg-[#171815]/95 px-3 py-2 text-[13px] font-semibold text-stone-100 shadow-xl">
          Drag to choose what to record · Esc to cancel
        </p>
      ) : (
        <>
          <div
            className="absolute border-2 border-[var(--snaphub-accent)] bg-white/4"
            style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
          />
          <p
            className="absolute rounded border border-white/12 bg-[#171815]/95 px-2 py-1 font-mono text-[12px] text-stone-100"
            style={{ left: box.x, top: Math.max(0, box.y - 26) }}
          >
            {`${String(Math.round(box.width))} × ${String(Math.round(box.height))}`}
          </p>
          {committed === null ? null : (
            <div
              className="absolute flex gap-1.5"
              style={{
                left: box.x,
                top: box.y + box.height + 8 <= window.innerHeight - 44
                  ? box.y + box.height + 8
                  : Math.max(8, box.y - 44),
              }}
            >
              <button
                className="rounded-md bg-[var(--snaphub-accent)] px-3 py-1.5 text-[12px] font-bold text-[#171815] outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white"
                type="button"
                onClick={() => confirm(box)}
                onPointerDown={(event) => event.stopPropagation()}
              >
                Use this area
              </button>
              <button
                className="rounded-md border border-white/20 bg-[#171815]/95 px-3 py-1.5 text-[12px] font-semibold text-stone-200 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white"
                type="button"
                onClick={() => setCommitted(null)}
                onPointerDown={(event) => event.stopPropagation()}
              >
                Redraw
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function normalize(drag: Drag): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(drag.startX, drag.x),
    y: Math.min(drag.startY, drag.y),
    width: Math.abs(drag.x - drag.startX),
    height: Math.abs(drag.y - drag.startY),
  };
}
