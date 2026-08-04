import { describe, expect, it } from "vitest";
import {
  catmullRomResample,
  cursorAt,
  decodeCursorTrack,
  shapeAt,
  simplifyPath,
  smoothCursorPath,
  smoothExponential,
  splitOnTeleports,
  toPoints,
  type CursorPoint,
} from "./cursorTrack";

function line(count: number, step = 10): CursorPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    t: index / 100,
    x: index * step,
    y: index * step,
  }));
}

describe("decoding", () => {
  const raw = {
    version: 1,
    times: [0, 0.1, 0.2],
    xs: [0, 5, 10],
    ys: [0, 5, 10],
    events: [{ time: 0.1, kind: "down", button: "left", x: 5, y: 5 }],
    shapes: [{ time: 0, shape: "default" }],
    displayBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
  };

  it("parses the parallel-array payload", () => {
    const track = decodeCursorTrack(raw);
    expect(track.times).toHaveLength(3);
    expect(track.events.at(0)?.button).toBe("left");
  });

  it("zips the arrays into points, stopping at the shortest", () => {
    const track = decodeCursorTrack({ ...raw, ys: [0, 5] });
    expect(toPoints(track)).toHaveLength(2);
  });

  it("rejects a payload from a future track version", () => {
    expect(() => decodeCursorTrack({ ...raw, version: 2 })).toThrow();
  });
});

describe("teleport splitting", () => {
  it("keeps continuous motion in one segment", () => {
    expect(splitOnTeleports(line(20, 5))).toHaveLength(1);
  });

  it("cuts where the pointer jumped rather than moved", () => {
    const points: CursorPoint[] = [
      { t: 0, x: 0, y: 0 },
      { t: 0.01, x: 10, y: 0 },
      // An Alt-Tab warp: splining across this would draw a sweep that never happened.
      { t: 0.02, x: 1400, y: 900 },
      { t: 0.03, x: 1410, y: 900 },
    ];
    const segments = splitOnTeleports(points, 250);
    expect(segments).toHaveLength(2);
    expect(segments.at(0)).toHaveLength(2);
    expect(segments.at(1)).toHaveLength(2);
  });
});

describe("simplification", () => {
  it("reduces a straight run to its endpoints", () => {
    expect(simplifyPath(line(50), 2)).toHaveLength(2);
  });

  it("keeps a genuine corner", () => {
    const corner: CursorPoint[] = [
      { t: 0, x: 0, y: 0 },
      { t: 0.1, x: 100, y: 0 },
      { t: 0.2, x: 100, y: 100 },
    ];
    expect(simplifyPath(corner, 2)).toHaveLength(3);
  });
});

describe("smoothing", () => {
  it("keeps the path within its own bounds", () => {
    const smoothed = smoothExponential(line(40, 10), 0.35);
    const xs = smoothed.map((point) => point.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(390);
  });

  it("does not lag behind, because the filter runs in both directions", () => {
    const points = line(60, 10);
    const smoothed = smoothExponential(points, 0.3);
    const middle = smoothed[30];
    const original = points[30];
    // A single causal pass would sit visibly behind here; the backward pass
    // cancels that, so the midpoint stays close to the true position.
    expect(Math.abs((middle?.x ?? 0) - (original?.x ?? 0))).toBeLessThan(12);
  });

  it("resamples to the requested frame rate", () => {
    const resampled = catmullRomResample(
      [
        { t: 0, x: 0, y: 0 },
        { t: 1, x: 100, y: 0 },
      ],
      30,
    );
    expect(resampled.length).toBeGreaterThan(25);
    expect(resampled.at(-1)?.x).toBeCloseTo(100, 0);
  });

  it("runs the whole pipeline without inventing a path across a jump", () => {
    const points: CursorPoint[] = [
      ...line(10, 4),
      { t: 0.5, x: 1600, y: 900 },
      { t: 0.6, x: 1610, y: 905 },
    ];
    const smoothed = smoothCursorPath(points, { fps: 30 });
    // Nothing should land in the empty middle of the screen.
    const strays = smoothed.filter((point) => point.x > 200 && point.x < 1400);
    expect(strays).toHaveLength(0);
  });
});

describe("sampling", () => {
  it("interpolates between the surrounding samples", () => {
    const points = [
      { t: 0, x: 0, y: 0 },
      { t: 1, x: 100, y: 200 },
    ];
    expect(cursorAt(points, 0.5)).toEqual({ t: 0.5, x: 50, y: 100 });
  });

  it("clamps outside the recorded range", () => {
    const points = [
      { t: 1, x: 10, y: 10 },
      { t: 2, x: 20, y: 20 },
    ];
    expect(cursorAt(points, 0)?.x).toBe(10);
    expect(cursorAt(points, 9)?.x).toBe(20);
    expect(cursorAt([], 1)).toBeNull();
  });

  it("reports the shape in effect at a moment", () => {
    const spans = [
      { time: 0, shape: "default" },
      { time: 1, shape: "text" },
      { time: 2, shape: "pointer" },
    ];
    expect(shapeAt(spans, 0.5)).toBe("default");
    expect(shapeAt(spans, 1.5)).toBe("text");
    expect(shapeAt(spans, 99)).toBe("pointer");
  });
});
