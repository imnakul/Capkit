import { describe, expect, it } from "vitest";
import {
  MAX_GEOMETRY_POINTS,
  clampCornerRadius,
  dashGap,
  dashLength,
  dotSpacing,
  needsStrokeGeometry,
  newSketchSeed,
  shapeStrokeGeometry,
  type ShapeGeometryInput,
  type StrokeGeometryInput,
} from "./strokeGeometry";

type Pt = { x: number; y: number };

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) throw new Error(`Missing item ${String(index)}`);
  return value;
}

function rect(extra: Partial<ShapeGeometryInput> = {}): StrokeGeometryInput {
  return {
    kind: "rectangle",
    bounds: { x: 10, y: 10, width: 200, height: 100 },
    strokeWidth: 4,
    ...extra,
  };
}

function polylineLength(points: readonly Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = at(points, i - 1);
    const b = at(points, i);
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

describe("shapeStrokeGeometry", () => {
  it("solid rectangle is one closed outline with a fill polygon", () => {
    const geometry = shapeStrokeGeometry(rect());
    expect(geometry.strokes).toHaveLength(1);
    expect(geometry.dots).toHaveLength(0);
    expect(geometry.fill).toBeDefined();
  });

  it("dashed strokes follow the dash and gap lengths", () => {
    const geometry = shapeStrokeGeometry(rect({ strokeStyle: "dashed" }));
    expect(geometry.strokes.length).toBeGreaterThan(4);
    const first = at(geometry.strokes, 0);
    expect(polylineLength(first)).toBeCloseTo(dashLength(4), 5);
    const second = at(geometry.strokes, 1);
    const end = at(first, first.length - 1);
    const start = at(second, 0);
    expect(Math.hypot(start.x - end.x, start.y - end.y)).toBeCloseTo(dashGap(4), 5);
  });

  it("dotted produces dots spaced by the dot spacing and no strokes", () => {
    const geometry = shapeStrokeGeometry(rect({ strokeStyle: "dotted" }));
    expect(geometry.strokes).toHaveLength(0);
    const a = at(geometry.dots, 0);
    const b = at(geometry.dots, 1);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(dotSpacing(4), 5);
  });

  it("dashed arrows keep a solid head", () => {
    const geometry = shapeStrokeGeometry({
      kind: "arrow",
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
      strokeWidth: 4,
      strokeStyle: "dashed",
    });
    const wings = geometry.strokes.filter((stroke) => stroke.length === 2 && polylineLength(stroke) > 15);
    expect(wings).toHaveLength(2);
    expect(geometry.fill).toBeUndefined();
  });

  it("sketchy output is deterministic per seed and differs between seeds", () => {
    const a = shapeStrokeGeometry(rect({ strokeStyle: "sketchy", seed: 7 }));
    const b = shapeStrokeGeometry(rect({ strokeStyle: "sketchy", seed: 7 }));
    const c = shapeStrokeGeometry(rect({ strokeStyle: "sketchy", seed: 8 }));
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it("sketchy output keeps its wobble when the shape moves", () => {
    const a = shapeStrokeGeometry(rect({ strokeStyle: "sketchy", seed: 7 }));
    const moved = shapeStrokeGeometry(
      rect({ strokeStyle: "sketchy", seed: 7, bounds: { x: 110, y: 60, width: 200, height: 100 } }),
    );
    const first = at(at(a.strokes, 0), 0);
    const movedFirst = at(at(moved.strokes, 0), 0);
    expect(movedFirst.x - first.x).toBeCloseTo(100, 5);
    expect(movedFirst.y - first.y).toBeCloseTo(50, 5);
  });

  it("memoises per input object", () => {
    const input = rect({ strokeStyle: "dashed" });
    expect(shapeStrokeGeometry(input)).toBe(shapeStrokeGeometry(input));
  });

  it("rounded corners keep every point inside the bounds and cut the corner", () => {
    const geometry = shapeStrokeGeometry(rect({ cornerRadius: 20 }));
    const outline = at(geometry.strokes, 0);
    for (const point of outline) {
      expect(point.x).toBeGreaterThanOrEqual(10 - 1e-9);
      expect(point.x).toBeLessThanOrEqual(210 + 1e-9);
    }
    expect(outline.some((point) => point.x === 10 && point.y === 10)).toBe(false);
  });

  it("fails closed to solid when the point budget is exceeded", () => {
    const huge = shapeStrokeGeometry({
      kind: "line",
      points: [
        { x: 0, y: 0 },
        { x: 400_000, y: 0 },
      ],
      strokeWidth: 1,
      strokeStyle: "dotted",
    });
    expect(huge.dots).toHaveLength(0);
    expect(huge.strokes).toHaveLength(1);
    expect(MAX_GEOMETRY_POINTS).toBe(20_000);
  });
});

describe("helpers", () => {
  it("clamps the corner radius to half the shorter side", () => {
    expect(clampCornerRadius(48, 100, 20)).toBe(10);
    expect(clampCornerRadius(8, 100, 100)).toBe(8);
    expect(clampCornerRadius(undefined, 100, 100)).toBe(0);
    expect(clampCornerRadius(-5, 100, 100)).toBe(0);
    expect(clampCornerRadius(Number.NaN, 100, 100)).toBe(0);
  });

  it("only non-solid or rounded shapes need geometry", () => {
    expect(needsStrokeGeometry(rect())).toBe(false);
    expect(needsStrokeGeometry(rect({ strokeStyle: "solid" }))).toBe(false);
    expect(needsStrokeGeometry(rect({ strokeStyle: "dashed" }))).toBe(true);
    expect(needsStrokeGeometry(rect({ cornerRadius: 4 }))).toBe(true);
  });

  it("generates non-zero seeds", () => {
    for (let i = 0; i < 50; i += 1) expect(newSketchSeed()).toBeGreaterThan(0);
  });
});
