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
});
