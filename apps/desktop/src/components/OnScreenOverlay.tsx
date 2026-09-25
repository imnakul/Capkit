import {
  Arrow,
  Blur,
  CircleShape,
  Delete,
  Download,
  Eraser,
  Focus,
  Magnifier as MagnifierIcon,
  Pencil,
  PresentationPointer,
  Redo,
  SquareShape,
  Text,
  Undo,
  type CapkitIconComponent,
} from "./icons";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Point } from "../domain/capture";
import {
  onScreenToolIds,
  type OnScreenToolId,
  useSnaphubSettings,
} from "../domain/settings";
import {
  initialOnScreenHistory,
  normalizedObjectRect,
  objectAtPoint,
  onScreenHistoryReducer,
  parsePersistedOnScreenScene,
  pointsToSvgPath,
  type OnScreenObject,
  type OnScreenShapeObject,
} from "../domain/onScreen";
import { onScreenCursor } from "../lib/cursor";
import {
  describeInvokeError,
  dismissOnScreen,
  requestOnScreenSession,
  requestOnScreenSnapshot,
  saveOnScreenCapture,
  showOnScreenSurface,
  type OnScreenSession,
} from "../lib/tauri";

type DrawingTool = "pencil" | "rectangle" | "ellipse" | "arrow" | "blur";
type OnScreenBackgroundMode = "live" | "frozen";
type TextEditor = { id: string; position: Point; value: string };
type SaveState =
  | { phase: "idle" }
  | { phase: "capturing" }
  | { phase: "message"; text: string; tone: "success" | "error" };
const persistedSceneStorageKey = "capkit.onscreen.scene.v1";
const defaultOnScreenTool: OnScreenToolId = "pointer";

const toolCatalog: readonly {
  id: OnScreenToolId;
  label: string;
  icon: CapkitIconComponent;
}[] = [
  { id: "pencil", label: "Pencil", icon: Pencil },
  { id: "rectangle", label: "Rectangle", icon: SquareShape },
  { id: "ellipse", label: "Ellipse", icon: CircleShape },
  { id: "arrow", label: "Arrow", icon: Arrow },
  { id: "text", label: "Text", icon: Text },
  { id: "spotlight", label: "Spotlight", icon: Focus },
  { id: "magnifier", label: "Magnifier", icon: MagnifierIcon },
  { id: "pointer", label: "Presentation pointer", icon: PresentationPointer },
  { id: "eraser", label: "Eraser", icon: Eraser },
  { id: "blur", label: "Blur", icon: Blur },
];

const drawingTools: readonly DrawingTool[] = [
  "pencil",
  "rectangle",
  "ellipse",
  "arrow",
  "blur",
];

export function OnScreenOverlay(): React.JSX.Element {
  const { settings } = useSnaphubSettings();
  const [session, setSession] = useState<OnScreenSession | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [backgroundMode, setBackgroundMode] = useState<OnScreenBackgroundMode>(
    settings.onScreen.liveDesktop ? "live" : "frozen",
  );
  const [activeTool, setActiveTool] = useState<OnScreenToolId>(defaultOnScreenTool);
  const [history, dispatch] = useReducer(
    onScreenHistoryReducer,
    settings.onScreen.persistDrawings,
    createInitialHistory,
  );
  const [draft, setDraft] = useState<OnScreenObject | null>(null);
  const [cursorPoint, setCursorPoint] = useState<Point>({ x: 0, y: 0 });
  const [textEditor, setTextEditor] = useState<TextEditor | null>(null);
  const [pointerHeld, setPointerHeld] = useState(false);
  const [fadingTrails, setFadingTrails] = useState<{ id: string; d: string }[]>([]);
  const [saveState, setSaveState] = useState<SaveState>({ phase: "idle" });
  const [error, setError] = useState<string | null>(null);
  const drawingPointer = useRef<number | null>(null);
  const drawingTool = useRef<OnScreenToolId | null>(null);
  const draftRef = useRef<OnScreenObject | null>(null);
  const pendingDraft = useRef<OnScreenObject | null>(null);
  const draftFrame = useRef<number | null>(null);
  const pendingCursorPoint = useRef<Point | null>(null);
  const cursorFrame = useRef<number | null>(null);
  const pendingPointerPoint = useRef<Point | null>(null);
  const pointerFrame = useRef<number | null>(null);
  const pointerPathRef = useRef("");
  const lastPointerPoint = useRef<Point | null>(null);
  const pointerHeldRef = useRef(false);
  const fadingTrailsRef = useRef<{ id: string; d: string }[]>([]);
  const fadingTrailTimers = useRef(new Map<string, number>());
  const pointerDotRef = useRef<SVGCircleElement>(null);
  const pointerGlowRef = useRef<SVGPathElement>(null);
  const pointerCoreRef = useRef<SVGPathElement>(null);
  const snapshotRequest = useRef<Promise<string> | null>(null);
  const surfaceShown = useRef(false);
  const lifecycleToken = useRef(0);
  const saveInFlight = useRef(false);
  const saveMessageTimer = useRef<number | null>(null);
  const textEditorRef = useRef<TextEditor | null>(null);
  const textEditorOpenedAt = useRef<number | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const cursor = useMemo(
    () => onScreenCursor(settings.onScreen.cursor, settings.accentColor),
    [settings.accentColor, settings.onScreen.cursor],
  );
  const blurObjects = useMemo(
    () => history.present.filter(isBlurObject),
    [history.present],
  );
  const textEditorOpen = textEditor !== null;
  const isCapturing = saveState.phase === "capturing";

  const cancelPointerFrame = useCallback((): void => {
    if (pointerFrame.current !== null) {
      window.cancelAnimationFrame(pointerFrame.current);
      pointerFrame.current = null;
    }
    pendingPointerPoint.current = null;
  }, []);

  const clearLivePointerPath = useCallback((): void => {
    pointerPathRef.current = "";
    lastPointerPoint.current = null;
    pointerGlowRef.current?.setAttribute("d", "");
    pointerCoreRef.current?.setAttribute("d", "");
  }, []);

  const removeFadingTrail = useCallback((id: string): void => {
    const timer = fadingTrailTimers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    fadingTrailTimers.current.delete(id);
    fadingTrailsRef.current = fadingTrailsRef.current.filter((trail) => trail.id !== id);
    setFadingTrails(fadingTrailsRef.current);
  }, []);

  const clearFadingTrails = useCallback((): void => {
    for (const timer of fadingTrailTimers.current.values()) {
      window.clearTimeout(timer);
    }
    fadingTrailTimers.current.clear();
    fadingTrailsRef.current = [];
    setFadingTrails([]);
  }, []);

  const clearSaveMessageTimer = useCallback((): void => {
    if (saveMessageTimer.current !== null) {
      window.clearTimeout(saveMessageTimer.current);
      saveMessageTimer.current = null;
    }
  }, []);

  const startFadingTrail = useCallback((path: string): void => {
    if (path === "" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const trail = { id: crypto.randomUUID(), d: path };
    const nextTrails = [...fadingTrailsRef.current, trail];
    const removedTrails = nextTrails.slice(0, Math.max(0, nextTrails.length - 3));
    for (const removed of removedTrails) {
      const timer = fadingTrailTimers.current.get(removed.id);
      if (timer !== undefined) window.clearTimeout(timer);
      fadingTrailTimers.current.delete(removed.id);
    }
    fadingTrailsRef.current = nextTrails.slice(-3);
    setFadingTrails(fadingTrailsRef.current);

    const timer = window.setTimeout(() => removeFadingTrail(trail.id), 600);
    fadingTrailTimers.current.set(trail.id, timer);
  }, [removeFadingTrail]);

  const dismissScreenDraw = useCallback((): void => {
    lifecycleToken.current += 1;
    clearSaveMessageTimer();
    clearFadingTrails();
    void dismissOnScreen();
  }, [clearFadingTrails, clearSaveMessageTimer]);

  const saveScreen = useCallback(async (): Promise<void> => {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    const token = lifecycleToken.current;
    clearSaveMessageTimer();
    setSaveState({ phase: "capturing" });

    const showMessage = (text: string, tone: "success" | "error"): void => {
      setSaveState({ phase: "message", text, tone });
      saveMessageTimer.current = window.setTimeout(() => {
        saveMessageTimer.current = null;
        if (lifecycleToken.current === token) setSaveState({ phase: "idle" });
      }, 2500);
    };

    try {
      await waitForTwoAnimationFrames();
      const path = await saveOnScreenCapture();
      if (lifecycleToken.current !== token) return;
      const fileName = path.split(/[\\/]/).filter((segment) => segment !== "").at(-1) ?? path;
      showMessage(`Saved to ${fileName}`, "success");
    } catch (reason: unknown) {
      if (lifecycleToken.current !== token) return;
      const diagnostic = describeInvokeError(reason, "Unknown save error");
      showMessage(`Could not save this screen. Try again. ${diagnostic}`, "error");
    } finally {
      saveInFlight.current = false;
    }
  }, [clearSaveMessageTimer]);

  const cancelText = useCallback((): void => {
    textEditorRef.current = null;
    textEditorOpenedAt.current = null;
    setTextEditor(null);
  }, []);

  const commitText = useCallback((expectedId?: string): void => {
    const editor = textEditorRef.current;
    if (
      editor === null ||
      (expectedId !== undefined && editor.id !== expectedId)
    ) {
      return;
    }
    textEditorRef.current = null;
    textEditorOpenedAt.current = null;
    setTextEditor(null);
    const text = editor.value.trim();
    if (text === "") return;
    dispatch({
      type: "commit",
      object: {
        id: crypto.randomUUID(),
        kind: "text",
        color: settings.onScreen.color,
        size: Math.max(18, settings.onScreen.strokeSize * 5),
        position: editor.position,
        text,
      },
    });
  }, [settings.onScreen.color, settings.onScreen.strokeSize]);

  const openTextEditor = useCallback((position: Point): void => {
    const nextEditor = { id: crypto.randomUUID(), position, value: "" };
    textEditorRef.current = nextEditor;
    textEditorOpenedAt.current = performance.now();
    setTextEditor(nextEditor);
  }, []);

  const clearAll = useCallback((): void => {
    cancelPointerFrame();
    clearFadingTrails();
    draftRef.current = null;
    pendingDraft.current = null;
    drawingPointer.current = null;
    drawingTool.current = null;
    setDraft(null);
    cancelText();
    pointerHeldRef.current = false;
    clearLivePointerPath();
    pointerDotRef.current?.setAttribute("visibility", "hidden");
    setPointerHeld(false);
    setActiveTool(defaultOnScreenTool);
    dispatch({ type: "clear" });
  }, [cancelPointerFrame, cancelText, clearFadingTrails, clearLivePointerPath]);

  const selectTool = useCallback(
    (tool: OnScreenToolId): void => {
      commitText();
      setActiveTool(tool);
    },
    [commitText],
  );

  const undo = useCallback((): void => dispatch({ type: "undo" }), []);
  const redo = useCallback((): void => dispatch({ type: "redo" }), []);

  useEffect(() => {
    document.documentElement.classList.add("on-screen-surface");
    lifecycleToken.current += 1;
    const token = lifecycleToken.current;
    void requestOnScreenSession()
      .then(async (nextSession) => {
        if (lifecycleToken.current !== token) return;
        if (backgroundMode === "live") {
          setSession(nextSession);
          return;
        }
        try {
          const url = await requestOnScreenSnapshot(false);
          if (lifecycleToken.current !== token) return;
          setSnapshotUrl(url);
          setSession(nextSession);
        } catch (reason: unknown) {
          if (lifecycleToken.current !== token) return;
          setError(
            describeInvokeError(
              reason,
              "Frozen frame was unavailable; using the live desktop",
            ),
          );
          setBackgroundMode("live");
          setSession(nextSession);
        }
      })
      .catch((reason: unknown) => {
        if (lifecycleToken.current !== token) return;
        setError(describeInvokeError(reason, "On-screen mode could not start"));
        void dismissOnScreen();
      });
    return (): void => {
      lifecycleToken.current += 1;
      document.documentElement.classList.remove("on-screen-surface");
    };
  }, []);

  useEffect(() => {
    return (): void => {
      lifecycleToken.current += 1;
      saveInFlight.current = false;
      clearSaveMessageTimer();
      if (cursorFrame.current !== null) {
        window.cancelAnimationFrame(cursorFrame.current);
      }
      if (draftFrame.current !== null) {
        window.cancelAnimationFrame(draftFrame.current);
      }
      cancelPointerFrame();
      for (const timer of fadingTrailTimers.current.values()) {
        window.clearTimeout(timer);
      }
      fadingTrailTimers.current.clear();
    };
  }, [cancelPointerFrame, clearSaveMessageTimer]);

  useEffect(() => {
    clearFadingTrails();
    if (activeTool === "pointer") return;
    cancelPointerFrame();
    pointerHeldRef.current = false;
    clearLivePointerPath();
    pointerDotRef.current?.setAttribute("visibility", "hidden");
    setPointerHeld(false);
  }, [activeTool, cancelPointerFrame, clearFadingTrails, clearLivePointerPath]);

  useEffect(() => {
    if (
      session === null ||
      surfaceShown.current ||
      (backgroundMode === "frozen" && snapshotUrl === null)
    ) {
      return;
    }
    surfaceShown.current = true;
    void showOnScreenSurface().catch((reason: unknown) => {
      setError(describeInvokeError(reason, "On-screen mode could not become visible"));
      dismissScreenDraw();
    });
  }, [backgroundMode, dismissScreenDraw, session, snapshotUrl]);

  useEffect(() => {
    if (settings.onScreen.persistDrawings) {
      window.localStorage.setItem(persistedSceneStorageKey, JSON.stringify(history.present));
      return;
    }
    window.localStorage.removeItem(persistedSceneStorageKey);
  }, [history.present, settings.onScreen.persistDrawings]);

  useEffect(() => {
    if (
      session === null ||
      snapshotUrl !== null ||
      (activeTool !== "magnifier" && activeTool !== "blur")
    ) {
      return;
    }
    const pending = snapshotRequest.current ?? requestOnScreenSnapshot();
    snapshotRequest.current = pending;
    let disposed = false;
    void pending
      .then((url) => {
        if (!disposed) setSnapshotUrl(url);
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          setError(describeInvokeError(reason, "Magnifier and blur could not prepare"));
          setActiveTool(defaultOnScreenTool);
        }
      })
      .finally(() => {
        snapshotRequest.current = null;
      });
    return (): void => {
      disposed = true;
    };
  }, [activeTool, session, snapshotUrl]);

  useEffect(() => {
    if (!textEditorOpen) return;
    textInputRef.current?.focus();
    const frame = requestAnimationFrame(() => textInputRef.current?.focus());
    return (): void => cancelAnimationFrame(frame);
  }, [textEditorOpen]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent): void {
      const target = event.target;
      const isEditing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (event.key === "Escape") {
        event.preventDefault();
        if (textEditorRef.current !== null) {
          cancelText();
          return;
        }
        dismissScreenDraw();
        return;
      }
      if (
        event.key.toLowerCase() === "s"
        && !event.ctrlKey
        && !event.altKey
        && !event.metaKey
        && !event.shiftKey
        && !isEditing
        && textEditorRef.current === null
      ) {
        event.preventDefault();
        void saveScreen();
        return;
      }
      if (isEditing) return;
      if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
        return;
      }
      const tool = onScreenToolIds.find(
        (candidate) => settings.onScreen.toolShortcuts[candidate] === event.key,
      );
      if (tool !== undefined) {
        event.preventDefault();
        setActiveTool(tool);
        cancelText();
      }
    }
    window.addEventListener("keydown", handleKeyboard, true);
    return (): void => window.removeEventListener("keydown", handleKeyboard, true);
  }, [cancelText, dismissScreenDraw, saveScreen, settings.onScreen.toolShortcuts]);

  function localPoint(event: React.PointerEvent<HTMLDivElement>): Point {
    return { x: event.clientX, y: event.clientY };
  }

  function scheduleCursorRender(point: Point): void {
    pendingCursorPoint.current = point;
    if (cursorFrame.current !== null) return;
    cursorFrame.current = window.requestAnimationFrame(() => {
      cursorFrame.current = null;
      const nextPoint = pendingCursorPoint.current;
      if (nextPoint !== null) setCursorPoint(nextPoint);
    });
  }

  function schedulePointerRender(points: readonly Point[]): void {
    const latestPoint = points.at(-1);
    if (latestPoint === undefined) return;

    if (pointerHeldRef.current) {
      for (const point of points) appendPointerPoint(point);
    }
    pendingPointerPoint.current = latestPoint;
    if (pointerFrame.current !== null) return;
    pointerFrame.current = window.requestAnimationFrame(() => {
      pointerFrame.current = null;
      const nextPoint = pendingPointerPoint.current;
      pendingPointerPoint.current = null;
      if (nextPoint === null) return;

      pointerDotRef.current?.setAttribute("cx", String(nextPoint.x));
      pointerDotRef.current?.setAttribute("cy", String(nextPoint.y));
      pointerDotRef.current?.setAttribute("visibility", "visible");
      if (pointerHeldRef.current) {
        pointerGlowRef.current?.setAttribute("d", pointerPathRef.current);
        pointerCoreRef.current?.setAttribute("d", pointerPathRef.current);
      }
    });
  }

  function appendPointerPoint(point: Point): void {
    const previous = lastPointerPoint.current;
    if (
      previous !== null
      && Math.hypot(point.x - previous.x, point.y - previous.y) < 1.5
    ) {
      return;
    }

    pointerPathRef.current = pointerPathRef.current === ""
      ? `M ${String(point.x)} ${String(point.y)}`
      : `${pointerPathRef.current} L ${String(point.x)} ${String(point.y)}`;
    lastPointerPoint.current = point;
  }

  function scheduleDraftRender(nextDraft: OnScreenObject | null): void {
    pendingDraft.current = nextDraft;
    if (draftFrame.current !== null) return;
    draftFrame.current = window.requestAnimationFrame(() => {
      draftFrame.current = null;
      setDraft(pendingDraft.current);
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || isOnScreenControl(event.target)) return;
    const point = localPoint(event);
    if (toolTracksCursor(activeTool)) setCursorPoint(point);
    if (activeTool === "spotlight" || activeTool === "magnifier") return;
    if (activeTool === "eraser") {
      const object = objectAtPoint(history.present, point);
      if (object !== null) dispatch({ type: "remove", id: object.id });
      return;
    }
    if (activeTool === "text") {
      event.preventDefault();
      commitText();
      openTextEditor(point);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingPointer.current = event.pointerId;
    drawingTool.current = activeTool;
    if (activeTool === "pointer") {
      clearLivePointerPath();
      pointerHeldRef.current = true;
      setPointerHeld(true);
      return;
    }
    if (isDrawingTool(activeTool)) {
      if (activeTool === "blur" && snapshotUrl === null) return;
      const nextDraft = createDraft(
        activeTool,
        point,
        settings.onScreen.color,
        settings.onScreen.strokeSize,
      );
      draftRef.current = nextDraft;
      setDraft(nextDraft);
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (isOnScreenControl(event.target)) return;
    const point = localPoint(event);
    if (activeTool === "pointer") {
      const coalescedEvents = coalescedPointerEvents(event.nativeEvent);
      const points = coalescedEvents.length === 0
        ? [point]
        : coalescedEvents.map((sample) => ({ x: sample.clientX, y: sample.clientY }));
      schedulePointerRender(points);
      return;
    }
    if (toolTracksCursor(activeTool)) scheduleCursorRender(point);
    if (drawingPointer.current !== event.pointerId) return;
    const nextDraft = updateDraft(draftRef.current, point);
    draftRef.current = nextDraft;
    scheduleDraftRender(nextDraft);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (isOnScreenControl(event.target)) return;
    if (drawingPointer.current !== event.pointerId) return;
    const completedTool = drawingTool.current;
    drawingPointer.current = null;
    drawingTool.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (completedTool === "pointer") {
      startFadingTrail(pointerPathRef.current);
      pointerHeldRef.current = false;
      clearLivePointerPath();
      setPointerHeld(false);
      return;
    }
    const completedDraft = draftRef.current;
    draftRef.current = null;
    pendingDraft.current = null;
    if (draftFrame.current !== null) {
      window.cancelAnimationFrame(draftFrame.current);
      draftFrame.current = null;
    }
    setDraft(null);
    if (completedDraft !== null && isMeaningfulObject(completedDraft)) {
      dispatch({ type: "commit", object: completedDraft });
    }
  }

  if (session === null) {
    return error === null ? <div className="size-full bg-transparent" /> : <div className="size-full bg-transparent" role="alert">{error}</div>;
  }

  const displayWidth = session.display.bounds.width;
  const displayHeight = session.display.bounds.height;

  return (
    <div
      aria-label="On-screen annotation surface"
      className="fixed inset-0 select-none overflow-hidden bg-transparent"
      role="application"
      style={{ cursor }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onLostPointerCapture={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {backgroundMode === "frozen" && snapshotUrl !== null ? (
        <img
          alt=""
          className="pointer-events-none fixed select-none object-fill"
          data-testid="on-screen-frozen-background"
          draggable={false}
          src={snapshotUrl}
          style={{ height: displayHeight, left: 0, top: 0, width: displayWidth }}
        />
      ) : null}
      {activeTool === "spotlight" ? (
        <Spotlight cursor={cursorPoint} radius={settings.onScreen.spotlightSize} />
      ) : null}
      <BlurLayer
        displayHeight={displayHeight}
        displayWidth={displayWidth}
        objects={blurObjects}
        snapshotUrl={snapshotUrl}
      />
      {draft?.kind === "blur" && snapshotUrl !== null ? (
        <BlurRegion
          displayHeight={displayHeight}
          displayWidth={displayWidth}
          draft
          key={draft.id}
          object={draft}
          snapshotUrl={snapshotUrl}
        />
      ) : null}
      <AnnotationLayer
        objects={history.present}
        draft={draft}
      />
      <PointerLayer
        active={activeTool === "pointer"}
        accent={settings.onScreen.color}
        coreRef={pointerCoreRef}
        dotRef={pointerDotRef}
        fadingTrails={fadingTrails}
        glowRef={pointerGlowRef}
        hidden={isCapturing}
        onFadeEnd={removeFadingTrail}
        pointerHeld={pointerHeld}
      />
      {activeTool === "magnifier" && snapshotUrl !== null ? (
        <Magnifier
          cursor={cursorPoint}
          displayHeight={displayHeight}
          displayWidth={displayWidth}
          snapshotUrl={snapshotUrl}
        />
      ) : null}
      {activeTool === "text" && textEditor === null ? (
        <div
          className="pointer-events-none fixed bottom-28 left-1/2 z-40 -translate-x-1/2 rounded-md border border-white/12 bg-[#171815]/98 px-3 py-1.5 text-[12px] font-semibold text-stone-200 shadow-xl"
          role="status"
          style={{
            visibility: isCapturing || saveState.phase === "message" ? "hidden" : undefined,
          }}
        >
          Click anywhere to type
        </div>
      ) : null}
      {textEditor === null ? null : (
        <textarea
          aria-label="On-screen text"
          className="fixed z-40 min-h-10 w-56 resize-none overflow-hidden rounded-md border border-white/30 bg-[#171815]/90 px-2.5 py-2 text-[20px] font-medium text-white shadow-2xl outline-none ring-2 ring-[var(--snaphub-accent)]"
          data-onscreen-control="true"
          key={textEditor.id}
          placeholder="Type here…"
          ref={textInputRef}
          rows={1}
          style={{
            left: Math.max(8, Math.min(textEditor.position.x, window.innerWidth - 232)),
            top: Math.max(8, Math.min(textEditor.position.y, window.innerHeight - 64)),
            color: settings.onScreen.color,
            visibility: isCapturing ? "hidden" : undefined,
          }}
          value={textEditor.value}
          onBlur={() => {
            const currentEditor = textEditorRef.current;
            const openedAt = textEditorOpenedAt.current;
            if (
              currentEditor?.id === textEditor.id &&
              currentEditor.value.trim() === "" &&
              openedAt !== null &&
              performance.now() - openedAt < 100
            ) {
              requestAnimationFrame(() => {
                if (textEditorRef.current?.id === textEditor.id) {
                  textInputRef.current?.focus();
                }
              });
              return;
            }
            commitText(textEditor.id);
          }}
          onChange={(event) => {
            const nextEditor = {
              ...textEditor,
              value: event.currentTarget.value,
            };
            textEditorRef.current = nextEditor;
            setTextEditor(nextEditor);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelText();
            } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              commitText();
            }
          }}
          onPointerDown={(event) => event.stopPropagation()}
        />
      )}
      <OnScreenDock
        activeTool={activeTool}
        canRedo={history.future.length > 0}
        canUndo={history.past.length > 0}
        capturing={isCapturing}
        saveDisabled={saveInFlight.current || isCapturing}
        toolShortcuts={settings.onScreen.toolShortcuts}
        onClear={clearAll}
        onRedo={redo}
        onSave={() => void saveScreen()}
        onToolChange={selectTool}
        onUndo={undo}
      />
      <div
        aria-live="polite"
        className={`pointer-events-none fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-md border px-3 py-2 text-[12px] font-semibold shadow-xl ${saveState.phase === "message" && saveState.tone === "error" ? "border-rose-200/25 bg-[#261715]/98 text-rose-100" : "border-white/12 bg-[#171815]/98 text-stone-100"}`}
        data-testid="on-screen-save-status"
        role="status"
        style={{
          visibility: isCapturing || saveState.phase !== "message" ? "hidden" : undefined,
        }}
      >
        {saveState.phase === "message" ? saveState.text : null}
      </div>
      {error === null ? null : (
        <div
          className="pointer-events-none fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-md border border-amber-200/20 bg-[#171815]/98 px-3 py-2 text-[12px] font-medium text-amber-100 shadow-xl"
          role="status"
          style={{ visibility: isCapturing ? "hidden" : undefined }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function waitForTwoAnimationFrames(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function coalescedPointerEvents(event: PointerEvent): PointerEvent[] {
  const optionalCoalescedEventApi: { getCoalescedEvents?: () => PointerEvent[] } = event;
  return optionalCoalescedEventApi.getCoalescedEvents?.() ?? [];
}

function createInitialHistory(persistDrawings: boolean): typeof initialOnScreenHistory {
  if (!persistDrawings) return initialOnScreenHistory;
  return {
    past: [],
    present: parsePersistedOnScreenScene(
      window.localStorage.getItem(persistedSceneStorageKey),
    ),
    future: [],
  };
}

function createDraft(
  tool: DrawingTool,
  point: Point,
  color: string,
  size: number,
): OnScreenObject {
  if (tool === "pencil") {
    return {
      id: crypto.randomUUID(),
      kind: "pencil",
      color,
      size,
      points: [point],
    };
  }
  return {
    id: crypto.randomUUID(),
    kind: tool,
    color,
    size,
    start: point,
    end: point,
  };
}

function isDrawingTool(tool: OnScreenToolId): tool is DrawingTool {
  return drawingTools.some((candidate) => candidate === tool);
}

function isOnScreenControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("[data-onscreen-control]") !== null
  );
}

function toolTracksCursor(tool: OnScreenToolId): boolean {
  return (
    tool === "spotlight" ||
    tool === "magnifier"
  );
}

function isBlurObject(object: OnScreenObject): object is OnScreenShapeObject {
  return object.kind === "blur";
}

function updateDraft(object: OnScreenObject | null, point: Point): OnScreenObject | null {
  if (object === null || object.kind === "text") return object;
  if (object.kind === "pencil") {
    const previous = object.points.at(-1);
    if (previous !== undefined && Math.hypot(point.x - previous.x, point.y - previous.y) < 2) {
      return object;
    }
    return { ...object, points: [...object.points, point] };
  }
  return { ...object, end: point };
}

function isMeaningfulObject(object: OnScreenObject): boolean {
  if (object.kind === "text") return object.text.trim() !== "";
  if (object.kind === "pencil") return object.points.length > 1;
  const rect = normalizedObjectRect(object);
  return rect.width >= 3 || rect.height >= 3;
}

const AnnotationLayer = memo(function AnnotationLayer({
  objects,
  draft,
}: {
  objects: readonly OnScreenObject[];
  draft: OnScreenObject | null;
}): React.JSX.Element {
  const visible = [...objects.filter((object) => object.kind !== "blur"), ...(draft === null || draft.kind === "blur" ? [] : [draft])];
  return (
    <svg aria-hidden="true" className="pointer-events-none fixed inset-0 z-20 size-full overflow-visible">
      <defs>
        <marker id="on-screen-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
          <path d="M0,0 L8,4 L0,8 Z" fill="context-stroke" />
        </marker>
      </defs>
      {visible.map((object) => <OnScreenSvgObject key={object.id} object={object} />)}
    </svg>
  );
});

function PointerLayer({
  active,
  hidden,
  pointerHeld,
  accent,
  fadingTrails,
  dotRef,
  glowRef,
  coreRef,
  onFadeEnd,
}: {
  active: boolean;
  hidden: boolean;
  pointerHeld: boolean;
  accent: string;
  fadingTrails: readonly { id: string; d: string }[];
  dotRef: React.RefObject<SVGCircleElement | null>;
  glowRef: React.RefObject<SVGPathElement | null>;
  coreRef: React.RefObject<SVGPathElement | null>;
  onFadeEnd: (id: string) => void;
}): React.JSX.Element | null {
  if (!active) return null;
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 size-full overflow-visible"
      data-testid="on-screen-pointer-trail"
      data-pointer-held={pointerHeld}
      style={{ visibility: hidden ? "hidden" : undefined }}
    >
      {fadingTrails.map((trail) => (
        <g
          className="animate-[laser-fade_450ms_ease-out_forwards] motion-reduce:hidden"
          data-testid="on-screen-fading-trail"
          key={trail.id}
          onAnimationEnd={() => onFadeEnd(trail.id)}
        >
          <path
            d={trail.d}
            fill="none"
            opacity="0.24"
            stroke={accent}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="12"
          />
          <path
            d={trail.d}
            fill="none"
            stroke={accent}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="5"
          />
        </g>
      ))}
      <path
        data-testid="on-screen-pointer-glow"
        fill="none"
        opacity="0.24"
        ref={glowRef}
        stroke={accent}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="12"
      />
      <path
        data-testid="on-screen-pointer-core"
        fill="none"
        ref={coreRef}
        stroke={accent}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
      <circle
        data-testid="on-screen-pointer-dot"
        fill={accent}
        r="7"
        ref={dotRef}
        stroke="rgb(255 255 255 / 72%)"
        strokeWidth="2"
        visibility="hidden"
      />
    </svg>
  );
}

function OnScreenSvgObject({ object }: { object: OnScreenObject }): React.JSX.Element | null {
  if (object.kind === "blur") return null;
  if (object.kind === "text") {
    return <text data-onscreen-object={object.id} fill={object.color} fontFamily="'Plus Jakarta Sans Variable', sans-serif" fontSize={object.size} fontWeight="650" x={object.position.x} y={object.position.y}>{object.text}</text>;
  }
  if (object.kind === "pencil") {
    return <path d={pointsToSvgPath(object.points)} data-onscreen-object={object.id} fill="none" stroke={object.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={object.size} />;
  }
  const rect = normalizedObjectRect(object);
  if (object.kind === "rectangle") {
    return <rect data-onscreen-object={object.id} fill="transparent" height={rect.height} rx="3" stroke={object.color} strokeWidth={object.size} width={rect.width} x={rect.x} y={rect.y} />;
  }
  if (object.kind === "ellipse") {
    return <ellipse cx={rect.x + rect.width / 2} cy={rect.y + rect.height / 2} data-onscreen-object={object.id} fill="transparent" rx={rect.width / 2} ry={rect.height / 2} stroke={object.color} strokeWidth={object.size} />;
  }
  return <line data-onscreen-object={object.id} markerEnd="url(#on-screen-arrow)" stroke={object.color} strokeLinecap="round" strokeWidth={object.size} x1={object.start.x} x2={object.end.x} y1={object.start.y} y2={object.end.y} />;
}

const BlurLayer = memo(function BlurLayer({
  displayHeight,
  displayWidth,
  objects,
  snapshotUrl,
}: {
  displayHeight: number;
  displayWidth: number;
  objects: readonly OnScreenShapeObject[];
  snapshotUrl: string | null;
}): React.JSX.Element | null {
  if (snapshotUrl === null || objects.length === 0) return null;
  return (
    <>
      {objects.map((object) => (
        <BlurRegion
          displayHeight={displayHeight}
          displayWidth={displayWidth}
          key={object.id}
          object={object}
          snapshotUrl={snapshotUrl}
        />
      ))}
    </>
  );
});

function BlurRegion({
  displayHeight,
  displayWidth,
  object,
  snapshotUrl,
  draft = false,
}: {
  displayHeight: number;
  displayWidth: number;
  object: OnScreenShapeObject;
  snapshotUrl: string;
  draft?: boolean;
}): React.JSX.Element {
  const rect = normalizedObjectRect(object);
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed z-10 overflow-hidden ${draft ? "border-2 border-dashed border-white/85" : "border border-white/25"}`}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <img
        alt=""
        className="pointer-events-none absolute max-w-none object-fill"
        src={snapshotUrl}
        style={{
          filter: "blur(13px)",
          height: displayHeight,
          left: -rect.x,
          top: -rect.y,
          width: displayWidth,
        }}
      />
    </div>
  );
}

function Spotlight({ cursor, radius }: { cursor: Point; radius: number }): React.JSX.Element {
  return <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-10 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.68)] will-change-transform" data-testid="on-screen-spotlight" style={{ height: radius * 2, transform: `translate3d(${String(cursor.x - radius)}px, ${String(cursor.y - radius)}px, 0)`, width: radius * 2 }} />;
}

function Magnifier({
  cursor,
  displayHeight,
  displayWidth,
  snapshotUrl,
}: {
  cursor: Point;
  displayHeight: number;
  displayWidth: number;
  snapshotUrl: string;
}): React.JSX.Element {
  const radius = 92;
  const zoom = 1.85;
  return <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-30 overflow-hidden rounded-full border-4 border-white/90 bg-black shadow-[0_16px_52px_rgba(0,0,0,0.48)] ring-2 ring-black/45 will-change-transform" style={{ height: radius * 2, transform: `translate3d(${String(cursor.x - radius)}px, ${String(cursor.y - radius)}px, 0)`, width: radius * 2 }}><img alt="" className="pointer-events-none absolute left-0 top-0 max-w-none object-fill will-change-transform" src={snapshotUrl} style={{ height: displayHeight * zoom, transform: `translate3d(${String(radius - cursor.x * zoom)}px, ${String(radius - cursor.y * zoom)}px, 0)`, width: displayWidth * zoom }} /><span className="absolute bottom-2 right-3 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white">1.85×</span></div>;
}

const OnScreenDock = memo(function OnScreenDock({
  activeTool,
  canUndo,
  canRedo,
  capturing,
  saveDisabled,
  toolShortcuts,
  onToolChange,
  onUndo,
  onRedo,
  onSave,
  onClear,
}: {
  activeTool: OnScreenToolId;
  canUndo: boolean;
  canRedo: boolean;
  capturing: boolean;
  saveDisabled: boolean;
  toolShortcuts: Record<OnScreenToolId, string>;
  onToolChange: (tool: OnScreenToolId) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onClear: () => void;
}): React.JSX.Element {
  const [hoveredTool, setHoveredTool] = useState<OnScreenToolId | null>(null);
  const highlightedTool = hoveredTool ?? activeTool;
  const highlightedIndex = toolCatalog.findIndex((tool) => tool.id === highlightedTool);

  return (
    <div className="fixed bottom-12 left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/12 bg-[#171815]/98 p-2 text-white shadow-[0_22px_72px_rgba(0,0,0,0.48)]" data-onscreen-control="true" data-testid="on-screen-dock" role="toolbar" aria-label="On-screen drawing tools" style={{ visibility: capturing ? "hidden" : undefined }} onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()}>
      <div className="relative flex items-center gap-1.5" onPointerLeave={() => setHoveredTool(null)}>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 size-11 rounded-[11px] bg-[var(--snaphub-accent)] transition-transform duration-200 ease-out"
          data-testid="on-screen-tool-highlight"
          style={{ transform: `translate3d(${String(highlightedIndex * 50)}px, 0, 0)` }}
        />
        {toolCatalog.map((tool) => {
          const Icon = tool.icon;
          const shortcut = toolShortcuts[tool.id];
          const highlighted = highlightedTool === tool.id;
          return <button aria-label={`${tool.label}${shortcut === "" ? "" : `, shortcut ${shortcut}`}`} aria-pressed={activeTool === tool.id} className={`relative z-10 grid size-11 shrink-0 place-items-center rounded-[11px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white ${highlighted ? "text-[#11130f]" : "text-stone-300 hover:text-white"}`} key={tool.id} title={tool.label} type="button" onClick={() => onToolChange(tool.id)} onFocus={() => setHoveredTool(tool.id)} onPointerEnter={() => setHoveredTool(tool.id)}><Icon aria-hidden="true" size={20} strokeWidth={2} />{shortcut === "" ? null : <kbd className="absolute right-1 top-1 font-mono text-[10px] font-bold opacity-65">{shortcut}</kbd>}</button>;
        })}
      </div>
      <span aria-hidden="true" className="mx-0.5 h-7 w-px bg-white/12" />
      <button aria-label="Undo on-screen change" className="grid size-11 place-items-center rounded-[11px] text-stone-300 outline-none transition hover:bg-white/9 hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:opacity-25" disabled={!canUndo} title="Undo" type="button" onClick={onUndo}><Undo aria-hidden="true" size={20} /></button>
      <button aria-label="Redo on-screen change" className="grid size-11 place-items-center rounded-[11px] text-stone-300 outline-none transition hover:bg-white/9 hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:opacity-25" disabled={!canRedo} title="Redo" type="button" onClick={onRedo}><Redo aria-hidden="true" size={20} /></button>
      <button aria-label="Save screen, shortcut S" aria-keyshortcuts="S" className="flex h-11 items-center gap-2 rounded-[11px] px-3 text-[11px] font-bold text-stone-200 outline-none transition hover:bg-white/9 hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:cursor-wait disabled:opacity-40" disabled={saveDisabled} title="Save screen (S)" type="button" onClick={onSave}><Download aria-hidden="true" size={18} /><span>Save screen</span><kbd aria-hidden="true" className="rounded border border-white/20 px-1 font-mono text-[10px] font-bold text-stone-400">S</kbd></button>
      <button aria-label="Clear all on-screen changes" className="ml-0.5 flex h-11 items-center gap-2 rounded-[11px] bg-[#ff5b4d] px-4 text-[11px] font-bold text-white outline-none transition hover:bg-[#ff7468] focus-visible:ring-2 focus-visible:ring-white" type="button" onClick={onClear}><Delete aria-hidden="true" size={17} />Clear</button>
    </div>
  );
});
