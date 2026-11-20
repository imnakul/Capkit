import { describe, expect, it } from "vitest";
import { defaultAnnotationStyle, initialSceneHistory, sceneHistoryReducer, type Annotation, type AnnotationStyle } from "./annotations";
import { changedStyleKeys, restyleAnnotation } from "./restyle";

const rectangle: Annotation = {
  id: "r",
  kind: "rectangle",
  bounds: { x: 0, y: 0, width: 100, height: 60 },
  color: "#ff0000",
  fill: "transparent",
  strokeWidth: 4,
  opacity: 1,
};

function restyle(annotation: Annotation, patch: Partial<AnnotationStyle>): Annotation | null {
  const next = { ...defaultAnnotationStyle, ...patch };
  return restyleAnnotation(annotation, next, changedStyleKeys(defaultAnnotationStyle, next));
}

describe("restyleAnnotation", () => {
  it("recolours a shape and follows a solid fill", () => {
    expect(restyle(rectangle, { color: "#00ff00" })).toMatchObject({ color: "#00ff00", fill: "transparent" });
    expect(restyle({ ...rectangle, fill: "#ff0000" }, { color: "#00ff00" })).toMatchObject({ color: "#00ff00", fill: "#00ff00" });
  });

  it("changes line style with a seed for sketchy and removes the fields for solid", () => {
    const sketchy = restyle(rectangle, { strokeStyle: "sketchy" });
    expect(sketchy).toMatchObject({ strokeStyle: "sketchy" });
    expect(sketchy !== null && "seed" in sketchy && typeof sketchy.seed === "number").toBe(true);
    const back = sketchy === null ? null : restyleAnnotation(sketchy, defaultAnnotationStyle, ["strokeStyle"]);
    expect(back).not.toHaveProperty("strokeStyle");
  });

  it("sets the sketch level only on sketchy shapes", () => {
    expect(restyle(rectangle, { sketchLevel: "wild" })).toBeNull();
    expect(restyle({ ...rectangle, strokeStyle: "sketchy", seed: 3 }, { sketchLevel: "wild" })).toMatchObject({ sketchLevel: "wild", seed: 3 });
  });

  it("applies fill style, corner radius and rectangle-only rules", () => {
    expect(restyle(rectangle, { fillStyle: "hachure" })).toMatchObject({ fillStyle: "hachure", fill: "transparent" });
    expect(restyle(rectangle, { fillStyle: "solid" })).toMatchObject({ fillStyle: "solid", fill: "#ff0000" });
    expect(restyle(rectangle, { cornerRadius: 12 })).toMatchObject({ cornerRadius: 12 });
    expect(restyle({ ...rectangle, kind: "ellipse" }, { cornerRadius: 12 })).toBeNull();
  });

  it("changes text fonts and ignores keys that do not apply", () => {
    const text: Annotation = { id: "t", kind: "text", position: { x: 0, y: 0 }, text: "hi", color: "#fff", fontFamily: "A", fontSize: 24, opacity: 1 };
    expect(restyle(text, { fontFamily: "Inter" })).toMatchObject({ fontFamily: "Inter" });
    expect(restyle(text, { cornerRadius: 9 })).toBeNull();
  });
});

describe("scene history coalescing", () => {
  it("collapses repeated style edits with the same key into one undo step", () => {
    const base = sceneHistoryReducer(initialSceneHistory, { type: "add", annotation: rectangle });
    let state = base;
    for (const radius of [4, 8, 12]) {
      state = sceneHistoryReducer(state, { type: "update", annotation: { ...rectangle, cornerRadius: radius }, coalesceKey: "r:cornerRadius" });
    }
    expect(state.past).toHaveLength(2);
    expect(sceneHistoryReducer(state, { type: "undo" }).present).toBe(base.present);
    const other = sceneHistoryReducer(state, { type: "update", annotation: { ...rectangle, color: "#000" }, coalesceKey: "r:color" });
    expect(other.past).toHaveLength(3);
  });
});
