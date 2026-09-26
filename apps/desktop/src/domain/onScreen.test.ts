import { describe, expect, it } from "vitest";
import {
  initialOnScreenHistory,
  moveArrowEndpoint,
  normalizedObjectRect,
  objectAtPoint,
  objectBounds,
  onScreenHistoryReducer,
  parsePersistedOnScreenScene,
  resizeShape,
  resizeText,
  translateObject,
  type OnScreenObject,
} from "./onScreen";

describe("on-screen annotation state", () => {
  it("supports commit, clear, undo, and redo", () => {
    const object = {
      id: "shape-1",
      kind: "rectangle" as const,
      color: "#d9ff43",
      size: 4,
      start: { x: 40, y: 30 },
      end: { x: 10, y: 80 },
    };
    const committed = onScreenHistoryReducer(initialOnScreenHistory, {
      type: "commit",
      object,
    });
    const cleared = onScreenHistoryReducer(committed, { type: "clear" });
    const restored = onScreenHistoryReducer(cleared, { type: "undo" });
    const redone = onScreenHistoryReducer(restored, { type: "redo" });

    expect(committed.present).toEqual([object]);
    expect(cleared.present).toEqual([]);
    expect(restored.present).toEqual([object]);
    expect(redone.present).toEqual([]);
  });

  it("normalizes reverse-drawn rectangles and locates objects for erasing", () => {
    const object = {
      id: "shape-1",
      kind: "blur" as const,
      color: "#d9ff43",
      size: 4,
      start: { x: 80, y: 90 },
      end: { x: 20, y: 30 },
    };

    expect(normalizedObjectRect(object)).toEqual({
      x: 20,
      y: 30,
      width: 60,
      height: 60,
    });
    expect(objectAtPoint([object], { x: 50, y: 55 })?.id).toBe("shape-1");
    expect(objectAtPoint([object], { x: 120, y: 120 })).toBeNull();
  });

  it("updates an object in place, keeps z-order, and skips no-op updates", () => {
    const first: OnScreenObject = {
      id: "shape-1",
      kind: "rectangle",
      color: "#d9ff43",
      size: 4,
      start: { x: 10, y: 20 },
      end: { x: 50, y: 60 },
    };
    const second: OnScreenObject = {
      id: "shape-2",
      kind: "ellipse",
      color: "#d9ff43",
      size: 4,
      start: { x: 70, y: 80 },
      end: { x: 120, y: 140 },
    };
    let state = onScreenHistoryReducer(initialOnScreenHistory, { type: "commit", object: first });
    state = onScreenHistoryReducer(state, { type: "commit", object: second });
    const pastLength = state.past.length;

    const moved: OnScreenObject = {
      ...first,
      start: { x: 40, y: 40 },
      end: { x: 80, y: 80 },
    };
    const updated = onScreenHistoryReducer(state, { type: "update", object: moved });

    expect(updated.present.map((object) => object.id)).toEqual(["shape-1", "shape-2"]);
    expect(updated.present[0]).toEqual(moved);
    expect(updated.past.length).toBe(pastLength + 1);

    const noChange = onScreenHistoryReducer(updated, {
      type: "update",
      object: { ...moved },
    });
    expect(noChange).toBe(updated);

    const missing = onScreenHistoryReducer(updated, {
      type: "update",
      object: { ...moved, id: "missing" },
    });
    expect(missing).toBe(updated);

    const undone = onScreenHistoryReducer(updated, { type: "undo" });
    expect(undone.present).toEqual([first, second]);
  });

  it("translates every point of each object kind", () => {
    const rectangle: OnScreenObject = {
      id: "rect",
      kind: "rectangle",
      color: "#d9ff43",
      size: 4,
      start: { x: 10, y: 20 },
      end: { x: 50, y: 60 },
    };
    const pencil: OnScreenObject = {
      id: "pencil",
      kind: "pencil",
      color: "#d9ff43",
      size: 4,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
    };
    const text: OnScreenObject = {
      id: "text",
      kind: "text",
      color: "#d9ff43",
      size: 20,
      position: { x: 100, y: 200 },
      text: "Hi",
    };

    expect(translateObject(rectangle, 30, 20)).toMatchObject({
      start: { x: 40, y: 40 },
      end: { x: 80, y: 80 },
    });
    expect(translateObject(pencil, 5, -3)).toMatchObject({
      points: [
        { x: 5, y: -3 },
        { x: 15, y: 2 },
      ],
    });
    expect(translateObject(text, -10, 15)).toMatchObject({
      position: { x: 90, y: 215 },
    });
  });

  it("resizes shapes from each handle on the normalized rect", () => {
    const rectangle: OnScreenObject & { kind: "rectangle" } = {
      id: "rect",
      kind: "rectangle",
      color: "#d9ff43",
      size: 4,
      start: { x: 10, y: 20 },
      end: { x: 110, y: 120 },
    };

    expect(resizeShape(rectangle, "se", { x: 140, y: 150 })).toMatchObject({
      start: { x: 10, y: 20 },
      end: { x: 140, y: 150 },
    });
    expect(resizeShape(rectangle, "nw", { x: 0, y: 5 })).toMatchObject({
      start: { x: 0, y: 5 },
      end: { x: 110, y: 120 },
    });
    expect(resizeShape(rectangle, "e", { x: 200, y: 999 })).toMatchObject({
      start: { x: 10, y: 20 },
      end: { x: 200, y: 120 },
    });
    expect(resizeShape(rectangle, "n", { x: 999, y: 0 })).toMatchObject({
      start: { x: 10, y: 0 },
      end: { x: 110, y: 120 },
    });
  });

  it("moves only the dragged arrow endpoint", () => {
    const arrow: OnScreenObject = {
      id: "arrow",
      kind: "arrow",
      color: "#d9ff43",
      size: 4,
      start: { x: 10, y: 10 },
      end: { x: 100, y: 100 },
    };

    expect(moveArrowEndpoint(arrow, "end", { x: 150, y: 120 })).toMatchObject({
      start: { x: 10, y: 10 },
      end: { x: 150, y: 120 },
    });
    expect(moveArrowEndpoint(arrow, "start", { x: 0, y: 0 })).toMatchObject({
      start: { x: 0, y: 0 },
      end: { x: 100, y: 100 },
    });
  });

  it("resizes text proportionally and clamps it to 12–120", () => {
    const text: OnScreenObject = {
      id: "text",
      kind: "text",
      color: "#d9ff43",
      size: 20,
      position: { x: 100, y: 200 },
      text: "Hello",
    };
    // Top edge is 180; dragging the handle 10px down grows the size by 10.
    expect(resizeText(text, 210)).toMatchObject({ size: 30 });
    expect(resizeText(text, 10_000)).toMatchObject({ size: 120 });
    expect(resizeText(text, -10_000)).toMatchObject({ size: 12 });
  });

  it("measures bounds from points for pencil and the shared estimate for text", () => {
    const pencil: OnScreenObject = {
      id: "pencil",
      kind: "pencil",
      color: "#d9ff43",
      size: 4,
      points: [
        { x: 5, y: 30 },
        { x: 25, y: 10 },
      ],
    };
    const text: OnScreenObject = {
      id: "text",
      kind: "text",
      color: "#d9ff43",
      size: 20,
      position: { x: 100, y: 200 },
      text: "Hi",
    };

    expect(objectBounds(pencil)).toEqual({ x: 5, y: 10, width: 20, height: 20 });
    expect(objectBounds(text)).toEqual({
      x: 100,
      y: 180,
      width: Math.max(48, 2 * 20 * 0.58),
      height: 20,
    });
  });

  it("hit-tests diagonal arrows by segment distance, not the bounding box", () => {
    const arrow: OnScreenObject = {
      id: "arrow",
      kind: "arrow",
      color: "#d9ff43",
      size: 4,
      start: { x: 0, y: 0 },
      end: { x: 100, y: 100 },
    };

    expect(objectAtPoint([arrow], { x: 50, y: 54 })?.id).toBe("arrow");
    // Inside the bounding box but far from the diagonal segment.
    expect(objectAtPoint([arrow], { x: 90, y: 10 })).toBeNull();
  });

  it("runtime-validates persisted drawings and rejects malformed storage", () => {
    const valid = JSON.stringify([
      {
        id: "shape-1",
        kind: "rectangle",
        color: "#d9ff43",
        size: 4,
        start: { x: 10, y: 20 },
        end: { x: 50, y: 60 },
      },
    ]);

    expect(parsePersistedOnScreenScene(valid)).toHaveLength(1);
    expect(parsePersistedOnScreenScene('{"kind":"unsafe"}')).toEqual([]);
  });
});
