import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AnnotationCanvas } from "./components/AnnotationCanvas";
import { AnnotationToolbar } from "./components/AnnotationToolbar";
import { CaptureBackdrop } from "./components/CaptureBackdrop";
import { CompletionToolbar } from "./components/CompletionToolbar";
import {
  RedactionPreview,
  RedactionReviewPanel,
  type RedactionReview,
} from "./components/RedactionReviewPanel";
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
  ColorFormat,
  CompletionAction,
  DetectedTarget,
  Point,
  Rect,
} from "./domain/capture";
import { useSnaphubSettings, type CaptureToolbarToolId } from "./domain/settings";
import {
  chooseToolbarPlacement,
  clampRect,
  isUsableSelection,
  normalizeRect,
  toolbarPosition,
  type ToolbarSize,
} from "./lib/geometry";
import { captureCursor } from "./lib/cursor";
import { prefersReducedMotion } from "./lib/motion";
import { eyedropperFormat } from "./lib/eyedropper";
import { suggestRedactions } from "./lib/redactionPatterns";
import { createVisualTargetDetector, type VisualTargetDetector } from "./lib/visualTargets";
import {
  cancelCapture,
  cancelManualScrolling,
  captureScrolling,
  completeCapture,
  openInShowcase,
  completeScrollingCapture,
  copyCaptureText,
  detectTargets,
  dismissCapture,
  discardScrollingOutput,
  describeInvokeError,
  isTextRecognitionSupported,
  listTargets,
  listenForCaptureRequest,
  pickCaptureColor,
  recognizeCaptureText,
  requestCapture,
  retryCaptureSave,
  showCaptureSurface,
} from "./lib/tauri";

type Interaction =
  | { kind: "select"; start: Point; candidate: Rect | null }
  | { kind: "move"; start: Point; initial: Rect }
  | { kind: "resize"; start: Point; initial: Rect; handle: ResizeHandle };

type SelectedCompletionState =
  | { phase: "idle"; message: string }
  | { phase: "working"; message: string }
  | { phase: "save-pending"; diagnostic: string };

function isPreparingCaptureSession(
  activationState: { current: "idle" | "preparing" | "active" },
  activeSessionId: { current: string | null },
  expectedSessionId: string,
): boolean {
  return (
    activationState.current === "preparing"
    && activeSessionId.current === expectedSessionId
  );
}

const viewportBounds = (display: CaptureSession["display"] | null): Rect => ({
  x: 0,
  y: 0,
  width: display?.bounds.width ?? window.innerWidth,
  height: display?.bounds.height ?? window.innerHeight,
});

export function App(): React.JSX.Element {
  const { settings } = useSnaphubSettings();
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>("select");
  const [style, setStyle] = useState<AnnotationStyle>(defaultAnnotationStyle);
  const [history, dispatchScene] = useReducer(sceneHistoryReducer, initialSceneHistory);
  const [busy, setBusy] = useState(false);
  const [lastToolByGroup, setLastToolByGroup] = useState<Partial<Record<number, CaptureToolbarToolId>>>({});
  const [openGroupIndex, setOpenGroupIndex] = useState<number | null>(null);
  const [toolbarSize, setToolbarSize] = useState<ToolbarSize>({ width: 430, height: 52 });
  const toolbarObserver = useRef<ResizeObserver | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitTimer = useRef<number | null>(null);
  const revealFrames = useRef<number[]>([]);
  const [completionState, setCompletionState] = useState<SelectedCompletionState>({
    phase: "idle",
    message: "",
  });
  const [hoverTarget, setHoverTarget] = useState<DetectedTarget | null>(null);
  const [targets, setTargets] = useState<readonly DetectedTarget[]>([]);
  const [isDraftingSelection, setIsDraftingSelection] = useState(false);
  const [message, setMessage] = useState("Hover to preview targets / drag to draw a rectangle / I copies a colour");
  const [scrollingCapture, setScrollingCapture] = useState<ScrollingCaptureState | null>(null);
  // The swatch shows only while its message is still the current one.
  const [pickedSwatch, setPickedSwatch] = useState<{ hex: string; message: string } | null>(null);
  const [canReadText, setCanReadText] = useState(false);
  const [redactionReview, setRedactionReview] = useState<RedactionReview | null>(null);
  const redactionSequence = useRef(0);
  const lastPointer = useRef<Point | null>(null);
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
  const completionInFlight = useRef(false);
  const sessionGeneration = useRef(0);
  const activeSessionId = useRef<string | null>(null);
  const backdropReadyResolver = useRef<{
    sessionId: string;
    resolve: () => void;
  } | null>(null);
  const settingsRef = useRef(settings);

  const handleBackdropReady = useCallback((): void => {
    const pending = backdropReadyResolver.current;
    const sessionId = session?.id;
    if (
      pending === null
      || sessionId === undefined
      || pending.sessionId !== sessionId
      || activeSessionId.current !== sessionId
    ) {
      return;
    }
    backdropReadyResolver.current = null;
    pending.resolve();
  }, [session]);

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

  const measureToolbar = useCallback((element: HTMLDivElement | null): void => {
    toolbarObserver.current?.disconnect();
    toolbarObserver.current = null;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const update = (): void => {
      const { offsetWidth: width, offsetHeight: height } = element;
      if (width === 0 || height === 0) return;
      setToolbarSize((current) => current.width === width && current.height === height ? current : { width, height });
    };
    update();
    toolbarObserver.current = new ResizeObserver(update);
    toolbarObserver.current.observe(element);
  }, []);

  const rememberGroupTool = useCallback((groupIndex: number, toolId: CaptureToolbarToolId): void => {
    setLastToolByGroup((current) => current[groupIndex] === toolId ? current : { ...current, [groupIndex]: toolId });
  }, []);

  function clearPendingMotion(): void {
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    exitTimer.current = null;
    for (const frame of revealFrames.current) window.cancelAnimationFrame(frame);
    revealFrames.current = [];
  }

  useEffect(() => clearPendingMotion, []);

  function clearCaptureUi(): void {
    clearPendingMotion();
    setOpenGroupIndex(null);
    setExiting(false);
    setRevealed(false);
    activationState.current = "idle";
    activeSessionId.current = null;
    const pendingBackdrop = backdropReadyResolver.current;
    backdropReadyResolver.current = null;
    pendingBackdrop?.resolve();
    completionInFlight.current = false;
    setSession(null);
    setSelection(null);
    setTargets([]);
    setHoverTarget(null);
    setIsDraftingSelection(false);
    setScrollingCapture(null);
    setBusy(false);
    setCompletionState({ phase: "idle", message: "" });
    dispatchScene({ type: "reset" });
  }

  const startSession = useCallback(async (): Promise<void> => {
    if (exitTimer.current !== null) {
      // A new request during the exit fade: finish the old session once, then start fresh.
      const oldSessionId = activeSessionId.current;
      clearPendingMotion();
      setExiting(false);
      activationState.current = "idle";
      sessionGeneration.current += 1;
      if (oldSessionId !== null) await cancelCapture(oldSessionId, "fade-in", true).catch(() => undefined);
    }
    if (activationState.current !== "idle") return;
    const timingStartedAt = import.meta.env.DEV ? performance.now() : null;
    let timingAfterRequest: number | null = null;
    let timingAfterReady: number | null = null;
    activationState.current = "preparing";
    sessionGeneration.current += 1;
    clearPendingMotion();
    setExiting(false);
    setRevealed(false);
    completionInFlight.current = false;
    activeSessionId.current = null;
    let preparedSession: CaptureSession | null = null;
    try {
      const next = await requestCapture();
      if (timingStartedAt !== null) timingAfterRequest = performance.now();
      preparedSession = next;
      const backdropReady = new Promise<void>((resolve) => {
        backdropReadyResolver.current = { sessionId: next.id, resolve };
      });
      flushSync(() => {
        setSession(next);
        activeSessionId.current = next.id;
        setSelection(null);
        setHoverTarget(null);
        setTargets([]);
        setIsDraftingSelection(false);
        setBusy(false);
        setCompletionState({ phase: "idle", message: "" });
        setActiveTool("select");
        setScrollingCapture(null);
        setStyle({
          ...defaultAnnotationStyle,
          color: settingsRef.current.annotation.defaultColor,
          strokeWidth: settingsRef.current.annotation.defaultSize,
        });
        dispatchScene({ type: "reset" });
      });
      setMessage("Hover to preview targets / drag to draw a rectangle / I copies a colour");
      let readyTimeout: number | undefined;
      await Promise.race([
        backdropReady,
        new Promise<void>((resolve) => {
          readyTimeout = window.setTimeout(resolve, 1500);
        }),
      ]);
      if (readyTimeout !== undefined) window.clearTimeout(readyTimeout);
      if (backdropReadyResolver.current?.sessionId === next.id) {
        backdropReadyResolver.current = null;
      }
      if (timingStartedAt !== null) timingAfterReady = performance.now();
      if (!isPreparingCaptureSession(activationState, activeSessionId, next.id)) {
        return;
      }
      const motion = settingsRef.current.overlay.motion;
      const reduced = prefersReducedMotion();
      await showCaptureSurface(motion, reduced);
      if (motion === "dim-rise" && !reduced) {
        // Two frames so the hidden styles paint before the transition target applies.
        const first = window.requestAnimationFrame(() => {
          const second = window.requestAnimationFrame(() => setRevealed(true));
          revealFrames.current.push(second);
        });
        revealFrames.current.push(first);
      } else {
        setRevealed(true);
      }
      if (
        timingStartedAt !== null &&
        timingAfterRequest !== null &&
        timingAfterReady !== null
      ) {
        const timingAfterReveal = performance.now();
        console.debug("[capture-timing]", {
          request: timingAfterRequest - timingStartedAt,
          ready: timingAfterReady - timingAfterRequest,
          reveal: timingAfterReveal - timingAfterReady,
          total: timingAfterReveal - timingStartedAt,
        });
      }
      if (!isPreparingCaptureSession(activationState, activeSessionId, next.id)) {
        return;
      }
      activationState.current = "active";
      if (!settingsRef.current.detection.windows) return;
      void listTargets(next.display)
        .then((detectedTargets) => {
          if (activationState.current === "active") setTargets(detectedTargets);
        })
        .catch((error: unknown) => console.error("SH-TARGET-UI-001", error));
    } catch (error: unknown) {
      activationState.current = "idle";
      const pendingBackdrop = backdropReadyResolver.current;
      if (pendingBackdrop !== null && pendingBackdrop.sessionId === preparedSession?.id) {
        pendingBackdrop.resolve();
        backdropReadyResolver.current = null;
      }
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
    () =>
      selection === null
        ? null
        : chooseToolbarPlacement(selection, viewportBounds(session?.display ?? null), toolbarSize.height),
    [selection, session?.display, toolbarSize.height],
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
      completionInFlight.current ||
      completionState.phase !== "idle" ||
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
    if (
      activeTool !== "select"
      || selection === null
      || busy
      || completionInFlight.current
      || completionState.phase !== "idle"
      || event.button !== 0
    ) return;
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
    if (
      selection === null
      || busy
      || completionInFlight.current
      || completionState.phase !== "idle"
      || event.button !== 0
    ) return;
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
            viewportBounds(session?.display ?? null),
          ),
        );
        break;
      case "resize":
        scheduleSelection(
          resizeRect(
            current.initial,
            current.start,
            nextPoint,
            current.handle,
            viewportBounds(session?.display ?? null),
          ),
        );
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
          return clampRect(
            completedInteraction.candidate,
            viewportBounds(session?.display ?? null),
          );
        }
        setMessage("Selection is too small · drag a larger area");
        return null;
      }
      setMessage("Selection ready");
      return clampRect(finalSelection, viewportBounds(session?.display ?? null));
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
    if (completionState.phase !== "idle" || completionInFlight.current) return;
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
    sessionGeneration.current += 1;
    const exitMotion = settingsRef.current.overlay.motion;
    try {
      if (session !== null) {
        await cancelCapture(session.id, exitMotion, prefersReducedMotion()).catch(async () => dismissCapture());
        await cancelManualScrolling(session.id).catch(() => undefined);
      } else {
        await dismissCapture();
      }
    } catch (error: unknown) {
      console.error("SH-CAPTURE-UI-002", error);
    } finally {
      clearScheduledSelection();
      clearCaptureUi();
    }
  }, [session]);

  const requestExit = useCallback((): void => {
    if (exitTimer.current !== null) return;
    if (settingsRef.current.overlay.motion !== "dim-rise" || prefersReducedMotion() || session === null) {
      void handleCancel();
      return;
    }
    setExiting(true);
    exitTimer.current = window.setTimeout(() => {
      exitTimer.current = null;
      void handleCancel();
    }, 120);
  }, [handleCancel, session]);

  const handleComplete = useCallback(
    async (action: CompletionAction, followUp: "none" | "showcase" = "none"): Promise<void> => {
      if (
        session === null
        || selection === null
        || busy
        || scrollingCapture !== null
        || completionState.phase !== "idle"
        || completionInFlight.current
      ) return;
      const sessionId = session.id;
      const generation = sessionGeneration.current;
      const pendingMessage = action === "copy-and-save"
        ? "Copying & saving…"
        : action === "copy"
          ? "Copying…"
          : action === "pin"
            ? "Pinning…"
            : "Saving…";
      completionInFlight.current = true;
      setCompletionState({ phase: "working", message: pendingMessage });
      setMessage(pendingMessage);
      try {
        const result = await completeCapture(
          action,
          sessionId,
          selection,
          history.present,
        );
        if (
          activeSessionId.current !== sessionId
          || sessionGeneration.current !== generation
        ) return;
        if (result.status === "save-pending") {
          setCompletionState({
            phase: "save-pending",
            diagnostic: result.diagnostic,
          });
          setMessage("Copied, but could not save. Retry save or press Esc to cancel.");
          return;
        }
        const successMessage = result.outputPath === null
          ? "Capture complete"
          : `Saved to ${result.outputPath}`;
        setMessage(
          result.cleanupWarning === null
            ? successMessage
            : `${successMessage} · ${result.cleanupWarning}`,
        );
        clearCaptureUi();
        // The capture window is already hidden, so a failure here has no UI to
        // land in; the image itself is saved either way.
        if (followUp === "showcase" && result.outputPath !== null) {
          void openInShowcase(result.outputPath).catch((error: unknown) => {
            console.error("SH-SHOWCASE-OPEN-001", error);
          });
        }
      } catch (error: unknown) {
        if (
          activeSessionId.current === sessionId
          && sessionGeneration.current === generation
        ) {
          const errorMessagePrefix = action === "save" || action === "save-as"
            ? "Could not save this capture. Try again."
            : action === "pin"
              ? "Could not pin this capture. Try again."
              : "Could not copy this capture. Try again.";
          const errorMessage = `${errorMessagePrefix} ${describeInvokeError(error, "The native capture service did not return a diagnostic")}`;
          setCompletionState({ phase: "idle", message: errorMessage });
          setMessage(errorMessage);
        }
      } finally {
        if (sessionGeneration.current === generation) {
          completionInFlight.current = false;
        }
      }
    },
    [busy, completionState.phase, history.present, scrollingCapture, selection, session],
  );

  const handleCopyText = useCallback(async (): Promise<void> => {
    if (
      session === null
      || selection === null
      || busy
      || scrollingCapture !== null
      || completionState.phase !== "idle"
      || completionInFlight.current
    ) return;
    const sessionId = session.id;
    const generation = sessionGeneration.current;
    completionInFlight.current = true;
    setCompletionState({ phase: "working", message: "Reading text…" });
    setMessage("Reading text…");
    try {
      const result = await copyCaptureText(sessionId, selection);
      if (
        activeSessionId.current !== sessionId
        || sessionGeneration.current !== generation
      ) return;
      if (result.status === "empty") {
        const emptyMessage = "No text found in this selection. Adjust it and try again.";
        setCompletionState({ phase: "idle", message: emptyMessage });
        setMessage(emptyMessage);
        return;
      }
      const lineCount = result.text.split("\n").length;
      const copiedMessage = `Copied ${lineCount === 1 ? "1 line" : `${String(lineCount)} lines`} of text`;
      setMessage(
        result.cleanupWarning === null || result.cleanupWarning === undefined
          ? copiedMessage
          : `${copiedMessage} · ${result.cleanupWarning}`,
      );
      clearCaptureUi();
    } catch (error: unknown) {
      if (
        activeSessionId.current === sessionId
        && sessionGeneration.current === generation
      ) {
        const errorMessage = `Could not read text. ${describeInvokeError(error, "The text recognition service did not return a diagnostic")}`;
        setCompletionState({ phase: "idle", message: errorMessage });
        setMessage(errorMessage);
      }
    } finally {
      if (sessionGeneration.current === generation) {
        completionInFlight.current = false;
      }
    }
  }, [busy, completionState.phase, scrollingCapture, selection, session]);

  const findSensitiveText = useCallback(async (): Promise<void> => {
    if (
      session === null
      || selection === null
      || busy
      || scrollingCapture !== null
      || completionState.phase !== "idle"
      || completionInFlight.current
    ) return;
    const sequence = redactionSequence.current + 1;
    redactionSequence.current = sequence;
    const reviewedSelection = selection;
    setCompletionState({ phase: "idle", message: "" });
    setRedactionReview({ phase: "reading" });
    try {
      const recognized = await recognizeCaptureText(session.id, reviewedSelection);
      if (redactionSequence.current !== sequence) return;
      const suggestions = suggestRedactions(recognized, reviewedSelection);
      setRedactionReview({
        phase: "ready",
        suggestions,
        selectedIds: new Set(suggestions.map((suggestion) => suggestion.id)),
      });
    } catch (error: unknown) {
      if (redactionSequence.current !== sequence) return;
      setRedactionReview({
        phase: "error",
        message: `Could not read text. ${describeInvokeError(error, "The text recognition service did not return a diagnostic")}`,
      });
    }
  }, [busy, completionState.phase, scrollingCapture, selection, session]);

  const closeRedactionReview = useCallback((): void => {
    redactionSequence.current += 1;
    setRedactionReview(null);
  }, []);

  const toggleRedactionSuggestion = useCallback((suggestionId: string): void => {
    setRedactionReview((current) => {
      if (current?.phase !== "ready") return current;
      const selectedIds = new Set(current.selectedIds);
      if (selectedIds.has(suggestionId)) selectedIds.delete(suggestionId);
      else selectedIds.add(suggestionId);
      return { ...current, selectedIds };
    });
  }, []);

  const applyRedactions = useCallback((): void => {
    if (redactionReview?.phase !== "ready") return;
    // Blackout, not pixelate: large-block pixelation of text can be partly reversed.
    const blackouts: Annotation[] = redactionReview.suggestions
      .filter((suggestion) => redactionReview.selectedIds.has(suggestion.id))
      .map((suggestion) => ({
        id: crypto.randomUUID(),
        kind: "blackout",
        bounds: suggestion.bounds,
        color: "#090a08",
        intensity: 1,
        opacity: 1,
      }));
    if (blackouts.length === 0) return;
    // One replace, so a single undo removes the whole batch.
    dispatchScene({
      type: "replace",
      scene: { version: 1, elements: [...history.present.elements, ...blackouts] },
    });
    closeRedactionReview();
    setMessage(`Blacked out ${blackouts.length === 1 ? "1 item" : `${String(blackouts.length)} items`} · Ctrl+Z to undo`);
  }, [closeRedactionReview, history.present.elements, redactionReview]);

  useEffect(() => {
    // Suggestions are positioned for one selection; any change makes them stale.
    closeRedactionReview();
  }, [closeRedactionReview, selection, session?.id]);

  const handleRetrySave = useCallback(async (): Promise<void> => {
    if (
      session === null
      || completionState.phase !== "save-pending"
      || completionInFlight.current
    ) return;
    const sessionId = session.id;
    const generation = sessionGeneration.current;
    completionInFlight.current = true;
    setCompletionState({ phase: "working", message: "Saving…" });
    setMessage("Saving…");
    try {
      const result = await retryCaptureSave(sessionId);
      if (
        activeSessionId.current !== sessionId
        || sessionGeneration.current !== generation
      ) return;
      if (result.status === "save-pending") {
        setCompletionState({
          phase: "save-pending",
          diagnostic: result.diagnostic,
        });
        setMessage("Copied, but could not save. Retry save or press Esc to cancel.");
        return;
      }
      setMessage(
        result.cleanupWarning === null
          ? "Capture copied and saved"
          : `Capture copied and saved · ${result.cleanupWarning}`,
      );
      clearCaptureUi();
    } catch (error: unknown) {
      if (
        activeSessionId.current === sessionId
        && sessionGeneration.current === generation
      ) {
        const diagnostic = describeInvokeError(
          error,
          "The native capture service did not return a diagnostic",
        );
        setCompletionState({ phase: "save-pending", diagnostic });
        setMessage("Copied, but could not save. Retry save or press Esc to cancel.");
      }
    } finally {
      if (sessionGeneration.current === generation) {
        completionInFlight.current = false;
      }
    }
  }, [completionState.phase, session]);

  useEffect(() => {
    let isCurrent = true;
    isTextRecognitionSupported()
      .then((supported) => {
        if (isCurrent) setCanReadText(supported);
      })
      .catch(() => {
        // An unsupported or unreachable engine just hides Copy text.
        if (isCurrent) setCanReadText(false);
      });
    return (): void => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    // Window-level so the eyedropper knows the pointer even over the annotation canvas or toolbars.
    function trackPointer(event: PointerEvent): void {
      lastPointer.current = { x: event.clientX, y: event.clientY };
    }
    window.addEventListener("pointermove", trackPointer, { capture: true, passive: true });
    return (): void => {
      window.removeEventListener("pointermove", trackPointer, { capture: true });
    };
  }, []);

  const pickColor = useCallback(async (format: ColorFormat): Promise<void> => {
    const point = lastPointer.current;
    if (session === null || point === null) return;
    try {
      const picked = await pickCaptureColor(session.id, point, format);
      const pickedMessage = `Copied ${picked.copied}`;
      setPickedSwatch({ hex: picked.hex, message: pickedMessage });
      setMessage(pickedMessage);
    } catch (error) {
      setMessage(`Could not copy colour · ${describeInvokeError(error, "The colour could not be read")}`);
    }
  }, [session]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Escape is the capture surface's unconditional exit hatch. Handle it in
      // the capture phase before a focused control or WebView handler can consume
      // it, including while the user is still hovering before making a selection.
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (scrollingCapture !== null) {
          void closeScrollingCapture();
          return;
        }
        if (openGroupIndex !== null) {
          setOpenGroupIndex(null);
          return;
        }
        requestExit();
        return;
      }

      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      const hasNoModifiers = !event.ctrlKey
        && !event.altKey
        && !event.shiftKey
        && !event.metaKey;
      const selectedCompletionReady = selection !== null
        && isUsableSelection(selection)
        && !isDraftingSelection
        && scrollingCapture === null
        && !busy
        && completionState.phase === "idle";
      const key = event.key.toUpperCase();
      const { captureModeCopy, captureModeSave, captureModeCopyAndSave } = settingsRef.current.shortcuts;
      const colorFormat = busy || scrollingCapture !== null || event.repeat
        ? null
        : eyedropperFormat(
          event,
          [captureModeCopy, captureModeSave, captureModeCopyAndSave],
          selectedCompletionReady,
        );
      if (colorFormat !== null) {
        event.preventDefault();
        void pickColor(colorFormat);
      } else if (
        selectedCompletionReady
        && hasNoModifiers
        && key === settingsRef.current.shortcuts.captureModeCopy
      ) {
        event.preventDefault();
        void handleComplete("copy");
      } else if (
        selectedCompletionReady
        && hasNoModifiers
        && key === settingsRef.current.shortcuts.captureModeCopyAndSave
      ) {
        event.preventDefault();
        void handleComplete("copy-and-save");
      } else if (
        selectedCompletionReady
        && hasNoModifiers
        && key === settingsRef.current.shortcuts.captureModeSave
      ) {
        event.preventDefault();
        void handleComplete("save");
      } else if (selectedCompletionReady && event.key === "Enter") {
        event.preventDefault();
        void handleComplete("copy");
      } else if (
        event.ctrlKey
        && !busy
        && completionState.phase === "idle"
        && scrollingCapture === null
        && event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        dispatchScene({ type: event.shiftKey ? "redo" : "undo" });
      }
    }
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    function cleanupKeyboardListener(): void {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    }
    return cleanupKeyboardListener;
  }, [
    busy,
    completionState.phase,
    requestExit,
    openGroupIndex,
    handleComplete,
    isDraftingSelection,
    pickColor,
    scrollingCapture,
    selection,
  ]);

  if (session === null) {
    return <div aria-hidden="true" className="h-screen w-screen bg-transparent" />;
  }

  const viewport = viewportBounds(session.display);
  const swatchHex = pickedSwatch !== null && pickedSwatch.message === message ? pickedSwatch.hex : null;
  const toolbarSide = toolbarPlacement?.tools ?? "bottom";
  const toolbarSpot = selection === null
    ? { x: 16, y: viewport.height - toolbarSize.height - 16 }
    : toolbarPosition(selection, viewport, toolbarSide, toolbarSize);
  const toolBarX = toolbarSpot.x;
  const toolBarY = toolbarSpot.y;
  const actionsOnLeft =
    selection !== null && selection.x + selection.width + 62 > viewport.width;
  const actionRailX =
    selection === null
      ? viewport.width - 58
      : actionsOnLeft
        ? Math.max(10, selection.x - 58)
        : Math.min(viewport.width - 54, selection.x + selection.width + 10);
  const actionRailY =
    selection === null
      ? 10
      : Math.max(10, Math.min(selection.y, viewport.height - 190));
  const activeCaptureCursor = captureCursor(settings.cursor, settings.accentColor);
  const dimRise = settings.overlay.motion === "dim-rise" && !prefersReducedMotion();
  const shown = revealed && !exiting;
  const fadeStyle: React.CSSProperties = dimRise
    ? {
      opacity: shown ? 1 : 0,
      transition: exiting
        ? "opacity 120ms cubic-bezier(0.4, 0, 1, 1)"
        : "opacity 160ms cubic-bezier(0.22, 1, 0.36, 1)",
    }
    : {};
  const exitOnlyStyle: React.CSSProperties = dimRise
    ? { opacity: exiting ? 0 : 1, transition: "opacity 120ms cubic-bezier(0.4, 0, 1, 1)" }
    : {};

  return (
    <main
      aria-busy={busy || completionState.phase === "working"}
      className="relative h-screen w-screen overflow-hidden bg-[#111310] text-stone-100 select-none"
      style={{ cursor: activeCaptureCursor }}
      onPointerDown={handleBackdropDown}
      onPointerMove={handlePointerMove}
      onPointerCancel={handlePointerUp}
      onPointerUp={handlePointerUp}
    >
      <CaptureBackdrop
        height={session.display.bounds.height}
        onReady={handleBackdropReady}
        snapshotUrl={session.snapshotUrl}
        width={session.display.bounds.width}
      />

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
        />
      ) : null}

      {selection === null ? <div className="pointer-events-none absolute inset-0 bg-[var(--capture-overlay)]" data-testid="capture-scrim" style={fadeStyle} /> : null}

      {selection === null ? (
        <div
          className="pointer-events-none absolute left-1/2 top-7 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#161815]/90 px-4 py-2 text-xs font-medium tracking-wide text-stone-200 shadow-xl backdrop-blur-xl"
          data-testid="capture-hint"
          style={dimRise
            ? {
              opacity: fadeStyle.opacity,
              transform: shown || exiting ? "translateY(0px)" : "translateY(6px)",
              transition: exiting
                ? "opacity 120ms cubic-bezier(0.4, 0, 1, 1)"
                : "opacity 160ms cubic-bezier(0.22, 1, 0.36, 1), transform 160ms cubic-bezier(0.22, 1, 0.36, 1)",
            }
            : undefined}
        >
          {swatchHex === null ? null : <ColorSwatch hex={swatchHex} />}
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
          motionStyle={exitOnlyStyle}
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
          {redactionReview === null ? null : <RedactionPreview review={redactionReview} />}
          {completionState.phase === "idle" ? null : (
            <div
              aria-hidden="true"
              className="absolute inset-0 z-20 cursor-wait bg-transparent"
            />
          )}
        </SelectionFrame>
      )}

      {selection === null || isDraftingSelection ? null : (
        <>
          {completionState.phase === "idle" ? (
            <div
              className="absolute z-30 [&_button]:!cursor-[inherit]"
              data-capture-interactive="true"
              ref={measureToolbar}
              style={{ left: toolBarX, top: toolBarY, ...exitOnlyStyle }}
            >
            <AnnotationToolbar
              activeTool={activeTool}
              lastToolByGroup={lastToolByGroup}
              openGroupIndex={openGroupIndex}
              placement={toolbarSide}
              onGroupToolUsed={rememberGroupTool}
              onOpenGroupChange={setOpenGroupIndex}
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
          ) : null}
          {scrollingCapture === null ? (
            <div
              className="absolute z-30 [&_button]:!cursor-[inherit]"
              data-capture-interactive="true"
              style={{ left: actionRailX, top: actionRailY, ...exitOnlyStyle }}
            >
              <CompletionToolbar
                copyAndSaveShortcut={settings.shortcuts.captureModeCopyAndSave}
                copyShortcut={settings.shortcuts.captureModeCopy}
                diagnostic={completionState.phase === "save-pending" ? completionState.diagnostic : undefined}
                saveShortcut={settings.shortcuts.captureModeSave}
                state={completionState.phase}
                statusMessage={completionState.phase === "working" ? completionState.message : completionState.phase === "idle" ? completionState.message : ""}
                statusSide={actionRailX < viewport.width / 2 ? "right" : "left"}
                onComplete={(action) => void handleComplete(action)}
                onRetrySave={() => void handleRetrySave()}
                onShowcase={() => void handleComplete("save", "showcase")}
                {...(canReadText
                  ? {
                    onCopyText: () => void handleCopyText(),
                    onFindSensitive: () => void findSensitiveText(),
                  }
                  : {})}
              />
              {redactionReview === null ? null : (
                <RedactionReviewPanel
                  review={redactionReview}
                  side={actionRailX < viewport.width / 2 ? "right" : "left"}
                  onApply={applyRedactions}
                  onClose={closeRedactionReview}
                  onToggle={toggleRedactionSuggestion}
                />
              )}
            </div>
          ) : null}
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

      <div
        className="pointer-events-none absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-lg border border-white/8 bg-black/35 px-3 py-2 font-mono text-[10px] tracking-wide text-white/55 backdrop-blur-md"
      >
        {swatchHex === null ? null : <ColorSwatch hex={swatchHex} />}
        Capkit / {message}
      </div>
    </main>
  );
}

function ColorSwatch({ hex }: { hex: string }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="size-3 shrink-0 rounded-[4px] ring-1 ring-white/40"
      style={{ backgroundColor: hex }}
    />
  );
}

function resizeRect(
  initial: Rect,
  start: Point,
  current: Point,
  handle: ResizeHandle,
  viewport: Rect,
): Rect {
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
    viewport,
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
