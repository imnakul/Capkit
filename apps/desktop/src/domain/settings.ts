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
    captureModeCopy: z.string().min(1).max(16).default("C"),
    captureModeSave: z.string().min(1).max(16).default("S"),
  }),
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
});

export type SnaphubSettings = z.infer<typeof snaphubSettingsSchema>;
export type ShapeDefault = z.infer<typeof shapeDefaultSchema>;
export type EffectDefault = z.infer<typeof effectDefaultSchema>;

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
    captureModeCopy: "C",
    captureModeSave: "S",
  },
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

function readSettings(): SnaphubSettings {
  const raw = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(legacyStorageKey);
  if (raw === null) return defaultSnaphubSettings;
  try {
    const value: unknown = JSON.parse(raw);
    const parsed = snaphubSettingsSchema.safeParse(value);
    return parsed.success ? parsed.data : defaultSnaphubSettings;
  } catch {
    return defaultSnaphubSettings;
  }
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
