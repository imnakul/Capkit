import { describe, expect, it } from "vitest";
import {
  cameraLayoutSchema,
  cameraRect,
  defaultCameraLayout,
  type CameraLayout,
} from "./videoScene";

const stage = { width: 1280, height: 720 };

function layout(next?: Partial<CameraLayout>): CameraLayout {
  return { ...defaultCameraLayout, ...next };
}

describe("cameraRect", () => {
  it("places the bubble at a free position as stage fractions", () => {
    const rect = cameraRect(layout({ position: { x: 0.5, y: 0.25 } }), stage);
    expect(rect.x).toBeCloseTo(640);
    expect(rect.y).toBeCloseTo(180);
  });

  it("clamps a free position inside the stage", () => {
    const rect = cameraRect(layout({ position: { x: 2, y: -1 } }), stage);
    expect(rect.x + rect.width).toBeLessThanOrEqual(stage.width);
    expect(rect.y).toBeGreaterThanOrEqual(0);
  });

  it("uses the corner when no free position is set", () => {
    const rect = cameraRect(layout({ corner: "top-left", position: null }), stage);
    expect(rect.x).toBe(defaultCameraLayout.margin);
    expect(rect.y).toBe(defaultCameraLayout.margin);
  });

  it("parses an old scene without a position", () => {
    const legacy = JSON.parse(JSON.stringify(defaultCameraLayout)) as Record<string, unknown>;
    delete legacy.position;
    const parsed = cameraLayoutSchema.parse(legacy);
    expect(parsed.position).toBeNull();
  });
});
