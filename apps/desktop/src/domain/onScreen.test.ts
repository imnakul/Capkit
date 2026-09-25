import { describe, expect, it } from "vitest";
import {
  initialOnScreenHistory,
  normalizedObjectRect,
  objectAtPoint,
  onScreenHistoryReducer,
  parsePersistedOnScreenScene,
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
