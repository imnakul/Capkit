import { describe, expect, it } from "vitest";
import {
  backgroundValue,
  clampCropInset,
  containScale,
  cropDragDelta,
  cropForRatio,
  croppedPixelSize,
  defaultFrameSettings,
  defaultImageSettings,
  defaultSceneSettings,
  defaultTextSettings,
  exportFileName,
  fitRatioBox,
  fitScale,
  flipTransform,
  formatFileSize,
  hexToRgb,
  imageFilterValue,
  isAutoBackground,
  maxCropInset,
  mergeMediaFolders,
  mergeMediaItems,
  mergeSavedStyles,
  mixHex,
  orientedSize,
  outputSize,
  overlayValue,
  paletteFromPixels,
  rotateQuarterTurns,
  shadowOffset,
  shadowValue,
  spotlightGradient,
  stageAspectRatio,
  toMediaItems,
  withAlpha,
  type MediaFolder,
  type SavedStyle,
  type ShowcasePreset,
  type MediaItem,
} from "./showcase";

function media(path: string, name: string): MediaItem {
  return { path, fileName: name, sizeBytes: 1024, modifiedAt: "2026-07-25T10:00:00+05:30", url: `asset://${name}` };
}

describe("crop geometry", () => {
  it("clamps every edge into the safe range", () => {
    expect(clampCropInset(-0.4)).toBe(0);
    expect(clampCropInset(0.9)).toBe(maxCropInset);
    expect(clampCropInset(Number.NaN)).toBe(0);
  });

  it("crops the long axis when the target ratio is narrower", () => {
    const crop = cropForRatio({ width: 1600, height: 900 }, 1);
    expect(crop.top).toBe(0);
    expect(crop.left).toBeCloseTo(0.219, 3);
    expect(crop.left).toBe(crop.right);
  });

  it("crops the short axis when the target ratio is wider", () => {
    const crop = cropForRatio({ width: 900, height: 1600 }, 16 / 9);
    expect(crop.left).toBe(0);
    expect(crop.top).toBe(crop.bottom);
    expect(crop.top).toBeGreaterThan(0);
  });

  it("reports the surviving pixel size", () => {
    expect(croppedPixelSize({ width: 1000, height: 800 }, { top: 0.1, right: 0.2, bottom: 0.1, left: 0 })).toEqual({
      width: 800,
      height: 640,
    });
  });

  it("never returns a zero-sized crop", () => {
    expect(croppedPixelSize({ width: 0, height: 0 }, defaultImageSettings.crop)).toEqual({ width: 1, height: 1 });
  });
});

describe("orientation and fitting", () => {
  it("swaps axes on odd quarter turns", () => {
    expect(orientedSize({ width: 300, height: 100 }, 1)).toEqual({ width: 100, height: 300 });
    expect(orientedSize({ width: 300, height: 100 }, 2)).toEqual({ width: 300, height: 100 });
  });

  it("wraps the quarter-turn counter in both directions", () => {
    expect(rotateQuarterTurns(3, 1)).toBe(0);
    expect(rotateQuarterTurns(0, -1)).toBe(3);
  });

  it("shrinks to fit but never enlarges", () => {
    expect(fitScale({ width: 1000, height: 500 }, { width: 500, height: 500 })).toBe(0.5);
    expect(fitScale({ width: 100, height: 100 }, { width: 500, height: 500 })).toBe(1);
  });

  it("grows as well as shrinks so padding is the only gutter", () => {
    expect(containScale({ width: 1000, height: 500 }, { width: 500, height: 500 })).toBe(0.5);
    expect(containScale({ width: 100, height: 100 }, { width: 500, height: 400 })).toBe(4);
  });

  it("mirrors without moving the frame", () => {
    expect(flipTransform({ ...defaultImageSettings, flipHorizontal: true })).toBe("scale(-1, 1)");
  });
});

describe("appearance", () => {
  it("emits none when nothing is adjusted", () => {
    expect(imageFilterValue(defaultImageSettings)).toBe("none");
  });

  it("combines a preset look with manual adjustments", () => {
    const value = imageFilterValue({ ...defaultImageSettings, filter: "mono", brightness: 120 });
    expect(value).toContain("grayscale(1)");
    expect(value).toContain("brightness(1.2)");
  });

  it("removes the shadow at zero strength", () => {
    expect(shadowValue(0)).toBe("none");
    expect(shadowValue(50)).toContain("rgb(0 0 0 / 33%)");
  });

  it("leans the shadow with the tilt instead of leaving it flat", () => {
    const upright = shadowOffset(50, 0, 0);
    expect(upright.x).toBe(0);
    expect(shadowOffset(50, 0, 20).x).toBeLessThan(0);
    expect(shadowOffset(50, 20, 0).y).toBeGreaterThan(upright.y);
  });

  it("resolves every background kind", () => {
    expect(backgroundValue({ kind: "color", value: "#123456" })).toBe("#123456");
    expect(backgroundValue({ kind: "image", path: "C:/a.png", url: "asset://a.png" })).toContain("asset://a.png");
    expect(backgroundValue({ kind: "preset", id: "paper" })).toBe("#ecebe5");
  });
});

describe("colour extraction", () => {
  it("round-trips hex through rgb", () => {
    expect(hexToRgb("#3366cc")).toEqual({ red: 51, green: 102, blue: 204 });
    expect(hexToRgb("#fff")).toEqual({ red: 255, green: 255, blue: 255 });
    expect(hexToRgb("not-a-colour")).toBeNull();
  });

  it("expresses a hex colour as a translucent rgb triplet", () => {
    expect(withAlpha("#000000", 33)).toBe("rgb(0 0 0 / 33%)");
  });

  it("mixes towards a target colour", () => {
    expect(mixHex("#ffffff", "#000000", 0.5)).toBe("#808080");
    expect(mixHex("#ffffff", "#000000", 0)).toBe("#ffffff");
  });

  it("recovers dominant colours from sampled pixels", () => {
    const pixels = new Uint8ClampedArray(4 * 8);
    for (let index = 0; index < 8; index += 1) {
      const offset = index * 4;
      pixels[offset] = index < 5 ? 200 : 20;
      pixels[offset + 1] = index < 5 ? 40 : 90;
      pixels[offset + 2] = index < 5 ? 60 : 180;
      pixels[offset + 3] = 255;
    }
    const palette = paletteFromPixels(pixels);
    expect(palette.length).toBeGreaterThan(0);
    expect(palette.at(0)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("builds a spotlight gradient that layers glow over a base wash", () => {
    const gradient = spotlightGradient(["#c82840", "#1e5aa0"]);
    expect(gradient).toContain("radial-gradient");
    expect(gradient).toContain("linear-gradient");
  });

  it("treats presets and generated gradients as replaceable defaults", () => {
    expect(isAutoBackground({ kind: "preset", id: "paper" })).toBe(true);
    expect(isAutoBackground({ kind: "gradient", value: "linear-gradient(#000,#fff)" })).toBe(true);
    expect(isAutoBackground({ kind: "color", value: "#123456" })).toBe(false);
  });
});

describe("stage geometry", () => {
  it("resolves named and custom aspect ratios", () => {
    expect(stageAspectRatio(defaultSceneSettings)).toBeNull();
    expect(stageAspectRatio({ ...defaultSceneSettings, aspectRatio: "16x9" })).toBeCloseTo(16 / 9, 5);
    expect(stageAspectRatio({ ...defaultSceneSettings, aspectRatio: "custom", customAspectWidth: 5, customAspectHeight: 4 })).toBe(1.25);
  });

  it("fits a ratio box inside the available area", () => {
    expect(fitRatioBox(2, { width: 800, height: 800 })).toEqual({ width: 800, height: 400 });
    expect(fitRatioBox(0.5, { width: 800, height: 400 })).toEqual({ width: 200, height: 400 });
  });

  it("emits an overlay only when a tone is chosen", () => {
    expect(overlayValue(defaultSceneSettings)).toBeNull();
    expect(overlayValue({ ...defaultSceneSettings, overlayTone: "dark", overlayStrength: 40 })).toContain("40%");
    expect(overlayValue({ ...defaultSceneSettings, overlayTone: "light", overlayStrength: 20 })).toContain("255 255 255");
  });
});

describe("crop dragging", () => {
  it("passes the delta straight through when the image is upright", () => {
    expect(cropDragDelta(10, -4, defaultImageSettings)).toEqual({ x: 10, y: -4 });
  });

  it("rotates the delta into the image's own axes", () => {
    expect(cropDragDelta(10, 0, { ...defaultImageSettings, quarterTurns: 1 })).toEqual({ x: 0, y: -10 });
    expect(cropDragDelta(10, 6, { ...defaultImageSettings, quarterTurns: 2 })).toEqual({ x: -10, y: -6 });
  });

  it("mirrors the delta when the image is flipped", () => {
    expect(cropDragDelta(10, 6, { ...defaultImageSettings, flipHorizontal: true })).toEqual({ x: -10, y: 6 });
  });
});

describe("export and styles", () => {
  it("reports the pixel size an export will produce", () => {
    expect(outputSize({ width: 800, height: 450 }, 2)).toEqual({ width: 1600, height: 900 });
  });

  it("names exports without colons so every platform accepts the file", () => {
    expect(exportFileName("jpeg", "2026-07-25T10:00:00.000Z")).toBe("capkit-showcase-2026-07-25T10-00-00-000Z.jpg");
  });

  it("replaces a style saved under an existing name", () => {
    const preset: ShowcasePreset = { version: 3, image: defaultImageSettings, scene: defaultSceneSettings, frame: defaultFrameSettings, text: defaultTextSettings };
    const first: SavedStyle = { id: "a", name: "Launch", savedAt: "2026-07-25T10:00:00+05:30", preset };
    const second: SavedStyle = { id: "b", name: "Launch", savedAt: "2026-07-25T11:00:00+05:30", preset };
    const merged = mergeSavedStyles(mergeSavedStyles([], first), second);
    expect(merged).toHaveLength(1);
    expect(merged.at(0)?.id).toBe("b");
  });
});

describe("media collections", () => {
  it("attaches renderable urls", () => {
    const items = toMediaItems([{ path: "C:/a.png", fileName: "a.png", sizeBytes: 12, modifiedAt: "2026-07-25T10:00:00+05:30" }], (path) => `asset://${path}`);
    expect(items.at(0)?.url).toBe("asset://C:/a.png");
  });

  it("prepends imports and de-duplicates by path", () => {
    const merged = mergeMediaItems([media("C:/a.png", "a.png")], [media("C:/b.png", "b.png"), media("C:/a.png", "a.png")]);
    expect(merged.map((item) => item.path)).toEqual(["C:/b.png", "C:/a.png"]);
  });

  it("replaces a re-added folder and keeps the list sorted", () => {
    const alpha: MediaFolder = { path: "C:/alpha", name: "Alpha", images: [] };
    const zulu: MediaFolder = { path: "C:/zulu", name: "Zulu", images: [] };
    const refreshed: MediaFolder = { path: "C:/zulu", name: "Zulu", images: [media("C:/zulu/a.png", "a.png")] };
    const folders = mergeMediaFolders(mergeMediaFolders([zulu], alpha), refreshed);
    expect(folders.map((folder) => folder.name)).toEqual(["Alpha", "Zulu"]);
    expect(folders.at(1)?.images).toHaveLength(1);
  });

  it("formats file sizes for the media strip", () => {
    expect(formatFileSize(900)).toBe("900 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
