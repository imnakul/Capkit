import { describe, expect, it } from "vitest";
import type { CursorEvent, KeyEvent } from "./cursorTrack";
import {
  clampFocus,
  clusterClicks,
  defaultZoomOptions,
  generateZoomKeyframes,
  mergeKeyframes,
  typingClusters,
  zoomAt,
  type ZoomKeyframe,
} from "./zoomKeyframes";

const source = { width: 1920, height: 1080 };

function press(time: number, x: number, y: number): CursorEvent {
  return { time, kind: "down", button: "left", x, y };
}

describe("clustering", () => {
  it("treats a double-click as one moment, not two", () => {
    const clusters = clusterClicks([press(1, 500, 400), press(1.18, 503, 402)]);
    expect(clusters).toHaveLength(1);
    expect(clusters.at(0)?.count).toBe(2);
  });

  it("splits clicks that are far apart in space", () => {
    const clusters = clusterClicks([press(1, 100, 100), press(1.2, 1500, 900)]);
    expect(clusters).toHaveLength(2);
  });

  it("splits clicks that are far apart in time", () => {
    const clusters = clusterClicks([press(1, 500, 400), press(9, 505, 405)]);
    expect(clusters).toHaveLength(2);
  });

  it("ignores releases", () => {
    const events: CursorEvent[] = [press(1, 10, 10), { time: 1.1, kind: "up", button: "left", x: 10, y: 10 }];
    expect(clusterClicks(events).at(0)?.count).toBe(1);
  });
});

describe("focus clamping", () => {
  it("keeps the viewport inside the frame", () => {
    // Centring on a corner at 2x would show black past the edge.
    expect(clampFocus(0, 0, 2)).toEqual({ cx: 0.25, cy: 0.25 });
    expect(clampFocus(1, 1, 2)).toEqual({ cx: 0.75, cy: 0.75 });
  });

  it("stays centred when there is no zoom", () => {
    expect(clampFocus(0.1, 0.9, 1)).toEqual({ cx: 0.5, cy: 0.5 });
  });
});

describe("keyframe generation", () => {
  it("starts the zoom before the click rather than on it", () => {
    const clusters = clusterClicks([press(5, 960, 540)]);
    const keyframes = generateZoomKeyframes(clusters, source);
    const zoomed = keyframes.find((frame) => frame.scale > 1);
    expect(zoomed).toBeDefined();
    expect(zoomed?.time).toBeLessThan(5);
    expect(zoomed?.time).toBeCloseTo(5 - defaultZoomOptions.leadSeconds, 5);
  });

  it("holds the zoom and pans between clicks that are close together", () => {
    const clusters = clusterClicks([press(2, 300, 300), press(3, 1500, 800)]);
    const keyframes = generateZoomKeyframes(clusters, source);
    // Popping out and back in between two nearby actions is the artefact this
    // avoids, so the track must never return to 1x in the middle.
    const middle = keyframes.filter((frame) => frame.time > 2 && frame.time < 3);
    expect(middle.every((frame) => frame.scale > 1)).toBe(true);
  });

  it("pulls out between clicks that are far apart", () => {
    const clusters = clusterClicks([press(1, 300, 300), press(20, 1500, 800)]);
    const keyframes = generateZoomKeyframes(clusters, source);
    const between = keyframes.filter((frame) => frame.time > 2 && frame.time < 19);
    expect(between.some((frame) => frame.scale === 1)).toBe(true);
  });

  it("produces nothing without clicks", () => {
    expect(generateZoomKeyframes([], source)).toHaveLength(0);
  });

  it("keeps every generated focus inside the frame", () => {
    const clusters = clusterClicks([press(2, 0, 0), press(9, 1920, 1080)]);
    const keyframes = generateZoomKeyframes(clusters, source);
    for (const frame of keyframes) {
      const half = 1 / (2 * frame.scale);
      expect(frame.cx).toBeGreaterThanOrEqual(half - 1e-9);
      expect(frame.cx).toBeLessThanOrEqual(1 - half + 1e-9);
    }
  });
});

describe("merging and sampling", () => {
  const auto: ZoomKeyframe[] = [
    { time: 0, scale: 1, cx: 0.5, cy: 0.5, source: "auto" },
    { time: 2, scale: 2, cx: 0.5, cy: 0.5, source: "auto" },
  ];

  it("lets a manual keyframe win over a nearby automatic one", () => {
    const manual: ZoomKeyframe[] = [{ time: 2.1, scale: 1.2, cx: 0.3, cy: 0.3, source: "manual" }];
    const merged = mergeKeyframes(auto, manual);
    expect(merged).toHaveLength(2);
    expect(merged.some((frame) => frame.scale === 2)).toBe(false);
    expect(merged.some((frame) => frame.source === "manual")).toBe(true);
  });

  it("keeps automatic keyframes the user has not overridden", () => {
    const manual: ZoomKeyframe[] = [{ time: 9, scale: 1.5, cx: 0.5, cy: 0.5, source: "manual" }];
    expect(mergeKeyframes(auto, manual)).toHaveLength(3);
  });

  it("eases between keyframes instead of jumping", () => {
    const midway = zoomAt(auto, 1);
    expect(midway.scale).toBeGreaterThan(1);
    expect(midway.scale).toBeLessThan(2);
  });

  it("clamps outside the keyframe range", () => {
    expect(zoomAt(auto, -5).scale).toBe(1);
    expect(zoomAt(auto, 99).scale).toBe(2);
    expect(zoomAt([], 1)).toEqual({ scale: 1, cx: 0.5, cy: 0.5 });
  });
});

function typed(time: number): KeyEvent {
  return { time, kind: "text", key: "", ctrl: false, shift: false, alt: false, meta: false };
}

function named(time: number, key: string, ctrl = false): KeyEvent {
  return { time, kind: "key", key, ctrl, shift: false, alt: false, meta: false };
}

const noPointer = (): null => null;

describe("typing", () => {
  it("zooms to the click that placed the caret", () => {
    const clusters = typingClusters([typed(2), typed(2.2), typed(2.4), typed(2.6)], [press(1, 300, 400)], noPointer);
    expect(clusters).toEqual([{ start: 2, end: 2.6, cx: 300, cy: 400, count: 4 }]);
  });

  it("falls back to the pointer when nothing was clicked first", () => {
    const clusters = typingClusters([typed(1), typed(1.1), typed(1.2)], [], () => ({ x: 50, y: 60 }));
    expect(clusters[0]).toMatchObject({ cx: 50, cy: 60 });
  });

  it("ignores shortcuts and a couple of stray keys", () => {
    const keys = [named(1, "C", true), named(1.1, "V", true), named(1.2, "Z", true), typed(5), typed(5.1)];
    expect(typingClusters(keys, [press(0, 1, 1)], noPointer)).toEqual([]);
  });

  it("keeps correcting a typo inside one burst", () => {
    const keys = [typed(1), typed(1.2), named(1.4, "Backspace"), typed(1.6)];
    expect(typingClusters(keys, [press(0, 1, 1)], noPointer)).toHaveLength(1);
  });

  it("splits on a pause and on a click that moves the caret", () => {
    const keys = [typed(1), typed(1.2), typed(1.4), typed(4), typed(4.2), typed(4.4), typed(4.7), typed(4.9), typed(5.1)];
    const clicks = [press(0, 10, 10), press(4.6, 800, 500)];
    const clusters = typingClusters(keys, clicks, noPointer);
    expect(clusters.map((cluster) => [cluster.start, cluster.cx])).toEqual([
      [1, 10],
      [4, 10],
      [4.7, 800],
    ]);
  });

  it("holds the zoom until a typing burst ends, even when a click starts later inside it", () => {
    const keyframes = generateZoomKeyframes(
      [
        { start: 1, end: 6, cx: 400, cy: 300, count: 20 },
        { start: 3, end: 3, cx: 900, cy: 500, count: 1 },
      ],
      source,
    );
    const pullOut = keyframes.at(-1);
    expect(pullOut?.scale).toBe(1);
    expect(pullOut?.time).toBeCloseTo(6 + defaultZoomOptions.holdSeconds + defaultZoomOptions.transitionSeconds);
  });
});
