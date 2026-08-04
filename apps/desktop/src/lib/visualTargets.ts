import type { DetectedTarget, Point, Rect } from "../domain/capture";

type Pixel = readonly [number, number, number];

export type VisualTargetDetector = {
  targetAt: (point: Point) => DetectedTarget | null;
};

const MAX_ANALYSIS_WIDTH = 1_600;
const MAX_ANALYSIS_HEIGHT = 1_000;
const EDGE_THRESHOLD = 28;
const MIN_REGION_SIZE = 26;
const MAX_REGION_RATIO = 0.94;

/**
 * Builds a small, screenshot-only target detector. Browser DOM/CSS is not exposed
 * consistently through Windows UI Automation, so this bounded visual fallback
 * finds the nearest stable rectangular surface in the frozen pixels. It never
 * walks the live page and therefore cannot steal focus or mutate the target app.
 */
export async function createVisualTargetDetector(
  source: string,
  display: Rect,
): Promise<VisualTargetDetector | null> {
  if (source === "") return null;
  const image = await loadImage(source);
  const scale = Math.min(
    1,
    MAX_ANALYSIS_WIDTH / Math.max(1, image.naturalWidth),
    MAX_ANALYSIS_HEIGHT / Math.max(1, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return null;
  context.drawImage(image, 0, 0, width, height);
  let data: Uint8ClampedArray;
  try {
    data = context.getImageData(0, 0, width, height).data;
  } catch {
    // Some packaged WebView2 configurations disallow reading asset:// pixels.
    // Native/UIA detection remains available in that case.
    return null;
  }

  const detectorWidth = display.width;
  const detectorHeight = display.height;
  return {
    targetAt(point: Point): DetectedTarget | null {
      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x > detectorWidth ||
        point.y > detectorHeight
      ) {
        return null;
      }
      const sampleX = Math.round((point.x / Math.max(1, detectorWidth)) * width);
      const sampleY = Math.round((point.y / Math.max(1, detectorHeight)) * height);
      const bounds = detectSurfaceRect(data, width, height, sampleX, sampleY);
      if (bounds === null) return null;
      const localBounds: Rect = {
        x: (bounds.x / width) * detectorWidth,
        y: (bounds.y / height) * detectorHeight,
        width: (bounds.width / width) * detectorWidth,
        height: (bounds.height / height) * detectorHeight,
      };
      return {
        id: [
          "visual",
          Math.round(localBounds.x),
          Math.round(localBounds.y),
          Math.round(localBounds.width),
          Math.round(localBounds.height),
        ].map(String).join("-"),
        title: "Visual region",
        kind: "ui-region",
        bounds: localBounds,
      };
    },
  };
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = (): void => resolve(image);
    image.onerror = (): void => reject(new Error("The frozen screenshot could not be analysed"));
    image.src = source;
  });
}

function detectSurfaceRect(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): Rect | null {
  const centerX = clamp(Math.round(x), 0, width - 1);
  const centerY = clamp(Math.round(y), 0, height - 1);
  const left = scanEdge(data, width, height, centerX, centerY, -1, "x");
  const right = scanEdge(data, width, height, centerX, centerY, 1, "x");
  const top = scanEdge(data, width, height, centerX, centerY, -1, "y");
  const bottom = scanEdge(data, width, height, centerX, centerY, 1, "y");
  if (left === null || right === null || top === null || bottom === null) return null;

  const rect = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
  if (
    rect.width < MIN_REGION_SIZE ||
    rect.height < MIN_REGION_SIZE ||
    rect.width > width * MAX_REGION_RATIO ||
    rect.height > height * MAX_REGION_RATIO
  ) {
    return null;
  }
  return rect;
}

function scanEdge(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  originX: number,
  originY: number,
  direction: -1 | 1,
  axis: "x" | "y",
): number | null {
  const limit = axis === "x" ? width : height;
  const origin = axis === "x" ? originX : originY;
  const color = pixelAt(data, width, height, originX, originY);
  for (let distance = 4; distance < limit; distance += 2) {
    const offset = origin + distance * direction;
    if (offset <= 1 || offset >= limit - 2) break;
    const x = axis === "x" ? offset : originX;
    const y = axis === "y" ? offset : originY;
    const candidate = pixelAt(data, width, height, x, y);
    if (colorDistance(color, candidate) < EDGE_THRESHOLD) continue;

    let bandAgreement = 0;
    for (let band = -3; band <= 3; band += 1) {
      const bandX = axis === "x" ? offset : originX + band;
      const bandY = axis === "y" ? offset : originY + band;
      const nextX = axis === "x" ? offset + direction : originX + band;
      const nextY = axis === "y" ? offset + direction : originY + band;
      if (colorDistance(pixelAt(data, width, height, bandX, bandY), pixelAt(data, width, height, nextX, nextY)) >= EDGE_THRESHOLD) {
        bandAgreement += 1;
      }
    }
    if (bandAgreement < 4) continue;

    // Require a short, consistent transition instead of reacting to a single
    // glyph stroke. This keeps the detector stable while the pointer moves.
    let agreement = 0;
    for (let lookahead = 1; lookahead <= 4; lookahead += 1) {
      const nextOffset = offset + lookahead * direction;
      if (nextOffset <= 0 || nextOffset >= limit) break;
      const next = axis === "x" ? pixelAt(data, width, height, nextOffset, originY) : pixelAt(data, width, height, originX, nextOffset);
      if (colorDistance(candidate, next) < EDGE_THRESHOLD * 0.7) agreement += 1;
    }
    if (agreement >= 2) return direction < 0 ? offset + 1 : offset - 1;
  }
  return null;
}

function pixelAt(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): Pixel {
  const safeX = clamp(Math.round(x), 0, width - 1);
  const safeY = clamp(Math.round(y), 0, height - 1);
  const index = (safeY * width + safeX) * 4;
  return [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0];
}

function colorDistance(left: Pixel, right: Pixel): number {
  return Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]) + Math.abs(left[2] - right[2]);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
