import { describe, expect, it } from "vitest";
import {
  displayToSelection,
  isUsableSmartTarget,
  rectDisplayToSelection,
  selectionToDisplay,
  smartAnnotationBounds,
} from "./smartSelect";
import type { DetectedTarget, Rect } from "./capture";

const selection: Rect = { x: 100, y: 50, width: 400, height: 300 };
const target = (bounds: Rect, kind: DetectedTarget["kind"] = "ui-region"): DetectedTarget => ({ id: "t", title: "t", kind, bounds });

describe("smart select coordinates", () => {
  it("round-trips between display and selection space", () => {
    const point = { x: 130, y: 90 };
    expect(displayToSelection(point, selection)).toEqual({ x: 30, y: 40 });
    expect(selectionToDisplay(displayToSelection(point, selection), selection)).toEqual(point);
  });

  it("is independent of the display scale, so mixed-DPI monitors snap the same", () => {
    // A secondary 150% monitor placed at a negative logical origin.
    const secondary: Rect = { x: -1280, y: 200, width: 640, height: 480 };
    const element: Rect = { x: -1200, y: 260, width: 120, height: 40 };
    expect(rectDisplayToSelection(element, secondary)).toEqual({ x: 80, y: 60, width: 120, height: 40 });
    expect(rectDisplayToSelection(element, { ...secondary, x: 0 })).toEqual({ x: -1200, y: 60, width: 120, height: 40 });
  });
});

describe("isUsableSmartTarget", () => {
  it("rejects elements under 12 px and ones outside the selection", () => {
    expect(isUsableSmartTarget(target({ x: 120, y: 80, width: 11, height: 40 }), selection)).toBe(false);
    expect(isUsableSmartTarget(target({ x: 0, y: 0, width: 50, height: 20 }), selection)).toBe(false);
    expect(isUsableSmartTarget(target({ x: 120, y: 80, width: 50, height: 20 }), selection)).toBe(true);
  });

  it("rejects a window that covers 90% of the selection but keeps small windows and large regions", () => {
    expect(isUsableSmartTarget(target({ x: 0, y: 0, width: 1000, height: 800 }, "window"), selection)).toBe(false);
    expect(isUsableSmartTarget(target({ x: 100, y: 50, width: 400, height: 300 }, "ui-region"), selection)).toBe(true);
    expect(isUsableSmartTarget(target({ x: 120, y: 70, width: 100, height: 100 }, "window"), selection)).toBe(true);
  });
});

describe("smartAnnotationBounds", () => {
  const size = { width: 400, height: 300 };
  it("pads by 4 px and clips to the selection", () => {
    expect(smartAnnotationBounds({ x: 50, y: 50, width: 100, height: 40 }, size, false)).toEqual({ x: 46, y: 46, width: 108, height: 48 });
    expect(smartAnnotationBounds({ x: 0, y: 2, width: 100, height: 40 }, size, false)).toEqual({ x: 0, y: 0, width: 104, height: 46 });
  });

  it("circumscribes with an ellipse box centred on the candidate", () => {
    const box = smartAnnotationBounds({ x: 100, y: 100, width: 100, height: 100 }, size, true);
    expect(box.x + box.width / 2).toBeCloseTo(150);
    expect(box.width).toBeCloseTo(108 * Math.SQRT2);
  });
});
