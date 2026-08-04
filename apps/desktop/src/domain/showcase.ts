import { z } from "zod";

/**
 * Domain model for the Showcase studio.
 *
 * The studio never mutates the source file. Every control below describes a
 * non-destructive scene: image transforms live on the left rail, decoration
 * (background, frame, finish) lives on the right rail, and the whole thing
 * serialises into a single preset object.
 */

/** Image extensions the webview can render straight from the asset protocol. */
export const supportedMediaExtensions = ["png", "jpg", "jpeg", "bmp", "webp", "gif", "avif"] as const;

/** Largest fraction a single crop edge may remove, so at least 10% of each axis survives. */
export const maxCropInset = 0.45;

/** Backend payload for one importable image on disk. */
export const mediaFileSchema = z.object({
  path: z.string().min(1),
  fileName: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  modifiedAt: z.iso.datetime({ offset: true }),
});

export type MediaFile = z.infer<typeof mediaFileSchema>;

/** An image plus the URL the webview can actually render it from. */
export type MediaItem = MediaFile & { readonly url: string };

/** Backend payload for a watched background folder. */
export const mediaFolderSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  images: z.array(mediaFileSchema),
});

export type MediaFolderPayload = z.infer<typeof mediaFolderSchema>;

/** A background folder whose images are resolved to renderable URLs. */
export type MediaFolder = {
  readonly path: string;
  readonly name: string;
  readonly images: readonly MediaItem[];
};

export type Size = { readonly width: number; readonly height: number };

/* -------------------------------------------------------------------------- */
/* Background                                                                  */
/* -------------------------------------------------------------------------- */

export type BackgroundPresetId = "paper" | "midnight" | "citrus" | "ocean" | "sunset" | "wallpaper";

export type BackgroundPreset = {
  readonly id: BackgroundPresetId;
  readonly label: string;
  readonly background: string;
  readonly swatch: string;
};

export const backgroundPresets: readonly BackgroundPreset[] = [
  { id: "paper", label: "Paper", background: "#ecebe5", swatch: "#ecebe5" },
  { id: "midnight", label: "Midnight", background: "#151716", swatch: "#151716" },
  {
    id: "citrus",
    label: "Citrus",
    background: "linear-gradient(135deg,#d9ff43 0%,#f9f5c7 100%)",
    swatch: "linear-gradient(135deg,#d9ff43,#f9f5c7)",
  },
  {
    id: "ocean",
    label: "Ocean",
    background: "linear-gradient(135deg,#8de3ef 0%,#31577a 100%)",
    swatch: "linear-gradient(135deg,#8de3ef,#31577a)",
  },
  {
    id: "sunset",
    label: "Sunset",
    background: "linear-gradient(135deg,#f3a46f 0%,#a76591 100%)",
    swatch: "linear-gradient(135deg,#f3a46f,#a76591)",
  },
  {
    id: "wallpaper",
    label: "Wallpaper",
    background:
      "radial-gradient(circle at 18% 12%,rgb(217 255 67 / 36%),transparent 27%),radial-gradient(circle at 83% 82%,rgb(95 148 130 / 48%),transparent 32%),linear-gradient(135deg,#26352e,#121714 70%)",
    swatch: "radial-gradient(circle at 30% 25%,#d9ff43,transparent 28%),linear-gradient(135deg,#26352e,#121714)",
  },
];

const backgroundPresetIdSchema = z.enum(["paper", "midnight", "citrus", "ocean", "sunset", "wallpaper"]);

export const backgroundSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), id: backgroundPresetIdSchema }),
  z.object({ kind: z.literal("color"), value: z.string().min(1) }),
  z.object({ kind: z.literal("image"), path: z.string().min(1), url: z.string().min(1) }),
  z.object({ kind: z.literal("gradient"), value: z.string().min(1) }),
]);

export type BackgroundSelection = z.infer<typeof backgroundSelectionSchema>;

/**
 * Resolves a background selection into a single CSS `background` shorthand.
 * Falls back to the first preset when an unknown preset id is stored.
 */
export function backgroundValue(selection: BackgroundSelection): string {
  if (selection.kind === "color") return selection.value;
  if (selection.kind === "gradient") return selection.value;
  if (selection.kind === "image") return `url("${selection.url}") center / cover no-repeat`;
  const preset = backgroundPresets.find((item) => item.id === selection.id);
  return preset?.background ?? backgroundPresets.at(0)?.background ?? "#171815";
}

/**
 * True when the selection was derived from the image rather than picked by hand.
 * Auto-generated stages may be replaced silently; hand-picked ones may not.
 */
export function isAutoBackground(selection: BackgroundSelection): boolean {
  return selection.kind === "preset" || selection.kind === "gradient";
}

/* -------------------------------------------------------------------------- */
/* Colour extraction                                                           */
/* -------------------------------------------------------------------------- */

function channelToHex(value: number): string {
  return Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, "0");
}

/** Packs three 0-255 channels into a `#rrggbb` string. */
export function rgbToHex(red: number, green: number, blue: number): string {
  return `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`;
}

/** Parses `#rgb` / `#rrggbb`. Returns `null` for anything else. */
export function hexToRgb(hex: string): { readonly red: number; readonly green: number; readonly blue: number } | null {
  const value = hex.trim().replace("#", "");
  const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    red: Number.parseInt(full.slice(0, 2), 16),
    green: Number.parseInt(full.slice(2, 4), 16),
    blue: Number.parseInt(full.slice(4, 6), 16),
  };
}

/** Renders a hex colour as `rgb(r g b / p%)`, falling back to neutral ink. */
export function withAlpha(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (rgb === null) return `rgb(23 24 21 / ${String(percent)}%)`;
  return `rgb(${String(rgb.red)} ${String(rgb.green)} ${String(rgb.blue)} / ${String(percent)}%)`;
}

/** Blends `hex` toward `target` by `amount` (0-1). */
export function mixHex(hex: string, target: string, amount: number): string {
  const from = hexToRgb(hex);
  const to = hexToRgb(target);
  if (from === null || to === null) return hex;
  const ratio = Math.min(Math.max(amount, 0), 1);
  return rgbToHex(
    from.red + (to.red - from.red) * ratio,
    from.green + (to.green - from.green) * ratio,
    from.blue + (to.blue - from.blue) * ratio,
  );
}

/**
 * Reduces raw RGBA pixels to the most representative colours.
 *
 * Colours are bucketed into a 16-step cube and scored by frequency weighted
 * toward saturation, so a photo's accent survives a mostly-grey histogram.
 */
export function paletteFromPixels(pixels: Uint8ClampedArray, count = 4): readonly string[] {
  const buckets = new Map<number, { red: number; green: number; blue: number; total: number }>();
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if ((pixels[index + 3] ?? 0) < 128) continue;
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, { red, green, blue, total: 1 });
      continue;
    }
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    bucket.total += 1;
  }
  return [...buckets.values()]
    .map((bucket) => {
      const red = bucket.red / bucket.total;
      const green = bucket.green / bucket.total;
      const blue = bucket.blue / bucket.total;
      const peak = Math.max(red, green, blue);
      const saturation = peak === 0 ? 0 : (peak - Math.min(red, green, blue)) / peak;
      return { hex: rgbToHex(red, green, blue), weight: bucket.total * (0.35 + saturation) };
    })
    .sort((first, second) => second.weight - first.weight)
    .slice(0, Math.max(1, count))
    .map((entry) => entry.hex);
}

/**
 * Builds the default stage: a soft two-point spotlight over a deep gradient
 * mixed from the image's own palette, so imports look composed immediately.
 */
export function spotlightGradient(palette: readonly string[]): string {
  const primary = palette.at(0) ?? "#3a4a45";
  const secondary = palette.at(1) ?? primary;
  const accent = palette.at(2) ?? secondary;
  return [
    `radial-gradient(circle at 24% 16%, ${withAlpha(accent, 44)}, transparent 46%)`,
    `radial-gradient(circle at 80% 84%, ${withAlpha(secondary, 34)}, transparent 48%)`,
    "radial-gradient(circle at 50% 38%, rgb(255 255 255 / 9%), transparent 58%)",
    `linear-gradient(135deg, ${mixHex(primary, "#0b0d0c", 0.7)} 0%, ${mixHex(secondary, "#0b0d0c", 0.88)} 100%)`,
  ].join(",");
}

/* -------------------------------------------------------------------------- */
/* Image transform                                                             */
/* -------------------------------------------------------------------------- */

export type QuarterTurns = 0 | 1 | 2 | 3;

export type CropInsets = {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

export type CropEdge = keyof CropInsets;

export type CropRatioId = "free" | "1x1" | "4x3" | "3x2" | "16x9" | "9x16" | "4x5";

export type CropRatio = {
  readonly id: CropRatioId;
  readonly label: string;
  /** `null` keeps whatever the user dragged; a number forces a centred crop. */
  readonly ratio: number | null;
};

export const cropRatios: readonly CropRatio[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "1x1", label: "1:1", ratio: 1 },
  { id: "4x3", label: "4:3", ratio: 4 / 3 },
  { id: "3x2", label: "3:2", ratio: 3 / 2 },
  { id: "16x9", label: "16:9", ratio: 16 / 9 },
  { id: "9x16", label: "9:16", ratio: 9 / 16 },
  { id: "4x5", label: "4:5", ratio: 4 / 5 },
];

export type ImageFilterId = "clean" | "soft" | "mono" | "warm" | "cool";

export type ImageFilterPreset = {
  readonly id: ImageFilterId;
  readonly label: string;
  readonly filter: string;
};

export const imageFilters: readonly ImageFilterPreset[] = [
  { id: "clean", label: "Clean", filter: "" },
  { id: "soft", label: "Soft", filter: "saturate(0.86) contrast(0.96)" },
  { id: "mono", label: "Mono", filter: "grayscale(1) contrast(1.05)" },
  { id: "warm", label: "Warm", filter: "sepia(0.28) saturate(1.18) hue-rotate(-8deg)" },
  { id: "cool", label: "Cool", filter: "saturate(1.08) hue-rotate(12deg) brightness(1.02)" },
];

/* -------------------------------------------------------------------------- */
/* Surface effects (shared by the image and the background)                     */
/* -------------------------------------------------------------------------- */

export const effectSettingsSchema = z.object({
  noise: z.number(),
  texture: z.number(),
  vignette: z.number(),
  spotlight: z.number(),
});

export type EffectSettings = z.infer<typeof effectSettingsSchema>;

export type EffectId = keyof EffectSettings;

export const effectControls: readonly { readonly id: EffectId; readonly label: string; readonly hint: string }[] = [
  { id: "noise", label: "Noise", hint: "Film grain" },
  { id: "texture", label: "Texture", hint: "Woven paper" },
  { id: "vignette", label: "Vignette", hint: "Darkened edges" },
  { id: "spotlight", label: "Spotlight", hint: "Centre glow" },
];

export const defaultEffectSettings: EffectSettings = { noise: 0, texture: 0, vignette: 0, spotlight: 0 };

/** True when at least one effect layer needs rendering. */
export function hasEffects(effects: EffectSettings): boolean {
  return effectControls.some((control) => effects[control.id] > 0);
}

export const cropInsetsSchema = z.object({
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
  left: z.number(),
});

export const imageSettingsSchema = z.object({
  zoom: z.number(),
  offsetX: z.number(),
  offsetY: z.number(),
  quarterTurns: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  straighten: z.number(),
  flipHorizontal: z.boolean(),
  flipVertical: z.boolean(),
  tiltX: z.number(),
  tiltY: z.number(),
  crop: cropInsetsSchema,
  cropRatio: z.enum(["free", "1x1", "4x3", "3x2", "16x9", "9x16", "4x5"]),
  filter: z.enum(["clean", "soft", "mono", "warm", "cool"]),
  brightness: z.number(),
  contrast: z.number(),
  saturation: z.number(),
  effects: effectSettingsSchema,
});

export type ImageSettings = z.infer<typeof imageSettingsSchema>;

export const defaultImageSettings: ImageSettings = {
  zoom: 100,
  offsetX: 0,
  offsetY: 0,
  quarterTurns: 0,
  straighten: 0,
  flipHorizontal: false,
  flipVertical: false,
  tiltX: 0,
  tiltY: 0,
  crop: { top: 0, right: 0, bottom: 0, left: 0 },
  cropRatio: "free",
  filter: "clean",
  brightness: 100,
  contrast: 100,
  saturation: 100,
  effects: defaultEffectSettings,
};

/* -------------------------------------------------------------------------- */
/* Scene, frame, finish                                                        */
/* -------------------------------------------------------------------------- */

/** Export shapes the stage can be locked to, including the social sizes. */
export type StageRatioId = "auto" | "16x9" | "1x1" | "4x3" | "3x2" | "2x1" | "9x16" | "4x5" | "custom";

export type StageRatio = {
  readonly id: StageRatioId;
  readonly label: string;
  readonly hint: string;
  /** `null` means the shape is not fixed by the preset itself. */
  readonly ratio: number | null;
  /**
   * Output settings that go with this shape.
   *
   * Choosing "YouTube thumbnail" is a decision about the *destination*, not
   * just the crop, so the scale and format travel with it instead of being two
   * more things to remember.
   */
  readonly scale?: 1 | 2 | 3;
  readonly format?: "png" | "jpeg" | "webp";
};

export const stageRatios: readonly StageRatio[] = [
  { id: "auto", label: "Auto", hint: "Fits the media", ratio: null },
  { id: "16x9", label: "16:9", hint: "YouTube thumbnail", ratio: 16 / 9, scale: 2, format: "png" },
  { id: "2x1", label: "2:1", hint: "X / Twitter card", ratio: 2, scale: 2, format: "png" },
  { id: "1x1", label: "1:1", hint: "Square post", ratio: 1, scale: 2, format: "png" },
  { id: "4x3", label: "4:3", hint: "Slide deck", ratio: 4 / 3, scale: 2, format: "png" },
  { id: "3x2", label: "3:2", hint: "Blog header", ratio: 3 / 2, scale: 2, format: "webp" },
  { id: "4x5", label: "4:5", hint: "Portrait feed", ratio: 4 / 5, scale: 2, format: "png" },
  { id: "9x16", label: "9:16", hint: "Reel / story", ratio: 9 / 16, scale: 2, format: "png" },
  { id: "custom", label: "Custom", hint: "Your own numbers", ratio: null },
];

export type OverlayTone = "none" | "dark" | "light";

export const sceneSettingsSchema = z.object({
  backgroundEnabled: z.boolean(),
  background: backgroundSelectionSchema,
  customColor: z.string().min(1),
  backgroundBlur: z.number(),
  overlayTone: z.enum(["none", "dark", "light"]),
  overlayStrength: z.number(),
  effects: effectSettingsSchema,
  aspectRatio: z.enum(["auto", "16x9", "1x1", "4x3", "3x2", "2x1", "9x16", "4x5", "custom"]),
  customAspectWidth: z.number(),
  customAspectHeight: z.number(),
  paddingTop: z.number(),
  paddingRight: z.number(),
  paddingBottom: z.number(),
  paddingLeft: z.number(),
  paddingLinked: z.boolean(),
  cornerRadius: z.number(),
});

export type SceneSettings = z.infer<typeof sceneSettingsSchema>;

export const defaultSceneSettings: SceneSettings = {
  backgroundEnabled: true,
  background: { kind: "preset", id: "wallpaper" },
  customColor: "#26352e",
  backgroundBlur: 0,
  overlayTone: "none",
  overlayStrength: 25,
  effects: defaultEffectSettings,
  aspectRatio: "auto",
  customAspectWidth: 3,
  customAspectHeight: 2,
  paddingTop: 56,
  paddingRight: 56,
  paddingBottom: 56,
  paddingLeft: 56,
  paddingLinked: true,
  cornerRadius: 20,
};

/**
 * The shape the stage should hold, or `null` to shrink-wrap the media.
 * Custom numbers are clamped so a stray `0` cannot collapse the canvas.
 */
export function stageAspectRatio(scene: SceneSettings): number | null {
  if (scene.aspectRatio === "custom") {
    const width = Math.min(Math.max(scene.customAspectWidth, 1), 64);
    const height = Math.min(Math.max(scene.customAspectHeight, 1), 64);
    return width / height;
  }
  return stageRatios.find((entry) => entry.id === scene.aspectRatio)?.ratio ?? null;
}

/** Largest box of `ratio` that fits inside `bounds`. */
export function fitRatioBox(ratio: number, bounds: Size): Size {
  if (ratio <= 0 || bounds.width <= 0 || bounds.height <= 0) return bounds;
  const width = Math.min(bounds.width, bounds.height * ratio);
  return { width: Math.round(width), height: Math.round(width / ratio) };
}

export const overlayTones: readonly { readonly id: OverlayTone; readonly label: string }[] = [
  { id: "none", label: "None" },
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
];

/** CSS colour for the flat tone laid over the background, or `null` when off. */
export function overlayValue(scene: SceneSettings): string | null {
  if (scene.overlayTone === "none" || scene.overlayStrength <= 0) return null;
  const percent = Math.min(Math.max(scene.overlayStrength, 0), 100);
  return scene.overlayTone === "dark"
    ? `rgb(8 9 8 / ${String(percent)}%)`
    : `rgb(255 255 255 / ${String(percent)}%)`;
}

export type FrameId = "clean" | "browser" | "glass" | "iphone" | "tablet" | "laptop" | "desktop";

export const frameSettingsSchema = z.object({
  frameEnabled: z.boolean(),
  frameId: z.enum(["clean", "browser", "glass", "iphone", "tablet", "laptop", "desktop"]),
  borderWidth: z.number(),
  borderColor: z.string().min(1),
  shadow: z.number(),
  shadowColor: z.string().min(1),
  shadowSpread: z.number(),
});

export type FrameSettings = z.infer<typeof frameSettingsSchema>;

export const defaultFrameSettings: FrameSettings = {
  frameEnabled: true,
  frameId: "browser",
  borderWidth: 0,
  borderColor: "#ffffff",
  shadow: 48,
  shadowColor: "#000000",
  shadowSpread: 40,
};

export const textSettingsSchema = z.object({
  showTitle: z.boolean(),
  showNote: z.boolean(),
  title: z.string(),
  note: z.string(),
});

export type TextSettings = z.infer<typeof textSettingsSchema>;

export const defaultTextSettings: TextSettings = {
  showTitle: false,
  showNote: false,
  title: "A calmer way to share work",
  note: "Built in CapKit",
};

export const showcasePresetSchema = z.object({
  version: z.literal(3),
  image: imageSettingsSchema,
  scene: sceneSettingsSchema,
  frame: frameSettingsSchema,
  text: textSettingsSchema,
});

export type ShowcasePreset = z.infer<typeof showcasePresetSchema>;

/** localStorage key holding the last saved composition. */
export const showcasePresetStorageKey = "capkit.showcase.preset";

/** localStorage key holding the background sources the user attached. */
export const showcaseLibraryStorageKey = "capkit.showcase.library";

/**
 * Attached background sources, stored as paths only.
 *
 * Asset-protocol access is granted per session, so the paths are re-registered
 * with the backend on every mount rather than caching stale URLs.
 */
export const showcaseLibrarySchema = z.object({
  folders: z.array(z.string().min(1)),
  images: z.array(z.string().min(1)),
});

export type ShowcaseLibrary = z.infer<typeof showcaseLibrarySchema>;

/* -------------------------------------------------------------------------- */
/* Looks — one-click starting points                                           */
/* -------------------------------------------------------------------------- */

/**
 * A complete starting composition.
 *
 * Most people want a good result immediately and only a minority reach for the
 * individual sliders, so the panels lead with these and keep the rest folded
 * away behind "Fine-tune".
 */
export type Look = {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly swatch: string;
  readonly scene: Partial<SceneSettings>;
  readonly frame: Partial<FrameSettings>;
  readonly image: Partial<ImageSettings>;
};

export const looks: readonly Look[] = [
  {
    id: "spotlight",
    label: "Spotlight",
    hint: "Colours pulled from the image",
    swatch: "radial-gradient(circle at 34% 26%, #4d6b57, #14181500 62%), linear-gradient(135deg, #1d2a22, #0d100e)",
    scene: {
      background: { kind: "preset", id: "wallpaper" },
      backgroundBlur: 0,
      overlayTone: "none",
      effects: { ...defaultEffectSettings, spotlight: 28 },
      paddingTop: 72,
      paddingRight: 72,
      paddingBottom: 72,
      paddingLeft: 72,
      paddingLinked: true,
      cornerRadius: 20,
    },
    frame: { frameEnabled: true, frameId: "browser", borderWidth: 0, shadow: 55, shadowSpread: 46 },
    image: { effects: defaultEffectSettings },
  },
  {
    id: "editorial",
    label: "Editorial",
    hint: "Paper, hairline, no chrome",
    swatch: "#ecebe5",
    scene: {
      background: { kind: "preset", id: "paper" },
      backgroundBlur: 0,
      overlayTone: "none",
      effects: { ...defaultEffectSettings, texture: 22 },
      paddingTop: 88,
      paddingRight: 88,
      paddingBottom: 88,
      paddingLeft: 88,
      paddingLinked: true,
      cornerRadius: 6,
    },
    frame: { frameEnabled: false, frameId: "clean", borderWidth: 1, borderColor: "#1c1d1a", shadow: 0 },
    image: { effects: defaultEffectSettings },
  },
  {
    id: "midnight",
    label: "Midnight",
    hint: "Dark stage, deep shadow",
    swatch: "linear-gradient(135deg, #1c1d1a, #080a09)",
    scene: {
      background: { kind: "preset", id: "midnight" },
      backgroundBlur: 0,
      overlayTone: "dark",
      overlayStrength: 18,
      effects: { ...defaultEffectSettings, vignette: 34 },
      paddingTop: 64,
      paddingRight: 64,
      paddingBottom: 64,
      paddingLeft: 64,
      paddingLinked: true,
      cornerRadius: 16,
    },
    frame: { frameEnabled: true, frameId: "glass", borderWidth: 0, shadow: 78, shadowSpread: 62 },
    image: { effects: defaultEffectSettings },
  },
  {
    id: "poster",
    label: "Poster",
    hint: "Wide margins, grain",
    swatch: "linear-gradient(135deg, #d98b5f, #7b4a6d)",
    scene: {
      background: { kind: "preset", id: "sunset" },
      backgroundBlur: 0,
      overlayTone: "none",
      effects: { ...defaultEffectSettings, noise: 30, vignette: 26 },
      paddingTop: 110,
      paddingRight: 110,
      paddingBottom: 110,
      paddingLeft: 110,
      paddingLinked: true,
      cornerRadius: 10,
    },
    frame: { frameEnabled: true, frameId: "clean", borderWidth: 6, borderColor: "#f8f7f2", shadow: 42, shadowSpread: 30 },
    image: { effects: defaultEffectSettings },
  },
  {
    id: "device",
    label: "Device",
    hint: "Laptop on a soft wash",
    swatch: "linear-gradient(135deg, #7fb0d4, #3c5c78)",
    scene: {
      background: { kind: "preset", id: "ocean" },
      backgroundBlur: 22,
      overlayTone: "light",
      overlayStrength: 12,
      effects: { ...defaultEffectSettings, spotlight: 18 },
      paddingTop: 76,
      paddingRight: 76,
      paddingBottom: 76,
      paddingLeft: 76,
      paddingLinked: true,
      cornerRadius: 12,
    },
    frame: { frameEnabled: true, frameId: "laptop", borderWidth: 0, shadow: 60, shadowSpread: 52 },
    image: { effects: defaultEffectSettings },
  },
  {
    id: "bare",
    label: "Bare",
    hint: "Just the image",
    swatch: "repeating-conic-gradient(#d8d8d2 0% 25%, #f2f2ee 0% 50%) 50% / 12px 12px",
    scene: { backgroundEnabled: false },
    frame: { frameEnabled: false, frameId: "clean", borderWidth: 0, shadow: 0 },
    image: { effects: defaultEffectSettings },
  },
];

/* -------------------------------------------------------------------------- */
/* Named styles                                                                */
/* -------------------------------------------------------------------------- */

/** localStorage key holding the user's named compositions. */
export const showcaseStylesStorageKey = "capkit.showcase.styles";

export const savedStyleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  savedAt: z.string().min(1),
  preset: showcasePresetSchema,
});

export type SavedStyle = z.infer<typeof savedStyleSchema>;

export const savedStyleLibrarySchema = z.array(savedStyleSchema);

/** Replaces a same-named style rather than accumulating duplicates. */
export function mergeSavedStyles(current: readonly SavedStyle[], style: SavedStyle): readonly SavedStyle[] {
  const rest = current.filter((entry) => entry.id !== style.id && entry.name !== style.name);
  return [style, ...rest].slice(0, 24);
}

/* -------------------------------------------------------------------------- */
/* Export                                                                      */
/* -------------------------------------------------------------------------- */

export const exportFormats = ["png", "jpeg", "webp"] as const;
export type ExportFormat = (typeof exportFormats)[number];

export const exportScales = [1, 2, 3] as const;
export type ExportScale = (typeof exportScales)[number];

/** Pixel size the export will produce for a stage rendered at `scale`. */
export function outputSize(stage: Size, scale: number): Size {
  return { width: Math.max(1, Math.round(stage.width * scale)), height: Math.max(1, Math.round(stage.height * scale)) };
}

/** Timestamped file name so repeated exports never silently overwrite. */
export function exportFileName(format: ExportFormat, stamp: string): string {
  const safe = stamp.replace(/[:.]/g, "-");
  return `capkit-showcase-${safe}.${format === "jpeg" ? "jpg" : format}`;
}

/** MIME type matching an export format. */
export function exportMimeType(format: ExportFormat): string {
  return `image/${format}`;
}

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Clamps a single crop edge into the safe `[0, maxCropInset]` range. */
export function clampCropInset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), maxCropInset);
}

/** Clamps every edge of a crop rectangle. */
/**
 * Converts a pointer delta on screen into a delta in the image's own axes.
 *
 * Crop handles sit inside the rotated and flipped media box, so a drag to the
 * right is not always a drag towards the image's right edge. Rotating and
 * mirroring the delta here keeps the handle under the pointer.
 */
export function cropDragDelta(dx: number, dy: number, image: ImageSettings): { readonly x: number; readonly y: number } {
  const rotated =
    image.quarterTurns === 1
      ? { x: dy, y: -dx }
      : image.quarterTurns === 2
        ? { x: -dx, y: -dy }
        : image.quarterTurns === 3
          ? { x: -dy, y: dx }
          : { x: dx, y: dy };
  return {
    x: image.flipHorizontal ? -rotated.x : rotated.x,
    y: image.flipVertical ? -rotated.y : rotated.y,
  };
}

export function normalizeCrop(crop: CropInsets): CropInsets {
  return {
    top: clampCropInset(crop.top),
    right: clampCropInset(crop.right),
    bottom: clampCropInset(crop.bottom),
    left: clampCropInset(crop.left),
  };
}

/**
 * Builds the centred crop that turns `natural` into the requested aspect ratio.
 * Extreme ratios are clamped, so the result is a best-effort approximation.
 */
export function cropForRatio(natural: Size, ratio: number): CropInsets {
  if (natural.width <= 0 || natural.height <= 0 || ratio <= 0) return defaultImageSettings.crop;
  const naturalRatio = natural.width / natural.height;
  if (naturalRatio > ratio) {
    const cut = (1 - ratio / naturalRatio) / 2;
    return normalizeCrop({ top: 0, right: cut, bottom: 0, left: cut });
  }
  const cut = (1 - naturalRatio / ratio) / 2;
  return normalizeCrop({ top: cut, right: 0, bottom: cut, left: 0 });
}

/** Pixel size that survives the crop, in source-image pixels. */
export function croppedPixelSize(natural: Size, crop: CropInsets): Size {
  const safe = normalizeCrop(crop);
  return {
    width: Math.max(1, Math.round(natural.width * (1 - safe.left - safe.right))),
    height: Math.max(1, Math.round(natural.height * (1 - safe.top - safe.bottom))),
  };
}

/** Swaps width and height for odd quarter turns. */
export function orientedSize(size: Size, quarterTurns: QuarterTurns): Size {
  return quarterTurns % 2 === 1 ? { width: size.height, height: size.width } : size;
}

/** Scale that fits `size` inside `bounds` without ever enlarging it. */
export function fitScale(size: Size, bounds: Size): number {
  if (size.width <= 0 || size.height <= 0 || bounds.width <= 0 || bounds.height <= 0) return 1;
  return Math.min(1, bounds.width / size.width, bounds.height / size.height);
}

/**
 * Scale that makes `size` touch `bounds` on its constrained axis, growing as
 * well as shrinking. The stage relies on this so the declared padding is the
 * gap actually rendered instead of a floor under an arbitrary extra gutter.
 */
export function containScale(size: Size, bounds: Size): number {
  if (size.width <= 0 || size.height <= 0 || bounds.width <= 0 || bounds.height <= 0) return 1;
  return Math.min(bounds.width / size.width, bounds.height / size.height);
}

/** Rotates the quarter-turn counter by `delta` steps, wrapping at four. */
export function rotateQuarterTurns(current: QuarterTurns, delta: number): QuarterTurns {
  const next = (((current + delta) % 4) + 4) % 4;
  return next as QuarterTurns;
}

/** CSS `filter` for the source image: preset look plus manual adjustments. */
export function imageFilterValue(image: ImageSettings): string {
  const preset = imageFilters.find((item) => item.id === image.filter)?.filter ?? "";
  const parts = [
    preset,
    image.brightness === 100 ? "" : `brightness(${String(image.brightness / 100)})`,
    image.contrast === 100 ? "" : `contrast(${String(image.contrast / 100)})`,
    image.saturation === 100 ? "" : `saturate(${String(image.saturation / 100)})`,
  ].filter((part) => part !== "");
  return parts.length === 0 ? "none" : parts.join(" ");
}

/** CSS `transform` for the framed media node: pan, zoom, straighten, 3D tilt. */
export function mediaTransform(image: ImageSettings): string {
  return [
    `translate3d(${String(image.offsetX)}px, ${String(image.offsetY)}px, 0)`,
    `scale(${String(image.zoom / 100)})`,
    `rotate(${String(image.straighten)}deg)`,
    `rotateX(${String(image.tiltX)}deg)`,
    `rotateY(${String(image.tiltY)}deg)`,
  ].join(" ");
}

/** CSS `transform` that mirrors the cropped media without moving the frame. */
export function flipTransform(image: ImageSettings): string {
  const scaleX = image.flipHorizontal ? -1 : 1;
  const scaleY = image.flipVertical ? -1 : 1;
  return `scale(${String(scaleX)}, ${String(scaleY)})`;
}

/**
 * CSS `box-shadow` for a 0-100 shadow strength. `0` removes the shadow.
 * `spread` (0-100) widens the blur without darkening it.
 */
/**
 * Where the shadow falls for a given tilt.
 *
 * A tilted mockup with a shadow directly beneath it reads as a sticker. The
 * light is treated as fixed and overhead, so leaning the top away pushes the
 * shadow further down and leaning sideways slides it the other way.
 */
export function shadowOffset(strength: number, tiltX: number, tiltY: number): { readonly x: number; readonly y: number } {
  const depth = 1 + strength / 100;
  const x = Math.round(-tiltY * 0.7 * depth);
  return {
    // Normalised so an untilted frame emits `0px` rather than CSS's `-0px`.
    x: x === 0 ? 0 : x,
    y: Math.round((12 + strength / 5 + tiltX * 0.7) * depth),
  };
}

export function shadowValue(strength: number, color = "#000000", spread = 40, tiltX = 0, tiltY = 0): string {
  if (strength <= 0) return "none";
  const offset = shadowOffset(strength, tiltX, tiltY);
  const blur = Math.round(22 + strength / 2 + spread * 0.9);
  return `${String(offset.x)}px ${String(offset.y)}px ${String(blur)}px ${withAlpha(color, Math.round(strength * 0.65))}`;
}

/** Matching `drop-shadow()` for frames whose silhouette is not a rectangle. */
export function dropShadowValue(strength: number, color = "#000000", spread = 40, tiltX = 0, tiltY = 0): string {
  if (strength <= 0) return "none";
  const offset = shadowOffset(strength, tiltX, tiltY);
  const blur = Math.round(11 + strength / 4 + spread * 0.45);
  return `drop-shadow(${String(offset.x)}px ${String(offset.y)}px ${String(blur)}px ${withAlpha(color, Math.round(strength * 0.65))})`;
}

/* -------------------------------------------------------------------------- */
/* Media collection helpers                                                    */
/* -------------------------------------------------------------------------- */

/** Attaches renderable URLs to backend media payloads. */
export function toMediaItems(
  files: readonly MediaFile[],
  toUrl: (path: string) => string,
): readonly MediaItem[] {
  return files.map((file) => ({ ...file, url: toUrl(file.path) }));
}

/** Prepends newly imported media, keeping one entry per path. */
export function mergeMediaItems(
  current: readonly MediaItem[],
  incoming: readonly MediaItem[],
): readonly MediaItem[] {
  const seen = new Set(incoming.map((item) => item.path));
  return [...incoming, ...current.filter((item) => !seen.has(item.path))];
}

/** Adds or replaces a background folder, keeping the list ordered by name. */
export function mergeMediaFolders(
  current: readonly MediaFolder[],
  incoming: MediaFolder,
): readonly MediaFolder[] {
  const next = [...current.filter((folder) => folder.path !== incoming.path), incoming];
  return next.sort((first, second) => first.name.localeCompare(second.name));
}

/** Human-readable file size used in the media strip tooltips. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
