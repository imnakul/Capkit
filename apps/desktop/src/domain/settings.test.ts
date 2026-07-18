import { describe, expect, it } from "vitest";
import { defaultShotHubSettings, shotHubSettingsSchema } from "./settings";

describe("ShotHub settings", () => {
  it("accepts the shipped defaults", () => {
    expect(shotHubSettingsSchema.parse(defaultShotHubSettings)).toEqual(defaultShotHubSettings);
  });

  it("rejects capture palettes with more than five colors", () => {
    const result = shotHubSettingsSchema.safeParse({
      ...defaultShotHubSettings,
      palette: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects unsafe annotation sizes", () => {
    const result = shotHubSettingsSchema.safeParse({
      ...defaultShotHubSettings,
      annotation: { ...defaultShotHubSettings.annotation, defaultSize: 25 },
    });

    expect(result.success).toBe(false);
  });
});
