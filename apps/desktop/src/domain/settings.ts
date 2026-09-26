import { useCallback, useEffect, useSyncExternalStore } from "react";
import { z } from "zod";

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const shapeDefaultSchema = z.enum([
  "rectangle",
  "ellipse",
  "line",
  "arrow",
  "curved-arrow",
  "highlighter",
]);
const effectDefaultSchema = z.enum(["blur", "spotlight", "pixelate", "blackout"]);
const onScreenCursorStyleSchema = z.enum(["ring", "laser", "precision", "crosshair"]);
const onScreenToolShortcutSchema = z.string().regex(/^[0-9]?$/);
const captureModeShortcutSchema = z.string().regex(/^[A-Z0-9]$/);

export const onScreenToolIds = [
  "select",
  "pencil",
  "rectangle",
  "ellipse",
  "arrow",
  "text",
  "spotlight",
  "magnifier",
  "pointer",
  "eraser",
  "blur",
] as const;

const onScreenToolShortcutSettingsSchema = z.object({
  pencil: onScreenToolShortcutSchema,
  rectangle: onScreenToolShortcutSchema,
  ellipse: onScreenToolShortcutSchema,
  arrow: onScreenToolShortcutSchema,
  text: onScreenToolShortcutSchema,
  spotlight: onScreenToolShortcutSchema,
  magnifier: onScreenToolShortcutSchema,
  pointer: onScreenToolShortcutSchema,
  eraser: onScreenToolShortcutSchema,
  blur: onScreenToolShortcutSchema,
});

export const defaultOnScreenSettings = {
  color: "#d9ff43",
  strokeSize: 4,
  spotlightSize: 180,
  liveDesktop: true,
  persistDrawings: false,
  toolShortcuts: {
    pencil: "1",
    rectangle: "2",
    ellipse: "3",
    arrow: "4",
    text: "5",
    spotlight: "6",
    magnifier: "7",
    pointer: "8",
    eraser: "9",
    blur: "0",
  },
  cursor: {
    style: "ring",
    size: "medium",
  },
} as const;

export const captureToolbarToolIds = [
  "rectangle",
  "ellipse",
  "line",
  "arrow",
  "curved-arrow",
  "highlighter",
  "pencil",
  "text",
  "blur",
  "spotlight",
  "pixelate",
  "blackout",
  "counter",
  "scrolling-capture",
  "undo",
  "redo",
] as const;

const captureToolbarToolIdSchema = z.enum(captureToolbarToolIds);
export type CaptureToolbarToolId = z.infer<typeof captureToolbarToolIdSchema>;

export const defaultToolbarIndividual: Record<CaptureToolbarToolId, boolean> = {
  rectangle: true,
  ellipse: true,
  line: true,
  arrow: true,
  "curved-arrow": true,
  highlighter: true,
  pencil: true,
  text: true,
  blur: true,
  spotlight: true,
  pixelate: true,
  blackout: true,
  counter: true,
  "scrolling-capture": true,
  undo: true,
  redo: true,
};

export const defaultToolbarGroups: CaptureToolbarToolId[][] = [
  ["rectangle", "ellipse", "line", "arrow", "curved-arrow"],
  ["highlighter", "pencil", "text"],
  ["blur", "spotlight", "pixelate", "blackout"],
  ["counter", "scrolling-capture"],
  ["undo", "redo"],
];

const toolbarIndividualSchema = z.object({
  rectangle: z.boolean(),
  ellipse: z.boolean(),
  line: z.boolean(),
  arrow: z.boolean(),
  "curved-arrow": z.boolean(),
  highlighter: z.boolean(),
  pencil: z.boolean(),
  text: z.boolean(),
  blur: z.boolean(),
  spotlight: z.boolean(),
  pixelate: z.boolean(),
  blackout: z.boolean(),
  counter: z.boolean(),
  "scrolling-capture": z.boolean(),
  undo: z.boolean(),
  redo: z.boolean(),
});

export const snaphubSettingsSchema = z.object({
  version: z.literal(1),
  palette: z.array(hexColorSchema).min(1).max(5),
  customColors: z.array(hexColorSchema).max(24),
  annotation: z.object({
    defaultColor: hexColorSchema,
    defaultSize: z.number().int().min(1).max(24),
  }),
  accentColor: hexColorSchema,
  appearance: z.enum(["light", "dark"]).default("light"),
  toolbar: z.object({
    shapes: z.boolean(),
    effects: z.boolean(),
    counter: z.boolean(),
    text: z.boolean(),
    history: z.boolean(),
    shapeDefault: shapeDefaultSchema,
    effectDefault: effectDefaultSchema,
    mode: z.enum(["individual", "group"]).default("group"),
    individual: toolbarIndividualSchema.default(defaultToolbarIndividual),
    groups: z.array(z.array(captureToolbarToolIdSchema).max(16)).max(8).default(defaultToolbarGroups),
  }),
  shortcuts: z.object({
    capture: z.string().min(1).max(64),
    captureAndCopy: z.string().min(1).max(64),
    captureAndSave: z.string().min(1).max(64),
    onScreenToggle: z.string().min(1).max(64).default("Alt+Shift+A"),
    recordToggle: z.string().min(1).max(64).default("Alt+Shift+R"),
    captureModeCopy: captureModeShortcutSchema.default("C"),
    captureModeSave: captureModeShortcutSchema.default("S"),
    captureModeCopyAndSave: captureModeShortcutSchema.default("A"),
  }),
  onScreen: z.object({
    color: hexColorSchema.default(defaultOnScreenSettings.color),
    strokeSize: z.number().int().min(1).max(24).default(defaultOnScreenSettings.strokeSize),
    spotlightSize: z.number().int().min(80).max(360).default(defaultOnScreenSettings.spotlightSize),
    liveDesktop: z.boolean().default(defaultOnScreenSettings.liveDesktop),
    persistDrawings: z.boolean().default(defaultOnScreenSettings.persistDrawings),
    toolShortcuts: onScreenToolShortcutSettingsSchema,
    cursor: z.object({
      style: onScreenCursorStyleSchema,
      size: z.enum(["small", "medium", "large"]),
    }),
  }).default(defaultOnScreenSettings),
  detection: z.object({
    windows: z.boolean(),
    uiRegions: z.boolean(),
  }),
  scrolling: z.object({
    defaultMode: z.enum(["automatic", "manual", "choose"]),
  }).default({ defaultMode: "automatic" }),
  overlay: z.object({
    color: hexColorSchema,
    opacity: z.number().min(0.15).max(0.85),
  }),
  openAtStartup: z.boolean(),
  cursor: z.object({
    enabled: z.boolean(),
    style: z.enum(["crosshair", "target", "precision"]),
    size: z.enum(["small", "medium", "large"]),
  }),
}).superRefine((settings, context) => {
  const labels = {
    captureModeCopy: "Copy selection",
    captureModeSave: "Save selection",
    captureModeCopyAndSave: "Copy & Save selection",
  } as const;
  const assigned = new Map<string, (typeof labels)[keyof typeof labels]>();
  for (const field of Object.keys(labels) as (keyof typeof labels)[]) {
    const value = settings.shortcuts[field];
    const normalized = value.toUpperCase();
    const conflict = assigned.get(normalized);
    if (conflict !== undefined) {
      context.addIssue({
        code: "custom",
        message: `That key is already used by ${conflict}. Choose another key.`,
        path: ["shortcuts", field],
      });
    } else {
      assigned.set(normalized, labels[field]);
    }
  }
});

export type SnaphubSettings = z.infer<typeof snaphubSettingsSchema>;
export type ShapeDefault = z.infer<typeof shapeDefaultSchema>;
export type EffectDefault = z.infer<typeof effectDefaultSchema>;
export type OnScreenToolId = typeof onScreenToolIds[number];
export type OnScreenDrawingToolId = Exclude<OnScreenToolId, "select">;
export type OnScreenToolShortcuts = Record<OnScreenDrawingToolId, string>;

export function parseShapeDefault(value: string): ShapeDefault {
  return shapeDefaultSchema.parse(value);
}

export function parseEffectDefault(value: string): EffectDefault {
  return effectDefaultSchema.parse(value);
}

export const defaultSnaphubSettings: SnaphubSettings = {
  version: 1,
  palette: ["#d9ff43", "#ff5b4d", "#60a5fa", "#ffffff", "#171717"],
  customColors: [],
  annotation: { defaultColor: "#d9ff43", defaultSize: 4 },
  accentColor: "#d9ff43",
  appearance: "light",
  toolbar: {
    shapes: true,
    effects: true,
    counter: true,
    text: true,
    history: true,
    shapeDefault: "rectangle",
    effectDefault: "blur",
    mode: "group",
    individual: defaultToolbarIndividual,
    groups: defaultToolbarGroups,
  },
  shortcuts: {
    capture: "Alt+Shift+S",
    captureAndCopy: "Alt+Shift+C",
    captureAndSave: "Alt+Shift+D",
    onScreenToggle: "Alt+Shift+A",
    recordToggle: "Alt+Shift+R",
    captureModeCopy: "C",
    captureModeSave: "S",
    captureModeCopyAndSave: "A",
  },
  onScreen: defaultOnScreenSettings,
  detection: { windows: true, uiRegions: false },
  scrolling: { defaultMode: "automatic" },
  overlay: { color: "#070807", opacity: 0.64 },
  openAtStartup: false,
  cursor: { enabled: true, style: "crosshair", size: "medium" },
};

const storageKey = "snaphub.settings.v1";
// Preserve preferences created before the product rename without retaining the former brand in UI.
const legacyStorageKey = ["shot", "hub.settings.v1"].join("");
const settingsEvent = "snaphub://settings-changed";

type CaptureModeShortcutField =
  | "captureModeCopy"
  | "captureModeSave"
  | "captureModeCopyAndSave";

const captureModeShortcutFields: readonly CaptureModeShortcutField[] = [
  "captureModeCopy",
  "captureModeSave",
  "captureModeCopyAndSave",
];

const captureModeShortcutFallbacks = [
  "C",
  "S",
  "A",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(""),
] as const;

export function captureModeShortcutConflict(
  field: CaptureModeShortcutField,
  value: string,
  settings: SnaphubSettings,
): string | null {
  if (!/^[A-Z0-9]$/.test(value)) return null;
  const labels: Record<CaptureModeShortcutField, string> = {
    captureModeCopy: "Copy selection",
    captureModeSave: "Save selection",
    captureModeCopyAndSave: "Copy & Save selection",
  };
  for (const candidate of captureModeShortcutFields) {
    if (
      candidate !== field
      && settings.shortcuts[candidate].toUpperCase() === value.toUpperCase()
    ) {
      return `That key is already used by ${labels[candidate]}. Choose another key.`;
    }
  }
  return null;
}

export function parsePersistedSnaphubSettings(value: unknown): SnaphubSettings | null {
  const migrated = migratePersistedCaptureModeShortcuts(value);
  const parsed = snaphubSettingsSchema.safeParse(migrated);
  return parsed.success ? parsed.data : null;
}

function readSettings(): SnaphubSettings {
  const raw = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(legacyStorageKey);
  if (raw === null) return defaultSnaphubSettings;
  try {
    return parsePersistedSnaphubSettings(JSON.parse(raw)) ?? defaultSnaphubSettings;
  } catch {
    return defaultSnaphubSettings;
  }
}

function migratePersistedCaptureModeShortcuts(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const persistedShortcuts = isRecord(value.shortcuts) ? value.shortcuts : {};
  const candidates: Partial<Record<CaptureModeShortcutField, string>> = {};
  const used = new Set<string>();

  for (const field of captureModeShortcutFields) {
    const persistedValue = persistedShortcuts[field];
    if (typeof persistedValue !== "string" || !/^[A-Za-z0-9]$/.test(persistedValue)) continue;
    const normalized = persistedValue.toUpperCase();
    if (used.has(normalized)) continue;
    candidates[field] = normalized;
    used.add(normalized);
  }

  for (const field of captureModeShortcutFields) {
    if (candidates[field] !== undefined) continue;
    const replacement = captureModeShortcutFallbacks.find((key) => !used.has(key));
    if (replacement === undefined) return value;
    candidates[field] = replacement;
    used.add(replacement);
  }
  const captureModeCopy = candidates.captureModeCopy;
  const captureModeSave = candidates.captureModeSave;
  const captureModeCopyAndSave = candidates.captureModeCopyAndSave;
  if (
    captureModeCopy === undefined
    || captureModeSave === undefined
    || captureModeCopyAndSave === undefined
  ) return value;

  return {
    ...value,
    shortcuts: {
      ...persistedShortcuts,
      captureModeCopy,
      captureModeSave,
      captureModeCopyAndSave,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

let cachedRaw: string | null = null;
let cachedSettings = defaultSnaphubSettings;

function getSnapshot(): SnaphubSettings {
  const raw = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(legacyStorageKey);
  if (raw === cachedRaw) return cachedSettings;
  cachedRaw = raw;
  cachedSettings = readSettings();
  return cachedSettings;
}

function subscribe(onStoreChange: () => void): () => void {
  function handleChange(): void {
    cachedRaw = null;
    onStoreChange();
  }
  window.addEventListener("storage", handleChange);
  window.addEventListener(settingsEvent, handleChange);
  return (): void => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(settingsEvent, handleChange);
  };
}

export function saveSnaphubSettings(settings: SnaphubSettings): void {
  const validated = snaphubSettingsSchema.parse(settings);
  window.localStorage.setItem(storageKey, JSON.stringify(validated));
  window.localStorage.removeItem(legacyStorageKey);
  cachedRaw = null;
  window.dispatchEvent(new Event(settingsEvent));
}

export function useSnaphubSettings(): {
  settings: SnaphubSettings;
  updateSettings: (next: SnaphubSettings) => void;
} {
  const settings = useSyncExternalStore(subscribe, getSnapshot, () => defaultSnaphubSettings);
  const updateSettings = useCallback((next: SnaphubSettings): void => {
    saveSnaphubSettings(next);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.appearance === "dark");
    document.documentElement.style.setProperty("--snaphub-accent", settings.accentColor);
    document.documentElement.style.setProperty(
      "--capture-overlay",
      hexToRgba(settings.overlay.color, settings.overlay.opacity),
    );
  }, [
    settings.accentColor,
    settings.appearance,
    settings.overlay.color,
    settings.overlay.opacity,
  ]);

  return { settings, updateSettings };
}

function hexToRgba(color: string, opacity: number): string {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `rgb(${String(red)} ${String(green)} ${String(blue)} / ${String(opacity)})`;
}
