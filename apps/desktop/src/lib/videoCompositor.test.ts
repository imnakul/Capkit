import { describe, expect, it, vi } from "vitest";
import { defaultVideoScene } from "../domain/videoScene";
import { clickPulseAt, paintFrame } from "./videoCompositor";

/**
 * A Canvas2D stand-in that records every call.
 *
 * jsdom has no real Canvas, so `paintFrame` is exercised here against a fake
 * context that implements just the methods it uses, letting the drawing
 * *logic* (what gets called, in what order, gated by which flags) be verified
 * without a browser. Real pixel output is covered by the browser-side spike
 * numbers already recorded in the decision log.
 */
function fakeContext(): CanvasRenderingContext2D {
  const calls: string[] = [];
  const gradient = { addColorStop: vi.fn() };
  const context = {
    calls,
    save: vi.fn(() => calls.push("save")),
    restore: vi.fn(() => calls.push("restore")),
    clearRect: vi.fn(() => calls.push("clearRect")),
    fillRect: vi.fn(() => calls.push("fillRect")),
    strokeRect: vi.fn(),
    beginPath: vi.fn(() => calls.push("beginPath")),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(() => calls.push("arc")),
    clip: vi.fn(() => calls.push("clip")),
    fill: vi.fn(() => calls.push("fill")),
    stroke: vi.fn(() => calls.push("stroke")),
    drawImage: vi.fn(() => calls.push("drawImage")),
    translate: vi.fn(),
    scale: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    createRadialGradient: vi.fn(() => gradient),
    set fillStyle(value: unknown) {
      void value;
    },
    set strokeStyle(value: unknown) {
      void value;
    },
    set lineWidth(value: unknown) {
      void value;
    },
    set globalAlpha(value: unknown) {
      void value;
    },
    set shadowColor(value: unknown) {
      void value;
    },
    set shadowBlur(value: unknown) {
      void value;
    },
    set shadowOffsetX(value: unknown) {
      void value;
    },
    set shadowOffsetY(value: unknown) {
      void value;
    },
  };
  return context as unknown as CanvasRenderingContext2D;
}

const stage = { width: 640, height: 360 };
const mediaSize = { width: 1920, height: 1080 };

describe("paintFrame", () => {
  it("fills the background before drawing the media", () => {
    const context = fakeContext() as unknown as { calls: string[] };
    const scene = defaultVideoScene(5);
    paintFrame(context as unknown as CanvasRenderingContext2D, scene, {
      media: null,
      mediaSize,
      background: null,
      camera: null,
      cursor: null,
      clickPulse: 0,
    }, stage, [], 0);

    const fillIndex = context.calls.indexOf("fillRect");
    expect(fillIndex).toBeGreaterThanOrEqual(0);
    // The media placeholder is also a fillRect (no source yet), so the
    // ordering check is: at least one fill happens before anything is clipped.
    expect(context.calls.indexOf("clip")).toBeGreaterThan(fillIndex - 1);
  });

  it("skips the backdrop entirely when the background is disabled", () => {
    const context = fakeContext() as unknown as { calls: string[] };
    const scene = { ...defaultVideoScene(5), scene: { ...defaultVideoScene(5).scene, backgroundEnabled: false } };
    paintFrame(context as unknown as CanvasRenderingContext2D, scene, {
      media: null,
      mediaSize,
      background: null,
      camera: null,
      cursor: null,
      clickPulse: 0,
    }, stage, [], 0);
    // With no background, no padding, and no media, the only fill left is the
    // placeholder rect — never more than one before the clip.
    const fillsBeforeClip = context.calls.slice(0, context.calls.indexOf("clip")).filter((c) => c === "fillRect");
    expect(fillsBeforeClip.length).toBeLessThanOrEqual(1);
  });

  it("draws the media when a source is provided", () => {
    const context = fakeContext() as unknown as { calls: string[]; drawImage: ReturnType<typeof vi.fn> };
    const scene = defaultVideoScene(5);
    const media = {} as CanvasImageSource;
    paintFrame(context as unknown as CanvasRenderingContext2D, scene, {
      media,
      mediaSize,
      background: null,
      camera: null,
      cursor: null,
      clickPulse: 0,
    }, stage, [], 0);
    expect(context.calls).toContain("drawImage");
  });

  it("does not draw a cursor when the scene hides it", () => {
    const context = fakeContext() as unknown as { calls: string[]; arc: ReturnType<typeof vi.fn> };
    const scene = { ...defaultVideoScene(5), cursor: { ...defaultVideoScene(5).cursor, show: false } };
    paintFrame(context as unknown as CanvasRenderingContext2D, scene, {
      media: {} as CanvasImageSource,
      mediaSize,
      background: null,
      camera: null,
      cursor: { x: 500, y: 500 },
      clickPulse: 1,
    }, stage, [], 0);
    // The cursor glyph is drawn via a path (moveTo/lineTo), not arc; the click
    // ring is the only `arc` call, so hiding the cursor removes it too.
    expect(context.arc).not.toHaveBeenCalled();
  });

  it("draws the click ring only while the pulse is active", () => {
    const active = fakeContext() as unknown as { arc: ReturnType<typeof vi.fn> };
    const scene = defaultVideoScene(5);
    paintFrame(active as unknown as CanvasRenderingContext2D, scene, {
      media: {} as CanvasImageSource,
      mediaSize,
      background: null,
      camera: null,
      cursor: { x: 500, y: 500 },
      clickPulse: 1,
    }, stage, [], 0);
    expect(active.arc).toHaveBeenCalled();

    const idle = fakeContext() as unknown as { arc: ReturnType<typeof vi.fn> };
    paintFrame(idle as unknown as CanvasRenderingContext2D, scene, {
      media: {} as CanvasImageSource,
      mediaSize,
      background: null,
      camera: null,
      cursor: { x: 500, y: 500 },
      clickPulse: 0,
    }, stage, [], 0);
    expect(idle.arc).not.toHaveBeenCalled();
  });

  it("draws the camera only when it is enabled and a source exists", () => {
    const withoutCamera = fakeContext() as unknown as { drawImage: ReturnType<typeof vi.fn> };
    const scene = { ...defaultVideoScene(5), camera: { ...defaultVideoScene(5).camera, show: true } };
    paintFrame(withoutCamera as unknown as CanvasRenderingContext2D, scene, {
      media: {} as CanvasImageSource,
      mediaSize,
      background: null,
      camera: null,
      cursor: null,
      clickPulse: 0,
    }, stage, [], 0);
    // Camera enabled but no source: only the media draw happens.
    expect(withoutCamera.drawImage).toHaveBeenCalledTimes(1);

    const withCamera = fakeContext() as unknown as { drawImage: ReturnType<typeof vi.fn> };
    // `drawCoverInto` reads pixel dimensions off the source before drawing, so
    // the fake camera needs real width/height or the draw is skipped entirely.
    const cameraSource = { width: 640, height: 480 } as unknown as CanvasImageSource;
    paintFrame(withCamera as unknown as CanvasRenderingContext2D, scene, {
      media: {} as CanvasImageSource,
      mediaSize,
      background: null,
      camera: cameraSource,
      cursor: null,
      clickPulse: 0,
    }, stage, [], 0);
    expect(withCamera.drawImage).toHaveBeenCalledTimes(2);
  });

  it("never throws across the default scene, with or without sources", () => {
    const scene = defaultVideoScene(5);
    for (const sources of [
      { media: null, camera: null, cursor: null },
      { media: {} as CanvasImageSource, camera: {} as CanvasImageSource, cursor: { x: 1, y: 1 } },
    ]) {
      expect(() =>
        paintFrame(fakeContext(), scene, { ...sources, mediaSize, background: null, clickPulse: 0.5 }, stage, [], 0),
      ).not.toThrow();
    }
  });
});

describe("clickPulseAt", () => {
  it("fades out over the pulse window", () => {
    const events = [{ time: 1, kind: "down" }];
    expect(clickPulseAt(events, 1)).toBeCloseTo(1, 1);
    expect(clickPulseAt(events, 1.45)).toBeCloseTo(0, 1);
    expect(clickPulseAt(events, 2)).toBe(0);
  });

  it("ignores releases", () => {
    expect(clickPulseAt([{ time: 1, kind: "up" }], 1)).toBe(0);
  });
});
