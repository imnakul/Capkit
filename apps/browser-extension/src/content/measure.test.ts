import { describe, expect, it } from "vitest";
import { measureBetween } from "./measure";

describe("measureBetween", () => {
  it("measures the horizontal gap between side-by-side boxes", () => {
    const [m] = measureBetween({ x: 100, y: 0, width: 50, height: 20 }, { x: 0, y: 0, width: 60, height: 20 });
    expect(m).toMatchObject({ orientation: "horizontal", distance: 40 });
  });

  it("measures both axes for diagonal boxes", () => {
    const result = measureBetween({ x: 100, y: 100, width: 10, height: 10 }, { x: 0, y: 0, width: 10, height: 10 });
    expect(result.map((m) => m.distance)).toEqual([90, 90]);
  });

  it("shows insets for a nested box", () => {
    const result = measureBetween({ x: 10, y: 10, width: 20, height: 20 }, { x: 0, y: 0, width: 100, height: 100 });
    expect(result.map((m) => m.distance)).toEqual([10, 70, 10, 70]);
  });
});
