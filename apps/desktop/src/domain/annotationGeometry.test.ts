import { describe, expect, it } from "vitest";
import type { Annotation } from "./annotations";
import { annotationBounds, isResizableAnnotation, resizeAnnotation } from "./annotationGeometry";

const rectangle: Annotation = {
  id: "rect",
  kind: "rectangle",
  bounds: { x: 10, y: 20, width: 100, height: 50 },
  color: "#fff",
  fill: "transparent",
  strokeWidth: 2,
  opacity: 1,
};

const stroke: Annotation = {
  id: "stroke",
  kind: "pencil",
  points: [{ x: 20, y: 20 }, { x: 60, y: 40 }, { x: 120, y: 80 }],
  color: "#fff",
  strokeWidth: 4,
  opacity: 1,
};

describe("resizeAnnotation", () => {
  it("moves only the dragged edges of a shape", () => {
    expect(resizeAnnotation(rectangle, "se", 30, 10)).toMatchObject({ bounds: { x: 10, y: 20, width: 130, height: 60 } });
    expect(resizeAnnotation(rectangle, "w", -10, 99)).toMatchObject({ bounds: { x: 0, y: 20, width: 110, height: 50 } });
    expect(resizeAnnotation(rectangle, "n", 99, 5)).toMatchObject({ bounds: { x: 10, y: 25, width: 100, height: 45 } });
  });

  it("stops at the minimum size instead of flipping", () => {
    expect(resizeAnnotation(rectangle, "e", -500, 0)).toMatchObject({ bounds: { x: 10, width: 8 } });
    expect(resizeAnnotation(rectangle, "nw", 500, 500)).toMatchObject({ bounds: { x: 102, y: 62, width: 8, height: 8 } });
  });

  it("scales stroke points into the new frame and keeps the stroke width", () => {
    const resized = resizeAnnotation(stroke, "se", 100, 60);
    if (!("points" in resized)) throw new Error("expected a stroke");
    // Inner point box was 100 x 60 from (20, 20); now 200 x 120.
    expect(resized.points).toEqual([{ x: 20, y: 20 }, { x: 100, y: 60 }, { x: 220, y: 140 }]);
    expect(resized.strokeWidth).toBe(4);
    expect(annotationBounds(resized)).toEqual({ x: 16, y: 16, width: 208, height: 128 });
  });

  it("stretches a flat line along its length and keeps it flat", () => {
    const line: Annotation = { id: "line", kind: "highlighter", points: [{ x: 10, y: 50 }, { x: 110, y: 50 }], color: "#0f0", strokeWidth: 12, opacity: 0.48 };
    const longer = resizeAnnotation(line, "e", 50, 0);
    if (!("points" in longer)) throw new Error("expected a line");
    expect(longer.points).toEqual([{ x: 10, y: 50 }, { x: 160, y: 50 }]);
    const taller = resizeAnnotation(line, "s", 0, 40);
    if (!("points" in taller)) throw new Error("expected a line");
    expect(taller.points).toEqual([{ x: 10, y: 70 }, { x: 110, y: 70 }]);
  });

  it("resizes a counter around the new frame's centre", () => {
    const counter: Annotation = { id: "c", kind: "counter", position: { x: 50, y: 50 }, value: 1, color: "#fff", radius: 10, opacity: 1 };
    expect(resizeAnnotation(counter, "se", 20, 10)).toMatchObject({ position: { x: 60, y: 55 }, radius: 15 });
  });

  it("leaves text unchanged", () => {
    const text: Annotation = { id: "t", kind: "text", position: { x: 0, y: 0 }, text: "Hi", color: "#fff", fontFamily: "Inter", fontSize: 16, opacity: 1 };
    expect(isResizableAnnotation(text)).toBe(false);
    expect(resizeAnnotation(text, "se", 40, 40)).toBe(text);
  });
});
