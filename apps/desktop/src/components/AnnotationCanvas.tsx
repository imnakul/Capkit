import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Arrow, Circle, Ellipse, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import type {
  Annotation,
  AnnotationScene,
  AnnotationStyle,
  ToolId,
} from "../domain/annotations";
import type { Point, Rect as CaptureRect } from "../domain/capture";
import { normalizeRect } from "../lib/geometry";

type AnnotationCanvasProps = {
  bounds: CaptureRect;
  scene: AnnotationScene;
  activeTool: ToolId;
  style: AnnotationStyle;
  onCommit: (annotation: Annotation) => void;
};

type Draft = { start: Point; end: Point };

export function AnnotationCanvas({
  bounds,
  scene,
  activeTool,
  style,
  onCommit,
}: AnnotationCanvasProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const draftFrameRequest = useRef<number | null>(null);

  const preview = useMemo<Annotation | null>(() => {
    if (draft === null) return null;
    return createAnnotation(activeTool, draft.start, draft.end, style, scene);
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
    if (activeTool === "select" || activeTool === "rotate") return;
    event.stopPropagation();
    if ("setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const point = relativePoint(event);
    if (activeTool === "counter" || activeTool === "text") {
      const annotation = createAnnotation(activeTool, point, point, style, scene);
      if (annotation !== null) onCommit(annotation);
      return;
    }
    const nextDraft = { start: point, end: point };
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
    scheduleDraft({ start: current.start, end: relativePoint(event) });
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
    );
    draftRef.current = null;
    setDraft(null);
    if (annotation !== null) onCommit(annotation);
  }

  useEffect(() => (): void => clearDraftFrame(), []);

  return (
    <div
      className="absolute inset-0 touch-none overflow-hidden"
      ref={containerRef}
      role="application"
      aria-label="Screenshot annotation canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerCancel={handlePointerUp}
      onPointerUp={handlePointerUp}
    >
      <Stage height={bounds.height} listening={false} width={bounds.width}>
        <Layer>
          <SceneElements elements={scene.elements} />
          {preview === null ? null : renderAnnotation(preview)}
        </Layer>
      </Stage>
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

function renderAnnotation(annotation: Annotation): React.JSX.Element {
  switch (annotation.kind) {
    case "line":
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
        />
      );
    case "arrow":
    case "curved-arrow":
      return (
        <Arrow
          bezier={annotation.kind === "curved-arrow"}
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
    case "spotlight":
    case "blur":
    case "pixelate":
    case "blackout": {
      const fill =
        annotation.kind === "blackout"
          ? "#090a08"
          : annotation.kind === "spotlight"
            ? annotation.color
            : "rgba(120,120,120,0.62)";
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
          {annotation.kind === "pixelate" ? (
            <Text
              fill="#eceee8"
              fontSize={11}
              text="SECURE PIXELATE"
              x={annotation.bounds.x + 8}
              y={annotation.bounds.y + 8}
            />
          ) : null}
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

function createAnnotation(
  tool: ToolId,
  start: Point,
  end: Point,
  style: AnnotationStyle,
  scene: AnnotationScene,
): Annotation | null {
  const id = crypto.randomUUID();
  const bounds = normalizeRect(start, end);
  const opacity = tool === "highlighter" ? 0.48 : style.opacity;

  switch (tool) {
    case "line":
    case "arrow":
    case "curved-arrow":
    case "highlighter":
      return {
        id,
        kind: tool,
        points:
          tool === "curved-arrow"
            ? [start, { x: (start.x + end.x) / 2, y: start.y - Math.abs(end.x - start.x) * 0.18 }, end]
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
        text: style.textContent.trim() || "Type your note",
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
    case "rotate":
      return null;
  }
}
