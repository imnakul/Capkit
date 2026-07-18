import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AnnotationCanvas } from "./components/AnnotationCanvas";
import { AnnotationToolbar } from "./components/AnnotationToolbar";
import { CaptureBackdrop } from "./components/CaptureBackdrop";
import { CompletionToolbar } from "./components/CompletionToolbar";
import { SelectionFrame, type ResizeHandle } from "./components/SelectionFrame";
import {
  defaultAnnotationStyle,
  initialSceneHistory,
  sceneHistoryReducer,
  type Annotation,
  type AnnotationStyle,
  type ToolId,
} from "./domain/annotations";
import type {
  CaptureSession,
  CompletionAction,
  DetectedTarget,
  Point,
  Rect,
} from "./domain/capture";
import { type ShotHubSettings, useShotHubSettings } from "./domain/settings";
import { chooseToolbarPlacement, clampRect, isUsableSelection, normalizeRect } from "./lib/geometry";
import {
  cancelCapture,
  completeCapture,
  dismissCapture,
  listTargets,
  listenForCaptureRequest,
  requestCapture,
  showCaptureSurface,
} from "./lib/tauri";

type Interaction =
  | { kind: "select"; start: Point; candidate: Rect | null }
  | { kind: "move"; start: Point; initial: Rect }
  | { kind: "resize"; start: Point; initial: Rect; handle: ResizeHandle };

const viewportBounds = (): Rect => ({
  x: 0,
  y: 0,
  width: window.innerWidth,
  height: window.innerHeight,
});

export function App(): React.JSX.Element {
  const { settings } = useShotHubSettings();
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>("select");
  const [style, setStyle] = useState<AnnotationStyle>(defaultAnnotationStyle);
  const [history, dispatchScene] = useReducer(sceneHistoryReducer, initialSceneHistory);
  const [busy, setBusy] = useState(false);
  const [hoverTarget, setHoverTarget] = useState<DetectedTarget | null>(null);
  const [targets, setTargets] = useState<readonly DetectedTarget[]>([]);
  const [isDraftingSelection, setIsDraftingSelection] = useState(false);
  const [message, setMessage] = useState("Hover to preview targets / drag to draw a rectangle");
  const interaction = useRef<Interaction | null>(null);
  const pendingSelection = useRef<Rect | null>(null);
  const selectionFrameRequest = useRef<number | null>(null);
  const activationState = useRef<"idle" | "preparing" | "active">("idle");
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const startSession = useCallback(async (): Promise<void> => {
    if (activationState.current !== "idle") return;
    activationState.current = "preparing";
    let preparedSession: CaptureSession | null = null;
    try {
      const next = await requestCapture();
      preparedSession = next;
      flushSync(() => {
        setSession(next);
        setSelection(null);
        setHoverTarget(null);
        setTargets([]);
        setIsDraftingSelection(false);
        setActiveTool("select");
        setStyle({
          ...defaultAnnotationStyle,
          color: settingsRef.current.annotation.defaultColor,
          strokeWidth: settingsRef.current.annotation.defaultSize,
        });
        dispatchScene({ type: "reset" });
      });
      setMessage("Hover to preview targets / drag to draw a rectangle");
      await showCaptureSurface();
      activationState.current = "active";
      if (!settingsRef.current.detection.windows) return;
      void listTargets(next.display)
        .then((detectedTargets) => {
          if (activationState.current === "active") setTargets(detectedTargets);
        })
        .catch((error: unknown) => console.error("SH-TARGET-UI-001", error));
    } catch (error: unknown) {
      activationState.current = "idle";
      if (preparedSession !== null) {
        await cancelCapture(preparedSession.id).catch(async () => dismissCapture());
      } else {
        await dismissCapture().catch(() => undefined);
      }
      console.error("SH-CAPTURE-UI-001", error);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listenForCaptureRequest(() => {
      if (!disposed) void startSession();
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });

    if (!("__TAURI_INTERNALS__" in window)) void startSession();

    function cleanupCaptureListener(): void {
      disposed = true;
      unlisten?.();
    }
    return cleanupCaptureListener;
  }, [startSession]);

  const toolbarPlacement = useMemo(
    () => (selection === null ? null : chooseToolbarPlacement(selection, viewportBounds())),
    [selection],
  );

  function pointer(event: React.PointerEvent): Point {
    return { x: event.clientX, y: event.clientY };
  }

  function scheduleSelection(next: Rect): void {
    pendingSelection.current = next;
    if (selectionFrameRequest.current !== null) return;
    selectionFrameRequest.current = window.requestAnimationFrame((): void => {
      selectionFrameRequest.current = null;
      const pending = pendingSelection.current;
      pendingSelection.current = null;
      if (pending !== null) setSelection(pending);
    });
  }

  function clearScheduledSelection(): Rect | null {
    if (selectionFrameRequest.current !== null) {
      window.cancelAnimationFrame(selectionFrameRequest.current);
      selectionFrameRequest.current = null;
    }
    const pending = pendingSelection.current;
    pendingSelection.current = null;
    return pending;
  }

  function handleBackdropDown(event: React.PointerEvent<HTMLDivElement>): void {
    const target = event.target;
    if (
      busy ||
      event.button !== 0 ||
      (target instanceof Element && target.closest('[data-capture-interactive="true"]') !== null)
    ) {
      return;
    }
    interaction.current = { kind: "select", start: pointer(event), candidate: hoverTarget?.bounds ?? null };
    setIsDraftingSelection(true);
    setSelection({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
    setActiveTool("select");
    dispatchScene({ type: "reset" });
    if ("setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handleMoveStart(event: React.PointerEvent<HTMLDivElement>): void {
    if (activeTool !== "select" || selection === null || busy || event.button !== 0) return;
    event.stopPropagation();
    interaction.current = { kind: "move", start: pointer(event), initial: selection };
    if ("setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handleResizeStart(
    handle: ResizeHandle,
    event: React.PointerEvent<HTMLButtonElement>,
  ): void {
    if (selection === null || busy || event.button !== 0) return;
    event.stopPropagation();
    interaction.current = { kind: "resize", start: pointer(event), initial: selection, handle };
    if ("setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const current = interaction.current;
    if (current === null) {
      if (selection === null) {
        const nextTarget = targetAtPoint(targets, pointer(event));
        setHoverTarget((previous) =>
          previous?.id === nextTarget?.id ? previous : nextTarget,
        );
      }
      return;
    }
    if ((event.buttons & 1) === 0) {
      handlePointerUp();
      return;
    }
    const nextPoint = pointer(event);
    switch (current.kind) {
      case "select":
        scheduleSelection(normalizeRect(current.start, nextPoint));
        break;
      case "move":
        scheduleSelection(
          clampRect(
            {
              ...current.initial,
              x: current.initial.x + nextPoint.x - current.start.x,
              y: current.initial.y + nextPoint.y - current.start.y,
            },
            viewportBounds(),
          ),
        );
        break;
      case "resize":
        scheduleSelection(resizeRect(current.initial, current.start, nextPoint, current.handle));
        break;
    }
  }

  function handlePointerUp(): void {
    const completedInteraction = interaction.current;
    if (completedInteraction === null) return;
    interaction.current = null;
    setIsDraftingSelection(false);
    const pending = clearScheduledSelection();
    setSelection((current) => {
      const finalSelection = pending ?? current;
      if (finalSelection === null || !isUsableSelection(finalSelection)) {
        if (completedInteraction.kind === "select" && completedInteraction.candidate !== null) {
          setHoverTarget(null);
          setMessage("Window selected");
          return clampRect(completedInteraction.candidate, viewportBounds());
        }
        setMessage("Selection is too small · drag a larger area");
        return null;
      }
      setMessage("Selection ready");
      return clampRect(finalSelection, viewportBounds());
    });
  }

  function handleAnnotation(annotation: Annotation): void {
    dispatchScene({ type: "add", annotation });
  }

  const handleCancel = useCallback(async (): Promise<void> => {
    try {
      if (session !== null) {
        await cancelCapture(session.id).catch(async () => dismissCapture());
      } else {
        await dismissCapture();
      }
    } catch (error: unknown) {
      console.error("SH-CAPTURE-UI-002", error);
    } finally {
      clearScheduledSelection();
      activationState.current = "idle";
      setSession(null);
      setSelection(null);
      setTargets([]);
      setHoverTarget(null);
      setIsDraftingSelection(false);
      dispatchScene({ type: "reset" });
    }
  }, [session]);

  const handleComplete = useCallback(
    async (action: CompletionAction): Promise<void> => {
      if (session === null || selection === null || busy) return;
      setBusy(true);
      setMessage(`${action === "copy" ? "Copying" : action === "pin" ? "Pinning" : "Saving"}…`);
      try {
        const result = await completeCapture(action, session.id, selection, history.present);
        setMessage(
          result.outputPath === null ? "Capture complete" : `Saved to ${result.outputPath}`,
        );
        window.setTimeout(() => {
          activationState.current = "idle";
          setSession(null);
          setSelection(null);
          setTargets([]);
          setHoverTarget(null);
          setIsDraftingSelection(false);
          setBusy(false);
        }, 420);
      } catch (error: unknown) {
        setBusy(false);
        setMessage(error instanceof Error ? error.message : "Capture could not be completed");
      }
    },
    [busy, history.present, selection, session],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        void handleCancel();
      } else if (event.key === "Enter" && selection !== null) {
        event.preventDefault();
        void handleComplete("copy");
      } else if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatchScene({ type: event.shiftKey ? "redo" : "undo" });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    function cleanupKeyboardListener(): void {
      window.removeEventListener("keydown", handleKeyDown);
    }
    return cleanupKeyboardListener;
  }, [handleCancel, handleComplete, selection]);

  if (session === null) {
    return <div aria-hidden="true" className="h-screen w-screen bg-transparent" />;
  }

  const toolBarX = selection === null ? 16 : Math.max(16, Math.min(selection.x, window.innerWidth - 430));
  const toolBarY =
    selection === null || toolbarPlacement === null
      ? window.innerHeight - 68
        : toolbarPlacement.tools === "bottom"
          ? Math.min(window.innerHeight - 64, selection.y + selection.height + 10)
          : Math.max(10, selection.y - 62);
  const actionsOnLeft =
    selection !== null && selection.x + selection.width + 62 > window.innerWidth;
  const actionRailX =
    selection === null
      ? window.innerWidth - 58
      : actionsOnLeft
        ? Math.max(10, selection.x - 58)
        : Math.min(window.innerWidth - 54, selection.x + selection.width + 10);
  const actionRailY =
    selection === null
      ? 10
      : Math.max(10, Math.min(selection.y, window.innerHeight - 150));

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-[#111310] text-stone-100 select-none"
      style={{ cursor: captureCursor(settings.cursor, settings.accentColor) }}
      onPointerDown={handleBackdropDown}
      onPointerMove={handlePointerMove}
      onPointerCancel={handlePointerUp}
      onPointerUp={handlePointerUp}
    >
      <CaptureBackdrop snapshotUrl={session.snapshotUrl} />

      {selection === null && hoverTarget !== null ? (
        <div
          aria-label={`Detected ${hoverTarget.kind}: ${hoverTarget.title}`}
          className="pointer-events-none absolute z-10 border-2 border-lime-300/95 bg-lime-300/8 shadow-[0_0_0_1px_rgba(0,0,0,0.72),0_0_24px_rgba(217,255,67,0.12)]"
          style={{
            height: hoverTarget.bounds.height,
            left: hoverTarget.bounds.x,
            top: hoverTarget.bounds.y,
            width: hoverTarget.bounds.width,
          }}
        >
          <div className="absolute left-2 top-2 max-w-[min(22rem,calc(100%-1rem))] truncate rounded-md border border-lime-200/25 bg-[#11130f]/90 px-2 py-1 text-[10px] font-semibold tracking-wide text-lime-100 shadow-lg backdrop-blur-sm">
            {hoverTarget.title || "Selectable region"}
          </div>
        </div>
      ) : null}

      {selection === null ? <div className="pointer-events-none absolute inset-0 bg-[var(--capture-overlay)]" /> : null}

      {selection === null ? (
        <div className="pointer-events-none absolute left-1/2 top-7 -translate-x-1/2 rounded-full border border-white/10 bg-[#161815]/90 px-4 py-2 text-xs font-medium tracking-wide text-stone-200 shadow-xl backdrop-blur-xl">
          {message}
        </div>
      ) : isDraftingSelection ? (
        <div
          aria-label="Draft screenshot selection"
          className="capture-selection-mask pointer-events-none absolute z-10 border border-lime-300/95"
          style={{
            height: selection.height,
            left: selection.x,
            top: selection.y,
            width: selection.width,
          }}
        >
          <div className="absolute -top-7 left-0 rounded-md border border-white/10 bg-stone-950/90 px-2 py-1 font-mono text-[10px] font-semibold tracking-wide text-stone-200 shadow-lg">
            {Math.round(selection.width)} × {Math.round(selection.height)} px
          </div>
        </div>
      ) : (
        <SelectionFrame
          rect={selection}
          onMoveStart={handleMoveStart}
          onResizeStart={handleResizeStart}
        >
          <AnnotationCanvas
            activeTool={activeTool}
            bounds={selection}
            scene={history.present}
            style={style}
            onCommit={handleAnnotation}
          />
        </SelectionFrame>
      )}

      {selection === null || isDraftingSelection ? null : (
        <>
          <div
            className="absolute z-30"
            data-capture-interactive="true"
            style={{ left: toolBarX, top: toolBarY }}
          >
            <AnnotationToolbar
              activeTool={activeTool}
              style={style}
              canRedo={history.future.length > 0}
              canUndo={history.past.length > 0}
              palette={settings.palette}
              toolbar={settings.toolbar}
              onRedo={() => dispatchScene({ type: "redo" })}
              onStyleChange={setStyle}
              onToolChange={setActiveTool}
              onUndo={() => dispatchScene({ type: "undo" })}
            />
          </div>
          <div
            className="absolute z-30"
            data-capture-interactive="true"
            style={{ left: actionRailX, top: actionRailY }}
          >
            <CompletionToolbar
              busy={busy}
              onComplete={(action) => void handleComplete(action)}
            />
          </div>
        </>
      )}

      <div className="pointer-events-none absolute bottom-4 right-4 z-20 rounded-lg border border-white/8 bg-black/35 px-3 py-2 font-mono text-[10px] tracking-wide text-white/55 backdrop-blur-md">
        ShotHub / {message}
      </div>
    </main>
  );
}

function captureCursor(cursor: ShotHubSettings["cursor"], accentColor: string): string {
  if (!cursor.enabled) return "crosshair";
  const sizeByName: Record<ShotHubSettings["cursor"]["size"], number> = {
    small: 24,
    medium: 32,
    large: 40,
  };
  const size = sizeByName[cursor.size];
  const center = size / 2;
  const outerStroke = Math.max(4, Math.round(size / 7));
  const innerStroke = Math.max(2, Math.round(size / 16));
  const armStart = Math.round(size * 0.08);
  const armEnd = Math.round(size * 0.35);
  const farStart = size - armEnd;
  const farEnd = size - armStart;
  const cross = `<path d="M${String(center)} ${String(armStart)}v${String(armEnd - armStart)}M${String(center)} ${String(farStart)}v${String(farEnd - farStart)}M${String(armStart)} ${String(center)}h${String(armEnd - armStart)}M${String(farStart)} ${String(center)}h${String(farEnd - farStart)}"/>`;
  const shape =
    cursor.style === "target"
      ? `${cross}<circle cx="${String(center)}" cy="${String(center)}" r="${String(Math.round(size * 0.22))}"/>`
      : cursor.style === "precision"
        ? `<path d="M${String(center)} ${String(armStart)}L${String(farEnd)} ${String(center)} ${String(center)} ${String(farEnd)} ${String(armStart)} ${String(center)}Z"/><circle cx="${String(center)}" cy="${String(center)}" r="${String(Math.max(2, Math.round(size * 0.07)))}" fill="${accentColor}"/>`
        : cross;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(size)}" height="${String(size)}" viewBox="0 0 ${String(size)} ${String(size)}"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#090b09" stroke-width="${String(outerStroke)}">${shape}</g><g stroke="${accentColor}" stroke-width="${String(innerStroke)}">${shape}</g></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${String(center)} ${String(center)}, crosshair`;
}

function resizeRect(initial: Rect, start: Point, current: Point, handle: ResizeHandle): Rect {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  let left = initial.x;
  let top = initial.y;
  let right = initial.x + initial.width;
  let bottom = initial.y + initial.height;

  if (handle.includes("w")) left += dx;
  if (handle.includes("e")) right += dx;
  if (handle.includes("n")) top += dy;
  if (handle.includes("s")) bottom += dy;

  const normalized = normalizeRect({ x: left, y: top }, { x: right, y: bottom });
  return clampRect(
    {
      ...normalized,
      width: Math.max(8, normalized.width),
      height: Math.max(8, normalized.height),
    },
    viewportBounds(),
  );
}

function targetAtPoint(
  targets: readonly DetectedTarget[],
  point: Point,
): DetectedTarget | null {
  return (
    targets
      .filter(
        (target) =>
          point.x >= target.bounds.x &&
          point.x <= target.bounds.x + target.bounds.width &&
          point.y >= target.bounds.y &&
          point.y <= target.bounds.y + target.bounds.height,
      )
      .toSorted(
        (left, right) =>
          left.bounds.width * left.bounds.height - right.bounds.width * right.bounds.height,
      )[0] ?? null
  );
}
