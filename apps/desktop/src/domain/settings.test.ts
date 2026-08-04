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

  it("defaults the on-screen toolbar for older saved preferences", () => {
    const legacy = {
      ...defaultSnaphubSettings,
      shortcuts: {
        capture: "Alt+Shift+S",
        captureAndCopy: "Alt+Shift+C",
        captureAndSave: "Alt+Shift+D",
        captureModeCopy: "C",
        captureModeSave: "S",
      },
      onScreen: undefined,
    };
    const parsed = snaphubSettingsSchema.parse(legacy);

    expect(parsed.shortcuts.onScreenToggle).toBe("Alt+Shift+A");
    expect(parsed.onScreen.toolShortcuts.pencil).toBe("1");
    expect(parsed.onScreen.cursor.style).toBe("ring");
    expect(parsed.onScreen.color).toBe("#d9ff43");
    expect(parsed.onScreen.strokeSize).toBe(4);
    expect(parsed.onScreen.spotlightSize).toBe(180);
    expect(parsed.onScreen.liveDesktop).toBe(true);
    expect(parsed.onScreen.persistDrawings).toBe(false);
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
