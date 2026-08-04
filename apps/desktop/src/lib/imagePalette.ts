import { paletteFromPixels } from "../domain/showcase";

/** Edge length of the square every source is downscaled into before sampling. */
const sampleSize = 32;

/**
 * Reads the dominant colours out of an image URL.
 *
 * The pixels are fetched and decoded rather than read off the rendered `<img>`:
 * an `asset://` source taints the canvas, and `getImageData` on a tainted
 * canvas throws, which is why sampling silently produced nothing in the desktop
 * build. Fetching yields a same-origin blob, so the canvas stays readable.
 */
export async function readImagePalette(url: string): Promise<readonly string[]> {
  const canvas = document.createElement("canvas");
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return [];

  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    context.drawImage(bitmap, 0, 0, sampleSize, sampleSize);
    bitmap.close();
    return paletteFromPixels(context.getImageData(0, 0, sampleSize, sampleSize).data);
  } catch {
    // Blob URLs, unreachable assets, and DOMs without decoding support all land
    // here; the caller simply keeps whatever background is already set.
    return [];
  }
}
