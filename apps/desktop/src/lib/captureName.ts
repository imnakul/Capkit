const TIMESTAMP_SUFFIX = /_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d+)*$/;

/**
 * Readable name for a saved capture. New files are named after the window or page
 * that was captured plus a timestamp; the timestamp is dropped here because every
 * card already shows the date.
 */
export function captureDisplayName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.\\/]+$/, "");
  const label = withoutExtension.replace(TIMESTAMP_SUFFIX, "").trim();
  return label === "" ? withoutExtension : label;
}
