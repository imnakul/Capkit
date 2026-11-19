import { describe, expect, it } from "vitest";
import { initialSceneHistory, sceneHistoryReducer } from "./annotations";

describe("sceneHistoryReducer", () => {
  it("supports add, undo, and redo without mutating the source scene", () => {
    const annotation = {
      id: "line-1",
      kind: "line" as const,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      color: "#fff",
      strokeWidth: 2,
      opacity: 1,
    };
    const added = sceneHistoryReducer(initialSceneHistory, { type: "add", annotation });
    const undone = sceneHistoryReducer(added, { type: "undo" });
    const redone = sceneHistoryReducer(undone, { type: "redo" });

    expect(initialSceneHistory.present.elements).toHaveLength(0);
    expect(added.present.elements).toHaveLength(1);
    expect(undone.present.elements).toHaveLength(0);
    expect(redone.present.elements).toEqual([annotation]);
  });

  it("updates and deletes one annotation while keeping both actions undoable", () => {
    const annotation = {
      id: "text-1",
      kind: "text" as const,
      position: { x: 12, y: 20 },
      text: "Type something",
      color: "#d9ff43",
      fontFamily: "Caveat Variable",
      fontSize: 24,
      opacity: 1,
    };
    const added = sceneHistoryReducer(initialSceneHistory, { type: "add", annotation });
    const updatedAnnotation = { ...annotation, text: "A clear note" };
    const updated = sceneHistoryReducer(added, { type: "update", annotation: updatedAnnotation });
    const deleted = sceneHistoryReducer(updated, { type: "delete", annotationId: annotation.id });

    expect(updated.present.elements).toEqual([updatedAnnotation]);
    expect(deleted.present.elements).toHaveLength(0);
    expect(sceneHistoryReducer(deleted, { type: "undo" }).present.elements).toEqual([updatedAnnotation]);
  });

  it("shifts every undo step so drawings stay on screen when the capture area moves", () => {
    const line = {
      id: "line-1",
      kind: "line" as const,
      points: [{ x: 10, y: 10 }, { x: 30, y: 20 }],
      color: "#fff",
      strokeWidth: 2,
      opacity: 1,
    };
    const added = sceneHistoryReducer(initialSceneHistory, { type: "add", annotation: line });
    const moved = sceneHistoryReducer(added, { type: "update", annotation: { ...line, points: [{ x: 15, y: 10 }, { x: 35, y: 20 }] } });
    // The capture area grew 40 px to the left, so drawings move 40 px right inside it.
    const shifted = sceneHistoryReducer(moved, { type: "shift", dx: 40, dy: 0 });
    expect(shifted.present.elements[0]).toMatchObject({ points: [{ x: 55, y: 10 }, { x: 75, y: 20 }] });
    const undone = sceneHistoryReducer(shifted, { type: "undo" });
    expect(undone.present.elements[0]).toMatchObject({ points: [{ x: 50, y: 10 }, { x: 70, y: 20 }] });
    const redone = sceneHistoryReducer(undone, { type: "redo" });
    expect(redone.present.elements[0]).toMatchObject({ points: [{ x: 55, y: 10 }, { x: 75, y: 20 }] });
  });

  it("keeps the same state for a zero shift", () => {
    expect(sceneHistoryReducer(initialSceneHistory, { type: "shift", dx: 0, dy: 0 })).toBe(initialSceneHistory);
  });
});
