import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AnnotationCanvas } from "./components/AnnotationCanvas";
import { AnnotationToolbar } from "./components/AnnotationToolbar";
import { CaptureBackdrop } from "./components/CaptureBackdrop";
import { CompletionToolbar } from "./components/CompletionToolbar";
import { SelectionFrame, type ResizeHandle } from "./components/SelectionFrame";
import {
  ScrollingCapturePanel,
  type ScrollingCaptureState,
} from "./components/ScrollingCapturePanel";
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
import { useSnaphubSettings } from "./domain/settings";
import { chooseToolbarPlacement, clampRect, isUsableSelection, normalizeRect } from "./lib/geometry";
import { captureCursor } from "./lib/cursor";
import { createVisualTargetDetector, type VisualTargetDetector } from "./lib/visualTargets";
import {
  cancelCapture,
  cancelManualScrolling,
  captureScrolling,
  completeCapture,
  completeScrollingCapture,
  detectTargets,
  dismissCapture,
  discardScrollingOutput,
  describeInvokeError,
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
  const { settings } = useSnaphubSettings();
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
  const [scrollingCapture, setScrollingCapture] = useState<ScrollingCaptureState | null>(null);
  const uiLookupSequence = useRef(0);
  const uiLookupInFlight = useRef(false);
  const pendingUiLookup = useRef<Point | null>(null);
  const visualTargetDetector = useRef<VisualTargetDetector | null>(null);
  const visualTargetSequence = useRef(0);
  const visualLookupFrame = useRef<number | null>(null);
  const pendingVisualPoint = useRef<Point | null>(null);
  const interaction = useRef<Interaction | null>(null);
  const pendingSelection = useRef<Rect | null>(null);
  const selectionFrameRequest = useRef<number | null>(null);
  const activationState = useRef<"idle" | "preparing" | "active">("idle");
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    visualTargetSequence.current += 1;
    const sequence = visualTargetSequence.current;
    visualTargetDetector.current = null;
    if (session === null || !settings.detection.uiRegions || session.snapshotUrl === "") return;
    void createVisualTargetDetector(session.snapshotUrl, session.display.bounds)
      .then((detector) => {
        if (sequence === visualTargetSequence.current) visualTargetDetector.current = detector;
      })
      .catch(() => {
        // Native UI Automation remains the fallback when the asset protocol is not canvas-readable.
      });
  }, [session, settings.detection.uiRegions]);

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
        setScrollingCapture(null);
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

  function scheduleUiTarget(point: Point): void {
    pendingVisualPoint.current = point;
    if (visualLookupFrame.current !== null) return;
    visualLookupFrame.current = window.requestAnimationFrame(() => {
      visualLookupFrame.current = null;
      const pending = pendingVisualPoint.current;
      pendingVisualPoint.current = null;
      if (pending !== null) resolveUiTarget(pending);
    });
  }

  function resolveUiTarget(point: Point): void {
    if (!settingsRef.current.detection.uiRegions || session === null) return;
    const visualTarget = visualTargetDetector.current?.targetAt(point) ?? null;
    if (visualTarget !== null) {
      setHoverTarget((previous) => previous?.id === visualTarget.id ? previous : visualTarget);
      setMessage("Visual target ready | click to select");
      return;
    }
    setHoverTarget((previous) => previous === null ? previous : null);
    pendingUiLookup.current = point;
    if (uiLookupInFlight.current) return;
    const lookupPoint = pendingUiLookup.current;
    pendingUiLookup.current = null;
    uiLookupInFlight.current = true;
    const sequence = uiLookupSequence.current + 1;
    uiLookupSequence.current = sequence;
    void detectTargets(lookupPoint, session.display, true)
      .then((detectedTargets) => {
        if (sequence !== uiLookupSequence.current || interaction.current !== null) return;
        const allowedTargets = settingsRef.current.detection.windows
          ? detectedTargets
          : detectedTargets.filter((target) => target.kind !== "window");
        const nextTarget = targetAtPoint(allowedTargets, lookupPoint);
        setHoverTarget((previous) => previous?.id === nextTarget?.id ? previous : nextTarget);
      })
      .catch((error: unknown) => {
        console.error("SH-TARGET-UIA-001", error);
        setMessage(`Control detection unavailable · ${describeInvokeError(error, "Windows UI Automation did not return a target")}`);
      })
      .finally(() => {
        uiLookupInFlight.current = false;
        const pending = pendingUiLookup.current;
        if (pending !== null) scheduleUiTarget(pending);
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
        const nextPoint = pointer(event);
        if (settingsRef.current.detection.uiRegions) {
          scheduleUiTarget(nextPoint);
        } else {
          const nextTarget = targetAtPoint(targets, nextPoint);
          setHoverTarget((previous) =>
            previous?.id === nextTarget?.id ? previous : nextTarget,
          );
        }
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

  async function runScrollingCapture(
    mode: "automatic" | "manual-start" | "manual-add",
  ): Promise<void> {
    if (session === null || selection === null) return;
    if (scrollingCapture?.phase === "preview") {
      await discardScrollingOutput(scrollingCapture.result.outputPath).catch(() => undefined);
    }
    setScrollingCapture({ phase: "running", mode });
    try {
      const result = await captureScrolling(mode, session.id, selection);
      setScrollingCapture({
        phase: "preview",
        mode: mode === "automatic" ? "automatic" : "manual",
        result,
      });
    } catch (error: unknown) {
      setScrollingCapture({
        phase: "error",
        message: describeInvokeError(error, "Scrolling capture could not continue"),
      });
    }
  }

  function startScrollingCapture(): void {
    setActiveTool("select");
    const mode = settingsRef.current.scrolling.defaultMode;
    if (mode === "choose") {
      setScrollingCapture({ phase: "setup" });
      return;
    }
    void runScrollingCapture(mode === "automatic" ? "automatic" : "manual-start");
  }

  async function closeScrollingCapture(): Promise<void> {
    if (scrollingCapture?.phase === "preview") {
      await discardScrollingOutput(scrollingCapture.result.outputPath).catch(() => undefined);
    }
    if (session !== null) {
      await cancelManualScrolling(session.id).catch(() => undefined);
    }
    setScrollingCapture(null);
  }

  async function finishScrollingCapture(action: CompletionAction): Promise<void> {
    if (
      session === null ||
      scrollingCapture?.phase !== "preview" ||
      busy
    ) return;
    setBusy(true);
    try {
      await completeScrollingCapture(
        action,
        session.id,
        scrollingCapture.result.outputPath,
      );
      activationState.current = "idle";
      setSession(null);
      setSelection(null);
      setScrollingCapture(null);
    } catch (error: unknown) {
      setScrollingCapture({
        phase: "preview",
        mode: scrollingCapture.mode,
        result: scrollingCapture.result,
        completionError: describeInvokeError(error, "Scrolling capture could not be completed"),
      });
    } finally {
      setBusy(false);
    }
  }

  const handleCancel = useCallback(async (): Promise<void> => {
    try {
      if (session !== null) {
        await cancelManualScrolling(session.id).catch(() => undefined);
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
      setScrollingCapture(null);
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
        // The native surface is already hidden when completion resolves. Tear
        // down the React capture state immediately so the next shortcut cannot
        // be swallowed by a completion animation.
        activationState.current = "idle";
        setSession(null);
        setSelection(null);
        setTargets([]);
        setHoverTarget(null);
        setIsDraftingSelection(false);
        setBusy(false);
      } catch (error: unknown) {
        setBusy(false);
        setMessage(error instanceof Error ? error.message : "Capture could not be completed");
      }
    },
    [busy, history.present, selection, session],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (scrollingCapture !== null) {
          void closeScrollingCapture();
          return;
        }
        void handleCancel();
      } else if (selection !== null && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && event.key.toUpperCase() === settingsRef.current.shortcuts.captureModeCopy.toUpperCase()) {
        event.preventDefault();
        void handleComplete("copy");
      } else if (selection !== null && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && event.key.toUpperCase() === settingsRef.current.shortcuts.captureModeSave.toUpperCase()) {
        event.preventDefault();
        void handleComplete("save");
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
  }, [handleCancel, handleComplete, scrollingCapture, selection]);

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
  const activeCaptureCursor = captureCursor(settings.cursor, settings.accentColor);

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-[#111310] text-stone-100 select-none"
      style={{ cursor: activeCaptureCursor }}
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
            cursor={activeCaptureCursor}
            scene={history.present}
            snapshotUrl={session.snapshotUrl}
            style={style}
            onCommit={handleAnnotation}
            onDelete={(annotationId) => dispatchScene({ type: "delete", annotationId })}
            onUpdate={(annotation) => dispatchScene({ type: "update", annotation })}
          />
        </SelectionFrame>
      )}

      {selection === null || isDraftingSelection ? null : (
        <>
          <div
            className="absolute z-30 [&_button]:!cursor-[inherit]"
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
              onScrollCapture={startScrollingCapture}
              onStyleChange={setStyle}
              onToolChange={setActiveTool}
              onUndo={() => dispatchScene({ type: "undo" })}
            />
          </div>
          <div
            className="absolute z-30 [&_button]:!cursor-[inherit]"
            data-capture-interactive="true"
            style={{ left: actionRailX, top: actionRailY }}
          >
            <CompletionToolbar
              busy={busy}
              copyShortcut={settings.shortcuts.captureModeCopy}
              saveShortcut={settings.shortcuts.captureModeSave}
              onComplete={(action) => void handleComplete(action)}
            />
          </div>
        </>
      )}

      {scrollingCapture === null || selection === null ? null : (
        <ScrollingCapturePanel
          anchor={selection}
          state={scrollingCapture}
          onAutomatic={() => void runScrollingCapture("automatic")}
          onClose={() => void closeScrollingCapture()}
          onComplete={(action) => void finishScrollingCapture(action)}
          onManualAdd={() => void runScrollingCapture("manual-add")}
          onManualStart={() => void runScrollingCapture("manual-start")}
        />
      )}

      <div className="pointer-events-none absolute bottom-4 right-4 z-20 rounded-lg border border-white/8 bg-black/35 px-3 py-2 font-mono text-[10px] tracking-wide text-white/55 backdrop-blur-md">
        Capkit / {message}
      </div>
    </main>
  );
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
