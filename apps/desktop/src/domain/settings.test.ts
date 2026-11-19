import { describe, expect, it } from "vitest";
import {
  defaultSnaphubSettings,
  parsePersistedSnaphubSettings,
  snaphubSettingsSchema,
  migratePersistedNoteTool,
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

describe("overlay motion", () => {
  it("drops the motion choice saved by older versions", () => {
    const parsed = snaphubSettingsSchema.parse({
      ...defaultSnaphubSettings,
      overlay: { color: "#070807", opacity: 0.5, motion: "dim-rise" },
    });
    expect(parsed.overlay).toEqual({ color: "#070807", opacity: 0.5 });
  });
});

describe("toolbar placement", () => {
  it("gives older settings every finishing action, enabled in the vertical toolbar", () => {
    const olderToolbar = Object.fromEntries(
      Object.entries(defaultSnaphubSettings.toolbar).filter(([key]) => key !== "actions" && key !== "verticalTools"),
    );
    const parsed = snaphubSettingsSchema.parse({ ...defaultSnaphubSettings, toolbar: olderToolbar });
    expect(parsed.toolbar.verticalTools).toEqual([]);
    expect(Object.values(parsed.toolbar.actions)).toHaveLength(10);
    expect(Object.entries(parsed.toolbar.actions).every(([id, action]) => action.enabled && action.placement === (id.startsWith("note-") ? "horizontal" : "vertical"))).toBe(true);
  });

  it("fills in an action added after the settings were saved", () => {
    const withoutPin = Object.fromEntries(Object.entries(defaultSnaphubSettings.toolbar.actions).filter(([key]) => key !== "pin"));
    const parsed = snaphubSettingsSchema.parse({
      ...defaultSnaphubSettings,
      toolbar: { ...defaultSnaphubSettings.toolbar, actions: { ...withoutPin, save: { enabled: false, placement: "horizontal" } } },
    });
    expect(parsed.toolbar.actions.pin).toEqual({ enabled: true, placement: "vertical" });
    expect(parsed.toolbar.actions.save).toEqual({ enabled: false, placement: "horizontal" });
  });

  it("rejects an unknown placement or tool", () => {
    expect(snaphubSettingsSchema.safeParse({
      ...defaultSnaphubSettings,
      toolbar: { ...defaultSnaphubSettings.toolbar, actions: { ...defaultSnaphubSettings.toolbar.actions, copy: { enabled: true, placement: "diagonal" } } },
    }).success).toBe(false);
    expect(snaphubSettingsSchema.safeParse({
      ...defaultSnaphubSettings,
      toolbar: { ...defaultSnaphubSettings.toolbar, verticalTools: ["laser"] },
    }).success).toBe(false);
  });

  it("adds Note once after Counter to toolbars saved before Note existed", () => {
    const individual = Object.fromEntries(Object.entries(defaultSnaphubSettings.toolbar.individual).filter(([id]) => id !== "note"));
    const old = {
      ...defaultSnaphubSettings,
      toolbar: { ...defaultSnaphubSettings.toolbar, individual, groups: [["text", "counter", "blur"], ["undo"]], verticalTools: ["counter"] },
    };
    const parsed = parsePersistedSnaphubSettings(old);
    expect(parsed?.toolbar.groups).toEqual([["text", "counter", "note", "blur"], ["undo"]]);
    expect(parsed?.toolbar.verticalTools).toEqual(["counter", "note"]);
    expect(parsed?.toolbar.individual.note).toBe(true);
  });

  it("leaves a toolbar alone once it has saved a Note choice", () => {
    const saved = {
      ...defaultSnaphubSettings,
      toolbar: { ...defaultSnaphubSettings.toolbar, individual: { ...defaultSnaphubSettings.toolbar.individual, note: false }, groups: [["text", "counter"]] },
    };
    expect(migratePersistedNoteTool(saved)).toBe(saved);
    expect(parsePersistedSnaphubSettings(saved)?.toolbar.groups).toEqual([["text", "counter"]]);
  });
});
