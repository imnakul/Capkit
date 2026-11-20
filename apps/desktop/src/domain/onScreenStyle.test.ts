import { describe, expect, it } from "vitest";
import {
  findEditableObjectAt,
  LEGACY_ON_SCREEN_CORNER_RADIUS,
  onScreenGeometryInput,
  onScreenObjectSchema,
  parsePersistedOnScreenScene,
  type OnScreenShapeObject,
} from "./onScreen";
import { shapeStrokeGeometry } from "./strokeGeometry";

const legacyRectangle = {
  id: "r1",
  kind: "rectangle",
  color: "#d9ff43",
  size: 4,
  start: { x: 10, y: 10 },
  end: { x: 110, y: 70 },
};

describe("Screen Draw line styles", () => {
  it("parses scenes saved before line styles existed", () => {
    const scene = parsePersistedOnScreenScene(JSON.stringify([legacyRectangle]));
    expect(scene).toHaveLength(1);
    expect(scene[0]).not.toHaveProperty("strokeStyle");
  });

  it("round-trips style, seed and corner radius", () => {
    const parsed = onScreenObjectSchema.parse({ ...legacyRectangle, strokeStyle: "sketchy", seed: 42, cornerRadius: 12 });
    expect(parsed).toMatchObject({ strokeStyle: "sketchy", seed: 42, cornerRadius: 12 });
  });

  it("rejects unknown styles and out-of-range radii", () => {
    expect(onScreenObjectSchema.safeParse({ ...legacyRectangle, strokeStyle: "wavy" }).success).toBe(false);
    expect(onScreenObjectSchema.safeParse({ ...legacyRectangle, cornerRadius: 99 }).success).toBe(false);
  });

  it("old rectangles keep their 3 px corner", () => {
    const object = onScreenObjectSchema.parse(legacyRectangle) as OnScreenShapeObject;
    const input = onScreenGeometryInput(object);
    expect(input).toMatchObject({ kind: "rectangle", cornerRadius: LEGACY_ON_SCREEN_CORNER_RADIUS });
  });

  it("produces the same geometry as a capture rectangle with the same inputs", () => {
    const object: OnScreenShapeObject = { ...legacyRectangle, kind: "rectangle", strokeStyle: "sketchy", seed: 9, cornerRadius: 0 };
    const screenInput = onScreenGeometryInput(object);
    if (screenInput === null) throw new Error("expected geometry input");
    const capture = shapeStrokeGeometry({
      kind: "rectangle",
      bounds: { x: 10, y: 10, width: 100, height: 60 },
      strokeWidth: 4,
      strokeStyle: "sketchy",
      seed: 9,
    });
    expect(shapeStrokeGeometry(screenInput)).toEqual(capture);
  });

  it("blur has no outline geometry", () => {
    expect(onScreenGeometryInput({ ...legacyRectangle, kind: "blur" })).toBeNull();
  });

  it("finds a shape by its outline only, so drawing inside it still works", () => {
    const shape = onScreenObjectSchema.parse(legacyRectangle);
    expect(findEditableObjectAt([shape], { x: 10, y: 40 })?.id).toBe("r1");
    expect(findEditableObjectAt([shape], { x: 60, y: 40 })).toBeNull();
    expect(findEditableObjectAt([shape], { x: -500, y: -500 })).toBeNull();
  });
});
