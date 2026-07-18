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

export const shotHubSettingsSchema = z.object({
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
    rotate: z.boolean(),
    shapes: z.boolean(),
    effects: z.boolean(),
    counter: z.boolean(),
    text: z.boolean(),
    history: z.boolean(),
    shapeDefault: shapeDefaultSchema,
    effectDefault: effectDefaultSchema,
  }),
  shortcuts: z.object({
    capture: z.string().min(1).max(64),
    captureAndCopy: z.string().min(1).max(64),
    captureAndSave: z.string().min(1).max(64),
  }),
  detection: z.object({
    windows: z.boolean(),
    uiRegions: z.boolean(),
  }),
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

export type ShotHubSettings = z.infer<typeof shotHubSettingsSchema>;
export type ShapeDefault = z.infer<typeof shapeDefaultSchema>;
export type EffectDefault = z.infer<typeof effectDefaultSchema>;

export function parseShapeDefault(value: string): ShapeDefault {
  return shapeDefaultSchema.parse(value);
}

export function parseEffectDefault(value: string): EffectDefault {
  return effectDefaultSchema.parse(value);
}

export const defaultShotHubSettings: ShotHubSettings = {
  version: 1,
  palette: ["#d9ff43", "#ff5b4d", "#60a5fa", "#ffffff", "#171717"],
  customColors: [],
  annotation: { defaultColor: "#d9ff43", defaultSize: 4 },
  accentColor: "#d9ff43",
  appearance: "light",
  toolbar: {
    rotate: true,
    shapes: true,
    effects: true,
    counter: true,
    text: true,
    history: true,
    shapeDefault: "rectangle",
    effectDefault: "blur",
  },
  shortcuts: {
    capture: "Alt+Shift+S",
    captureAndCopy: "Alt+Shift+C",
    captureAndSave: "Alt+Shift+D",
  },
  detection: { windows: true, uiRegions: false },
  overlay: { color: "#070807", opacity: 0.64 },
  openAtStartup: false,
  cursor: { enabled: true, style: "crosshair", size: "medium" },
};

const storageKey = "shothub.settings.v1";
const settingsEvent = "shothub://settings-changed";

function readSettings(): ShotHubSettings {
  const raw = window.localStorage.getItem(storageKey);
  if (raw === null) return defaultShotHubSettings;
  try {
    const value: unknown = JSON.parse(raw);
    const parsed = shotHubSettingsSchema.safeParse(value);
    return parsed.success ? parsed.data : defaultShotHubSettings;
  } catch {
    return defaultShotHubSettings;
  }
}

let cachedRaw: string | null = null;
let cachedSettings = defaultShotHubSettings;

function getSnapshot(): ShotHubSettings {
  const raw = window.localStorage.getItem(storageKey);
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

export function saveShotHubSettings(settings: ShotHubSettings): void {
  const validated = shotHubSettingsSchema.parse(settings);
  window.localStorage.setItem(storageKey, JSON.stringify(validated));
  cachedRaw = null;
  window.dispatchEvent(new Event(settingsEvent));
}

export function useShotHubSettings(): {
  settings: ShotHubSettings;
  updateSettings: (next: ShotHubSettings) => void;
} {
  const settings = useSyncExternalStore(subscribe, getSnapshot, () => defaultShotHubSettings);
  const updateSettings = useCallback((next: ShotHubSettings): void => {
    saveShotHubSettings(next);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.appearance === "dark");
    document.documentElement.style.setProperty("--shothub-accent", settings.accentColor);
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
