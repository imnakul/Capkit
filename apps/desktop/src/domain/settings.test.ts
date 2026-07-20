import { describe, expect, it } from "vitest";
import { defaultSnaphubSettings, snaphubSettingsSchema } from "./settings";

describe("Snaphub settings", () => {
  it("accepts the shipped defaults", () => {
    expect(snaphubSettingsSchema.parse(defaultSnaphubSettings)).toEqual(defaultSnaphubSettings);
  });

  it("rejects capture palettes with more than five colors", () => {
    const result = snaphubSettingsSchema.safeParse({
      ...defaultSnaphubSettings,
      palette: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects unsafe annotation sizes", () => {
    const result = snaphubSettingsSchema.safeParse({
      ...defaultSnaphubSettings,
      annotation: { ...defaultSnaphubSettings.annotation, defaultSize: 25 },
    });

    expect(result.success).toBe(false);
  });

  it("migrates saved toolbar preferences from the earlier grouped-family model", () => {
    const legacyToolbar = {
      shapes: true,
      effects: true,
      counter: true,
      text: true,
      history: true,
      shapeDefault: "rectangle" as const,
      effectDefault: "blur" as const,
    };
    const parsed = snaphubSettingsSchema.parse({ ...defaultSnaphubSettings, toolbar: legacyToolbar });

    expect(parsed.toolbar.mode).toBe("group");
    expect(parsed.toolbar.groups).toHaveLength(5);
    expect(parsed.toolbar.individual.pencil).toBe(true);
  });
});
