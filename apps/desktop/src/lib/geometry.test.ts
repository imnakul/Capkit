import { describe, expect, it } from "vitest";
import { chooseToolbarPlacement, clampRect, normalizeRect } from "./geometry";

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

