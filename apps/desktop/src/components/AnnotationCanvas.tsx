import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Arrow, Circle, Ellipse, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import type {
  Annotation,
  AnnotationScene,
  AnnotationStyle,
  RegionAnnotation,
  ToolId,
} from "../domain/annotations";
import {
  annotationBounds,
  findAnnotationAtPoint,
  isResizableAnnotation,
  resizeAnnotation,
  translateAnnotation,
} from "../domain/annotationGeometry";
import { Cancel } from "./icons";
import type { Point, Rect as CaptureRect } from "../domain/capture";
import { normalizeRect, type ResizeHandle } from "../lib/geometry";

const resizeHandles: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const handleNames: Record<ResizeHandle, string> = {
  nw: "top-left corner",
  n: "top edge",
  ne: "top-right corner",
  e: "right edge",
  se: "bottom-right corner",
  s: "bottom edge",
  sw: "bottom-left corner",
  w: "left edge",
};

/** Arrow keys on a focused handle nudge that edge: 1px, or 10px with Shift. */
function keyboardResizeDelta(key: string, step: number): Point | null {
  switch (key) {
    case "ArrowLeft":
      return { x: -step, y: 0 };
    case "ArrowRight":
      return { x: step, y: 0 };
    case "ArrowUp":
      return { x: 0, y: -step };
    case "ArrowDown":
      return { x: 0, y: step };
    default:
      return null;
  }
}

type AnnotationCanvasProps = {
  bounds: CaptureRect;
  snapshotUrl: string;
  scene: AnnotationScene;
  activeTool: ToolId;
  style: AnnotationStyle;
  cursor: string;
  onCommit: (annotation: Annotation) => void;
  onUpdate: (annotation: Annotation) => void;
  onDelete: (annotationId: string) => void;
};

type Draft = { id: string; start: Point; end: Point; points: readonly Point[] };

export function AnnotationCanvas({
  bounds,
  snapshotUrl,
  scene,
  activeTool,
  style,
  cursor,
  onCommit,
  onUpdate,
  onDelete,
}: AnnotationCanvasProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [movingAnnotation, setMovingAnnotation] = useState<{ initial: Annotation; current: Annotation } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const editingTextIdRef = useRef<string | null>(null);
  const editingValueRef = useRef("");
  const draftRef = useRef<Draft | null>(null);
  const draftFrameRequest = useRef<number | null>(null);
  // `handle` is null while moving and names the dragged handle while resizing.
  const movingAnnotationRef = useRef<{ initial: Annotation; current: Annotation; start: Point; handle: ResizeHandle | null } | null>(null);

  const displayedElements = useMemo<readonly Annotation[]>(() => {
    if (movingAnnotation === null) return scene.elements;
    return scene.elements.map((element) => element.id === movingAnnotation.current.id ? movingAnnotation.current : element);
  }, [movingAnnotation, scene.elements]);

  const preview = useMemo<Annotation | null>(() => {
    if (draft === null) return null;
    return createAnnotation(activeTool, draft.start, draft.end, style, scene, draft.id, draft.points);
  }, [activeTool, draft, scene, style]);

  function relativePoint(event: React.PointerEvent<HTMLDivElement>): Point {
    const host = containerRef.current?.getBoundingClientRect();
    if (host === undefined) return { x: 0, y: 0 };
    return { x: event.clientX - host.left, y: event.clientY - host.top };
  }

  function scheduleDraft(next: Draft): void {
    draftRef.current = next;
    if (draftFrameRequest.current !== null) return;
    draftFrameRequest.current = window.requestAnimationFrame((): void => {
      draftFrameRequest.current = null;
      setDraft(draftRef.current);
    });
  }

  function clearDraftFrame(): void {
    if (draftFrameRequest.current !== null) {
      window.cancelAnimationFrame(draftFrameRequest.current);
      draftFrameRequest.current = null;
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    const point = relativePoint(event);
    if (activeTool === "select") {
      const hit = findAnnotationAtPoint(scene.elements, point);
      setSelectedAnnotationId(hit?.id ?? null);
      // Leave empty-space presses available to SelectionFrame so the capture
      // region itself can still be moved while Select is active.
      if (hit === undefined) return;
      event.stopPropagation();
      setSelectedTextId(hit.kind === "text" ? hit.id : null);
      finishActiveTextEdit();
      if ("setPointerCapture" in event.currentTarget) event.currentTarget.setPointerCapture(event.pointerId);
      movingAnnotationRef.current = { initial: hit, current: hit, start: point, handle: null };
      setMovingAnnotation({ initial: hit, current: hit });
      return;
    }
    event.stopPropagation();
    if ("setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (activeTool === "counter" || activeTool === "text") {
      if (activeTool === "text") finishActiveTextEdit();
      const annotation = createAnnotation(activeTool, point, point, style, scene);
      if (annotation !== null) {
        onCommit(annotation);
        if (annotation.kind === "text") {
          setSelectedTextId(annotation.id);
          setSelectedAnnotationId(annotation.id);
          setEditingTextId(null);
          editingTextIdRef.current = null;
        }
      }
      return;
    }
    setSelectedTextId(null);
    setSelectedAnnotationId(null);
    setEditingTextId(null);
    editingTextIdRef.current = null;
    const nextDraft = { id: crypto.randomUUID(), start: point, end: point, points: [point] };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }

  function startResize(annotation: Annotation, handle: ResizeHandle, event: React.PointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) return;
    // Keep the press away from SelectionFrame, which would move the capture region.
    event.stopPropagation();
    event.preventDefault();
    // Capture on the canvas so its move/up handlers keep receiving the drag.
    const container = containerRef.current;
    if (container !== null && "setPointerCapture" in container) container.setPointerCapture(event.pointerId);
    const host = container?.getBoundingClientRect();
    const start = host === undefined ? { x: 0, y: 0 } : { x: event.clientX - host.left, y: event.clientY - host.top };
    movingAnnotationRef.current = { initial: annotation, current: annotation, start, handle };
    setMovingAnnotation({ initial: annotation, current: annotation });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const moving = movingAnnotationRef.current;
    if (moving !== null) {
      if ((event.buttons & 1) === 0) {
        handlePointerUp(event);
        return;
      }
      event.stopPropagation();
      const point = relativePoint(event);
      const dx = point.x - moving.start.x;
      const dy = point.y - moving.start.y;
      const current = moving.handle === null
        ? translateAnnotation(moving.initial, dx, dy)
        : resizeAnnotation(moving.initial, moving.handle, dx, dy);
      moving.current = current;
      setMovingAnnotation({ initial: moving.initial, current });
      return;
    }
    const current = draftRef.current;
    if (current === null) return;
    if ((event.buttons & 1) === 0) {
      handlePointerUp(event);
      return;
    }
    event.stopPropagation();
    const nextPoint = relativePoint(event);
    scheduleDraft({
      id: current.id,
      start: current.start,
      end: nextPoint,
      points: activeTool === "pencil" ? [...current.points, nextPoint] : current.points,
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const moving = movingAnnotationRef.current;
    if (moving !== null) {
      event.stopPropagation();
      onUpdate(moving.current);
      movingAnnotationRef.current = null;
      setMovingAnnotation(null);
      return;
    }
    event.stopPropagation();
    const current = draftRef.current;
    if (current === null) return;
    clearDraftFrame();
    const annotation = createAnnotation(
      activeTool,
      current.start,
      relativePoint(event),
      style,
      scene,
      current.id,
      activeTool === "pencil" ? [...current.points, relativePoint(event)] : current.points,
    );
    draftRef.current = null;
    setDraft(null);
    if (annotation !== null) onCommit(annotation);
  }

  useEffect(() => (): void => clearDraftFrame(), []);

  useEffect(() => {
    if (activeTool !== "text") {
      setSelectedTextId(null);
      setEditingTextId(null);
      editingTextIdRef.current = null;
    }
  }, [activeTool]);

  useEffect(() => {
    function handleDeleteKey(event: KeyboardEvent): void {
      if (selectedAnnotationId === null || (event.key !== "Delete" && event.key !== "Backspace")) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      event.preventDefault();
      onDelete(selectedAnnotationId);
      setSelectedAnnotationId(null);
      setSelectedTextId(null);
    }
    window.addEventListener("keydown", handleDeleteKey);
    return (): void => window.removeEventListener("keydown", handleDeleteKey);
  }, [onDelete, selectedAnnotationId]);

  function selectText(annotation: Extract<Annotation, { kind: "text" }>): void {
    setSelectedAnnotationId(annotation.id);
    if (selectedTextId === annotation.id) {
      setEditingTextId(annotation.id);
      editingTextIdRef.current = annotation.id;
      const initialValue = annotation.text === "Type something" ? "" : annotation.text;
      editingValueRef.current = initialValue;
      setEditingValue(initialValue);
      return;
    }
    setSelectedTextId(annotation.id);
    setEditingTextId(null);
  }

  function commitTextEdit(annotation: Extract<Annotation, { kind: "text" }>): void {
    if (editingTextIdRef.current !== annotation.id) return;
    const currentValue = editingValueRef.current;
    editingTextIdRef.current = null;
    const nextText = currentValue.trim() === "" ? "Type something" : currentValue;
    if (nextText !== annotation.text) onUpdate({ ...annotation, text: nextText });
    setEditingTextId(null);
  }

  function finishActiveTextEdit(): void {
    const activeId = editingTextIdRef.current;
    if (activeId === null) return;
    const annotation = scene.elements.find(
      (element): element is Extract<Annotation, { kind: "text" }> =>
        element.kind === "text" && element.id === activeId,
    );
    if (annotation !== undefined) commitTextEdit(annotation);
  }

  return (
    <div
      className="absolute inset-0 touch-none overflow-hidden"
      ref={containerRef}
      role="application"
      aria-label="Screenshot annotation canvas"
      style={{ cursor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerCancel={handlePointerUp}
      onPointerUp={handlePointerUp}
    >
      <EffectPreviewLayer
        bounds={bounds}
        elements={preview === null ? displayedElements : [...displayedElements, preview]}
        snapshotUrl={snapshotUrl}
      />
      <Stage height={bounds.height} listening={false} width={bounds.width}>
        <Layer>
          <SceneElements elements={displayedElements.filter((element) => element.id !== editingTextId)} />
          {preview === null ? null : renderAnnotation(preview)}
        </Layer>
      </Stage>
      {displayedElements.filter(isTextAnnotation).map((annotation) => {
        const selected = selectedTextId === annotation.id;
        const editing = editingTextId === annotation.id;
        const estimatedWidth = Math.max(92, annotation.text.length * annotation.fontSize * 0.54);
        const estimatedHeight = annotation.fontSize * 1.35;
        return (
          <div
            className="absolute z-20"
            data-capture-interactive="true"
            key={`control-${annotation.id}`}
            style={{
              height: estimatedHeight,
              left: annotation.position.x,
              top: annotation.position.y,
              width: estimatedWidth,
            }}
          >
            {editing ? (
              <textarea
                aria-label="Edit annotation text"
                autoFocus
                className="h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-left leading-none outline-none ring-1 ring-lime-300/75"
                style={{
                  color: annotation.color,
                  fontFamily: annotation.fontFamily,
                  fontSize: annotation.fontSize,
                }}
                value={editingValue}
                onBlur={() => commitTextEdit(annotation)}
                onChange={(event) => {
                  editingValueRef.current = event.currentTarget.value;
                  setEditingValue(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    commitTextEdit(annotation);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setEditingTextId(null);
                    editingTextIdRef.current = null;
                  }
                }}
                onPointerDown={(event) => event.stopPropagation()}
              />
            ) : (
              <button
                aria-label={`${selected ? "Edit" : "Select"} text: ${annotation.text}`}
                className={`h-full w-full border bg-transparent outline-none ${selected ? "border-dashed border-lime-300/80" : "border border-transparent"}`}
                type="button"
                onClick={() => selectText(annotation)}
                onPointerDown={(event) => {
                  if (activeTool !== "select") event.stopPropagation();
                }}
              />
            )}
            {selected ? (
              <button
                aria-label="Delete text annotation"
                className="absolute -right-2.5 -top-2.5 grid size-5 place-items-center rounded-full border border-white/15 bg-[#171916] text-stone-200 shadow-lg outline-none transition-colors hover:bg-red-500 hover:text-white focus-visible:ring-2 focus-visible:ring-lime-300"
                type="button"
                onClick={() => {
                  onDelete(annotation.id);
                  setSelectedTextId(null);
                  setEditingTextId(null);
                  editingTextIdRef.current = null;
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Cancel aria-hidden="true" size={11} strokeWidth={2.4} />
              </button>
            ) : null}
          </div>
        );
      })}
      {selectedAnnotationId === null || draft !== null ? null : ((): React.JSX.Element | null => {
        const selected = displayedElements.find((element) => element.id === selectedAnnotationId);
        if (selected === undefined || selected.kind === "text") return null;
        const selectedBounds = annotationBounds(selected);
        return (
          <div aria-label={`Selected ${selected.kind} annotation`} className="pointer-events-none absolute z-30 border border-dashed border-lime-300/90 shadow-[0_0_0_1px_rgba(0,0,0,0.7)]" style={{ left: selectedBounds.x, top: selectedBounds.y, width: selectedBounds.width, height: selectedBounds.height }}>
            {isResizableAnnotation(selected) ? resizeHandles.map((handle) => (
              <button
                aria-label={`Resize ${selected.kind} annotation from the ${handleNames[handle]}`}
                className={`selection-handle selection-handle-${handle} pointer-events-auto touch-none`}
                data-capture-interactive="true"
                key={handle}
                title="Drag to resize · arrow keys nudge (Shift for 10px)"
                type="button"
                onKeyDown={(event) => {
                  const delta = keyboardResizeDelta(event.key, event.shiftKey ? 10 : 1);
                  if (delta === null) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onUpdate(resizeAnnotation(selected, handle, delta.x, delta.y));
                }}
                onPointerDown={(event) => startResize(selected, handle, event)}
              />
            )) : null}
            <button aria-label={`Delete ${selected.kind} annotation`} className="pointer-events-auto absolute -right-7 -top-7 z-30 grid size-5 place-items-center rounded-full border border-white/15 bg-[#171916] text-stone-200 shadow-lg outline-none transition-colors hover:bg-red-500 hover:text-white focus-visible:ring-2 focus-visible:ring-lime-300" type="button" onClick={() => { onDelete(selected.id); setSelectedAnnotationId(null); }} onPointerDown={(event) => event.stopPropagation()}>
              <Cancel aria-hidden="true" size={11} strokeWidth={2.4} />
            </button>
          </div>
        );
      })()}
    </div>
  );
}

const SceneElements = memo(function SceneElements({
  elements,
}: {
  elements: readonly Annotation[];
}): React.JSX.Element {
  return <>{elements.map(renderAnnotation)}</>;
});

function renderAnnotation(annotation: Annotation): React.JSX.Element | null {
  switch (annotation.kind) {
    case "line":
    case "pencil":
    case "highlighter":
      return (
        <Line
          globalCompositeOperation={annotation.kind === "highlighter" ? "multiply" : "source-over"}
          key={annotation.id}
          lineCap="round"
          lineJoin="round"
          opacity={annotation.opacity}
          points={annotation.points.flatMap((point) => [point.x, point.y])}
          stroke={annotation.color}
          strokeWidth={annotation.strokeWidth}
          tension={annotation.kind === "pencil" ? 0.28 : 0}
        />
      );
    case "arrow":
    case "curved-arrow":
      return (
        <Arrow
          fill={annotation.color}
          key={annotation.id}
          lineCap="round"
          opacity={annotation.opacity}
          pointerLength={annotation.strokeWidth * 3}
          pointerWidth={annotation.strokeWidth * 2.5}
          points={annotation.points.flatMap((point) => [point.x, point.y])}
          stroke={annotation.color}
          strokeWidth={annotation.strokeWidth}
        />
      );
    case "rectangle":
      return (
        <Rect
          fill={annotation.fill}
          height={annotation.bounds.height}
          key={annotation.id}
          opacity={annotation.opacity}
          stroke={annotation.color}
          strokeWidth={annotation.strokeWidth}
          width={annotation.bounds.width}
          x={annotation.bounds.x}
          y={annotation.bounds.y}
        />
      );
    case "ellipse":
      return (
        <Ellipse
          fill={annotation.fill}
          key={annotation.id}
          opacity={annotation.opacity}
          radiusX={annotation.bounds.width / 2}
          radiusY={annotation.bounds.height / 2}
          stroke={annotation.color}
          strokeWidth={annotation.strokeWidth}
          x={annotation.bounds.x + annotation.bounds.width / 2}
          y={annotation.bounds.y + annotation.bounds.height / 2}
        />
      );
    case "blur":
    case "pixelate":
      return null;
    case "spotlight":
    case "blackout": {
      const fill =
        annotation.kind === "blackout"
          ? "#090a08"
          : annotation.color;
      return (
        <Group
          key={annotation.id}
          opacity={annotation.kind === "spotlight" ? 1 : annotation.opacity}
        >
          <Rect
            cornerRadius={annotation.kind === "spotlight" ? 10 : 2}
            fill={fill}
            height={annotation.bounds.height}
            opacity={annotation.kind === "spotlight" ? 0.2 : 1}
            width={annotation.bounds.width}
            x={annotation.bounds.x}
            y={annotation.bounds.y}
            {...(annotation.kind === "spotlight"
              ? { stroke: annotation.color, strokeWidth: 2 }
              : {})}
          />
        </Group>
      );
    }
    case "text":
      return (
        <Text
          fill={annotation.color}
          fontFamily={annotation.fontFamily}
          fontSize={annotation.fontSize}
          key={annotation.id}
          opacity={annotation.opacity}
          text={annotation.text}
          x={annotation.position.x}
          y={annotation.position.y}
        />
      );
    case "counter":
      return (
        <Group key={annotation.id} opacity={annotation.opacity}>
          <Circle fill={annotation.color} radius={annotation.radius} x={annotation.position.x} y={annotation.position.y} />
          <Text
            align="center"
            fill="#10110f"
            fontSize={annotation.radius}
            fontStyle="bold"
            height={annotation.radius * 2}
            text={String(annotation.value)}
            verticalAlign="middle"
            width={annotation.radius * 2}
            x={annotation.position.x - annotation.radius}
            y={annotation.position.y - annotation.radius}
          />
        </Group>
      );
  }
}

type RasterEffectAnnotation = RegionAnnotation & { kind: "blur" | "pixelate" };

type EffectPreviewLayerProps = {
  bounds: CaptureRect;
  elements: readonly Annotation[];
  snapshotUrl: string;
};

function EffectPreviewLayer({
  bounds,
  elements,
  snapshotUrl,
}: EffectPreviewLayerProps): React.JSX.Element {
  const effects = elements.filter(isRasterEffect);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {effects.map((effect) => (
        <RasterEffectPreview
          effect={effect}
          key={effect.id}
          selectionBounds={bounds}
          snapshotUrl={snapshotUrl}
        />
      ))}
    </div>
  );
}

function RasterEffectPreview({
  effect,
  selectionBounds,
  snapshotUrl,
}: {
  effect: RasterEffectAnnotation;
  selectionBounds: CaptureRect;
  snapshotUrl: string;
}): React.JSX.Element {
  const blockSize = Math.max(4, Math.min(40, Math.round(effect.intensity)));
  const sharedStyle = {
    height: effect.bounds.height,
    left: effect.bounds.x,
    top: effect.bounds.y,
    width: effect.bounds.width,
  };

  if (effect.kind === "blur") {
    const radius = Math.max(2, Math.min(40, effect.intensity));
    return (
      <div
        className="absolute overflow-hidden border-2 border-dashed border-sky-300/90 bg-white/[0.01] shadow-[0_0_0_1px_rgba(0,0,0,0.65),0_0_0_5px_rgba(56,189,248,0.12)]"
        data-effect-preview="blur"
        style={{
          ...sharedStyle,
          backdropFilter: `blur(${String(radius)}px)`,
          WebkitBackdropFilter: `blur(${String(radius)}px)`,
        }}
      />
    );
  }

  if (snapshotUrl === "") {
    return <div className="absolute border-2 border-dashed border-fuchsia-300/90 bg-stone-500/70 shadow-[0_0_0_1px_rgba(0,0,0,0.65),0_0_0_5px_rgba(232,121,249,0.12)]" data-effect-preview="pixelate" style={sharedStyle} />;
  }

  const sourceX = selectionBounds.x + effect.bounds.x;
  const sourceY = selectionBounds.y + effect.bounds.y;
  return (
    <div
      className="absolute overflow-hidden border-2 border-dashed border-fuchsia-300/90 shadow-[0_0_0_1px_rgba(0,0,0,0.65),0_0_0_5px_rgba(232,121,249,0.12)]"
      data-effect-preview="pixelate"
      style={sharedStyle}
    >
      <img
        alt=""
        className="absolute block max-w-none select-none"
        draggable={false}
        src={snapshotUrl}
        style={{
          height: window.innerHeight / blockSize,
          imageRendering: "pixelated",
          left: -sourceX,
          top: -sourceY,
          transform: `scale(${String(blockSize)})`,
          transformOrigin: "left top",
          width: window.innerWidth / blockSize,
        }}
      />
    </div>
  );
}

function isRasterEffect(annotation: Annotation): annotation is RasterEffectAnnotation {
  return annotation.kind === "blur" || annotation.kind === "pixelate";
}

function isTextAnnotation(
  annotation: Annotation,
): annotation is Extract<Annotation, { kind: "text" }> {
  return annotation.kind === "text";
}

function createAnnotation(
  tool: ToolId,
  start: Point,
  end: Point,
  style: AnnotationStyle,
  scene: AnnotationScene,
  annotationId?: string,
  draftPoints: readonly Point[] = [],
): Annotation | null {
  const id = annotationId ?? crypto.randomUUID();
  const bounds = normalizeRect(start, end);
  const opacity = tool === "highlighter" ? 0.48 : style.opacity;

  switch (tool) {
    case "line":
    case "arrow":
    case "curved-arrow":
    case "highlighter":
    case "pencil":
      return {
        id,
        kind: tool,
        points: tool === "curved-arrow"
          ? quadraticCurvePoints(start, end)
          : tool === "pencil"
            ? draftPoints
            : [start, end],
        color: style.color,
        strokeWidth: tool === "highlighter" ? style.strokeWidth * 4 : style.strokeWidth,
        opacity,
      };
    case "rectangle":
    case "ellipse":
      return {
        id,
        kind: tool,
        bounds,
        color: style.color,
        fill: style.fill,
        strokeWidth: style.strokeWidth,
        opacity,
      };
    case "spotlight":
    case "blur":
    case "pixelate":
    case "blackout":
      return {
        id,
        kind: tool,
        bounds,
        color: style.color,
        intensity: style.strokeWidth,
        opacity,
      };
    case "text":
      return {
        id,
        kind: "text",
        position: start,
        text: "Type something",
        color: style.color,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        opacity,
      };
    case "counter":
      return {
        id,
        kind: "counter",
        position: start,
        value: scene.elements.filter((element) => element.kind === "counter").length + 1,
        color: style.color,
        radius: Math.max(12, style.strokeWidth * 3),
        opacity,
      };
    case "select":
      return null;
  }
}

function quadraticCurvePoints(start: Point, end: Point): readonly Point[] {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < 1) return [start, end];
  const curve = Math.min(120, Math.max(28, distance * 0.28));
  const control = {
    x: (start.x + end.x) / 2 + (-deltaY / distance) * curve,
    y: (start.y + end.y) / 2 + (deltaX / distance) * curve,
  };
  return Array.from({ length: 17 }, (_, index): Point => {
    const t = index / 16;
    const inverse = 1 - t;
    return {
      x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
      y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    };
  });
}
