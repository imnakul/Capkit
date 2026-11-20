import { describe, expect, it } from "vitest";
import { contrastRatio, gradeContrast, over, parseColor } from "./contrast";

describe("contrast", () => {
  it("computes black on white as 21", () => {
    const black = parseColor("rgb(0, 0, 0)");
    const white = parseColor("rgb(255, 255, 255)");
    if (black === null || white === null) throw new Error("parse failed");
    expect(contrastRatio(black, white)).toBeCloseTo(21, 1);
  });

  it("composites translucent colours", () => {
    const result = over({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 });
    expect(Math.round(result.r)).toBe(128);
  });

  it("grades by text size", () => {
    expect(gradeContrast(7.5, false)).toBe("AAA");
    expect(gradeContrast(4.6, false)).toBe("AA");
    expect(gradeContrast(3.2, false)).toBe("Fail");
    expect(gradeContrast(3.2, true)).toBe("AA");
  });

  it("returns null for non-rgb values", () => {
    expect(parseColor("transparent")).toBeNull();
  });
});
