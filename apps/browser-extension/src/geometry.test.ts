import { describe, expect, it } from "vitest";
import { computeScale, rectsIntersect, toCssPoint, toViewportRect } from "./geometry";

const viewport = { x: 0, y: 0, width: 2880, height: 1600 };

describe("geometry", () => {
  it("derives a 2x scale from a 2880 wide viewport and 1440 innerWidth", () => {
    expect(computeScale(viewport, 1440, 800)).toEqual({ scale: 2 });
  });

  it("handles browser zoom at 125% on a 150% display", () => {
    const zoomed = { x: 0, y: 0, width: 1920, height: 1000 };
    expect(computeScale(zoomed, 1024, 533.33)?.scale).toBeCloseTo(1.875, 3);
  });

  it("reports a mismatch when the heights disagree (docked DevTools)", () => {
    expect(computeScale(viewport, 1440, 500)).toBeNull();
  });

  it("rejects degenerate sizes", () => {
    expect(computeScale(viewport, 0, 800)).toBeNull();
  });

  it("converts points and rects with rounding", () => {
    expect(toCssPoint({ x: 400, y: 200 }, { scale: 2 })).toEqual({ x: 200, y: 100 });
    expect(toViewportRect({ x: 10.4, y: 20.6, width: 30.2, height: 5 }, { scale: 1.5 })).toEqual({
      x: 16,
      y: 31,
      width: 45,
      height: 8,
    });
  });

  it("intersects rects", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsIntersect(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsIntersect(a, { x: 10, y: 0, width: 5, height: 5 })).toBe(false);
  });
});
