import { describe, expect, it } from "vitest";
import type { AnnotationScene } from "./annotations";
import { sceneForExport } from "./annotationExport";

const scene: AnnotationScene = {
  version: 1,
  elements: [
    { id: "a", kind: "rectangle", opacity: 1, bounds: { x: 0, y: 0, width: 50, height: 40 }, color: "#fff", fill: "transparent", strokeWidth: 3 },
    { id: "b", kind: "rectangle", opacity: 1, bounds: { x: 0, y: 0, width: 50, height: 40 }, color: "#fff", fill: "transparent", strokeWidth: 3, strokeStyle: "dashed" },
    { id: "c", kind: "rectangle", opacity: 1, bounds: { x: 0, y: 0, width: 50, height: 40 }, color: "#fff", fill: "transparent", strokeWidth: 3, cornerRadius: 8 },
    { id: "d", kind: "pencil", opacity: 1, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], color: "#fff", strokeWidth: 3 },
    { id: "e", kind: "text", opacity: 1, position: { x: 1, y: 1 }, text: "hi", color: "#fff", fontFamily: "Caveat Variable", fontSize: 20 },
  ],
};

describe("sceneForExport", () => {
  it("adds geometry only to styled or rounded shapes", () => {
    const exported = sceneForExport(scene).elements;
    expect(exported.map((element) => "strokeGeometry" in element)).toEqual([false, true, true, false, false]);
  });

  it("serialises to JSON the Rust side can read, with numeric points", () => {
    const round = JSON.parse(JSON.stringify(sceneForExport(scene))) as {
      elements: { strokeGeometry?: { strokes: { x: number; y: number }[][]; dots: unknown[]; fill?: unknown[] } }[];
    };
    const geometry = round.elements[1]?.strokeGeometry;
    expect(geometry?.strokes.length).toBeGreaterThan(0);
    expect(geometry?.dots).toEqual([]);
    expect(typeof geometry?.strokes[0]?.[0]?.x).toBe("number");
  });
});
