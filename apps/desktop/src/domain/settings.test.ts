import { describe, expect, it } from "vitest";
import {
  defaultSnaphubSettings,
  parsePersistedSnaphubSettings,
  snaphubSettingsSchema,
} from "./settings";

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

  it("defaults Copy & Save to A for persisted settings without the field", () => {
    const shortcuts = {
      capture: "Alt+Shift+S",
      captureAndCopy: "Alt+Shift+C",
      captureAndSave: "Alt+Shift+D",
      onScreenToggle: "Alt+Shift+A",
      recordToggle: "Alt+Shift+R",
      captureModeCopy: "C",
      captureModeSave: "S",
    };
    const parsed = parsePersistedSnaphubSettings({
      ...defaultSnaphubSettings,
      shortcuts,
    });

    expect(parsed?.shortcuts.captureModeCopyAndSave).toBe("A");
  });

  it("repairs invalid and duplicate persisted completion keys deterministically", () => {
    const parsed = parsePersistedSnaphubSettings({
      ...defaultSnaphubSettings,
      shortcuts: {
        ...defaultSnaphubSettings.shortcuts,
        captureModeCopy: "z",
        captureModeSave: "Z",
        captureModeCopyAndSave: "Enter",
      },
    });

    expect(parsed?.shortcuts).toMatchObject({
      captureModeCopy: "Z",
      captureModeSave: "C",
      captureModeCopyAndSave: "S",
    });
  });

  it.each([
    {
      persisted: { copy: "Enter", save: "C", copyAndSave: null },
      expected: { copy: "S", save: "C", copyAndSave: "A" },
    },
    {
      persisted: { copy: "c", save: "s", copyAndSave: null },
      expected: { copy: "C", save: "S", copyAndSave: "A" },
    },
    {
      persisted: { copy: "A", save: "S", copyAndSave: null },
      expected: { copy: "A", save: "S", copyAndSave: "C" },
    },
    {
      persisted: { copy: "X", save: "X", copyAndSave: "X" },
      expected: { copy: "X", save: "C", copyAndSave: "S" },
    },
    {
      persisted: { copy: "Ctrl+S", save: null, copyAndSave: null },
      expected: { copy: "C", save: "S", copyAndSave: "A" },
    },
    {
      persisted: { copy: null, save: null, copyAndSave: null },
      expected: { copy: "C", save: "S", copyAndSave: "A" },
    },
  ])("repairs persisted completion keys: %#", ({ persisted, expected }) => {
    const parsed = parsePersistedSnaphubSettings({
      ...defaultSnaphubSettings,
      shortcuts: {
        capture: defaultSnaphubSettings.shortcuts.capture,
        captureAndCopy: defaultSnaphubSettings.shortcuts.captureAndCopy,
        captureAndSave: defaultSnaphubSettings.shortcuts.captureAndSave,
        onScreenToggle: defaultSnaphubSettings.shortcuts.onScreenToggle,
        recordToggle: defaultSnaphubSettings.shortcuts.recordToggle,
        ...(persisted.copy === null ? {} : { captureModeCopy: persisted.copy }),
        ...(persisted.save === null ? {} : { captureModeSave: persisted.save }),
        ...(persisted.copyAndSave === null
          ? {}
          : { captureModeCopyAndSave: persisted.copyAndSave }),
      },
    });

    expect(parsed?.shortcuts).toMatchObject({
      captureModeCopy: expected.copy,
      captureModeSave: expected.save,
      captureModeCopyAndSave: expected.copyAndSave,
    });
  });

  it.each([
    ["captureModeCopy", "A", "captureModeCopyAndSave"],
    ["captureModeSave", "a", "captureModeCopy"],
    ["captureModeCopyAndSave", "s", "captureModeSave"],
  ] as const)("rejects a programmatic %s collision", (field, value, conflict) => {
    const result = snaphubSettingsSchema.safeParse({
      ...defaultSnaphubSettings,
      shortcuts: {
        ...defaultSnaphubSettings.shortcuts,
        [field]: value,
        [conflict]: value.toUpperCase(),
      },
    });

    expect(result.success).toBe(false);
  });

  it.each(["Enter", "Escape", "A+A", " ", "a"])("rejects invalid completion key %j", (value) => {
    const result = snaphubSettingsSchema.safeParse({
      ...defaultSnaphubSettings,
      shortcuts: {
        ...defaultSnaphubSettings.shortcuts,
        captureModeCopyAndSave: value,
      },
    });

    expect(result.success).toBe(false);
  });
});
