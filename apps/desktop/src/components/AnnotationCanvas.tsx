import { memo, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Arrow, Circle, Ellipse, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import type {
  Annotation,
  AnnotationScene,
  AnnotationStyle,
  RegionAnnotation,
  ToolId,
} from "../domain/annotations";
import type { Point, Rect as CaptureRect } from "../domain/capture";
import { normalizeRect } from "../lib/geometry";

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
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const editingTextIdRef = useRef<string | null>(null);
  const editingValueRef = useRef("");
  const draftRef = useRef<Draft | null>(null);
  const draftFrameRequest = useRef<number | null>(null);

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
    if (activeTool === "select") return;
    event.stopPropagation();
    if ("setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const point = relativePoint(event);
    if (activeTool === "counter" || activeTool === "text") {
      if (activeTool === "text") finishActiveTextEdit();
      const annotation = createAnnotation(activeTool, point, point, style, scene);
      if (annotation !== null) {
        onCommit(annotation);
        if (annotation.kind === "text") {
          setSelectedTextId(annotation.id);
          setEditingTextId(null);
          editingTextIdRef.current = null;
        }
      }
      return;
    }
    setSelectedTextId(null);
    setEditingTextId(null);
    editingTextIdRef.current = null;
    const nextDraft = { id: crypto.randomUUID(), start: point, end: point, points: [point] };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
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

  function selectText(annotation: Extract<Annotation, { kind: "text" }>): void {
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
        elements={preview === null ? scene.elements : [...scene.elements, preview]}
        snapshotUrl={snapshotUrl}
      />
      <Stage height={bounds.height} listening={false} width={bounds.width}>
        <Layer>
          <SceneElements elements={scene.elements.filter((element) => element.id !== editingTextId)} />
          {preview === null ? null : renderAnnotation(preview)}
        </Layer>
      </Stage>
      {scene.elements.filter(isTextAnnotation).map((annotation) => {
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
                onPointerDown={(event) => event.stopPropagation()}
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
                <X aria-hidden="true" size={11} strokeWidth={2.4} />
              </button>
            ) : null}
          </div>
        );
      })}
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
        className="absolute overflow-hidden bg-white/[0.01]"
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
    return <div className="absolute bg-stone-500/70" data-effect-preview="pixelate" style={sharedStyle} />;
  }

  const sourceX = selectionBounds.x + effect.bounds.x;
  const sourceY = selectionBounds.y + effect.bounds.y;
  return (
    <div
      className="absolute overflow-hidden"
      data-effect-preview="pixelate"
      style={sharedStyle}
    >
      <img
        alt=""
        className="absolute max-w-none select-none"
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
