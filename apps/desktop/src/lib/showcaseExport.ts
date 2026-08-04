import { domToBlob } from "modern-screenshot";
import { exportMimeType, type ExportFormat, type ExportScale } from "../domain/showcase";

type RenderOptions = {
  readonly format: ExportFormat;
  readonly scale: ExportScale;
  /** Painted behind the composition so JPEG never falls back to black. */
  readonly backgroundColor?: string;
};

/**
 * Rasterises the live stage node at export resolution.
 *
 * The stage is rendered from the real DOM rather than re-drawn on a canvas, so
 * what the user tuned in the preview is exactly what lands in the file. Remote
 * sources (`asset://` background images) are inlined as data URIs by the
 * serialiser, which also keeps the result untainted.
 */
export async function renderStageBlob(node: HTMLElement, options: RenderOptions): Promise<Blob> {
  return domToBlob(node, {
    scale: options.scale,
    type: exportMimeType(options.format),
    quality: options.format === "png" ? 1 : 0.94,
    backgroundColor: options.backgroundColor ?? null,
    // The preview clips its own corners; the export should keep that shape.
    style: { margin: "0", transform: "none" },
  });
}

/**
 * Places an image on the system clipboard.
 *
 * Only PNG is accepted by every platform's clipboard bridge, so callers render
 * a PNG for this path regardless of the chosen export format.
 */
export async function copyImageToClipboard(blob: Blob): Promise<void> {
  if (typeof ClipboardItem === "undefined") throw new Error("This build cannot write images to the clipboard");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/** Hands a rendered blob to the shell's download flow. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next frame so the navigation has already claimed the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
