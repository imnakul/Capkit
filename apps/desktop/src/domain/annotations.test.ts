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
});

