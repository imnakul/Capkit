import { describe, expect, it } from "vitest";
import { chooseToolbarPlacement, clampRect, normalizeRect, toolbarPosition } from "./geometry";

describe("normalizeRect", () => {
  it("normalizes a reverse drag", () => {
    expect(normalizeRect({ x: 100, y: 80 }, { x: 20, y: 10 })).toEqual({
      x: 20,
      y: 10,
      width: 80,
      height: 70,
    });
  });
});

describe("clampRect", () => {
  it("keeps the rectangle inside a negative-origin display", () => {
    expect(
      clampRect(
        { x: -1500, y: 100, width: 900, height: 500 },
        { x: -1280, y: 0, width: 1280, height: 720 },
      ),
    ).toEqual({ x: -1280, y: 100, width: 900, height: 500 });
  });
});

describe("chooseToolbarPlacement", () => {
  it("moves tools above a bottom-edge selection", () => {
    expect(
      chooseToolbarPlacement(
        { x: 400, y: 900, width: 500, height: 150 },
        { x: 0, y: 0, width: 1920, height: 1080 },
      ).tools,
    ).toBe("top");
  });

  it("moves actions left when there is no room on the right", () => {
    expect(
      chooseToolbarPlacement(
        { x: 1600, y: 300, width: 300, height: 300 },
        { x: 0, y: 0, width: 1920, height: 1080 },
      ).actions,
    ).toBe("left");
  });
});


describe("toolbarPosition", () => {
  const viewport = { width: 1280, height: 720 };

  it("keeps the whole toolbar inside the viewport for a bottom-right selection", () => {
    const size = { width: 620, height: 104 };
    const selection = { x: 1000, y: 500, width: 280, height: 220 };
    for (const side of ["bottom", "top"] as const) {
      const position = toolbarPosition(selection, viewport, side, size);
      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeGreaterThanOrEqual(0);
      expect(position.x + size.width).toBeLessThanOrEqual(viewport.width);
      expect(position.y + size.height).toBeLessThanOrEqual(viewport.height);
    }
  });

  it("sits just below or above the selection when there is room", () => {
    const size = { width: 400, height: 52 };
    const selection = { x: 100, y: 200, width: 300, height: 100 };
    expect(toolbarPosition(selection, viewport, "bottom", size)).toEqual({ x: 100, y: 310 });
    expect(toolbarPosition(selection, viewport, "top", size)).toEqual({ x: 100, y: 138 });
  });
});
