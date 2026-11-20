const TIMESTAMP_SUFFIX = /_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:-\d+)*(?:_CapKit)?$/;
const GENERIC_LABELS = new Set(["capkit", "snaphub", "shothub"]);

/**
 * Readable name for a saved capture. New files are named after the window or page
 * that was captured, so that is shown as is. Older files only carry a product
 * name and a timestamp, which would make every card read "CapKit"; those become
 * "Screenshot, 19 Nov, 1:11 AM" so they can be told apart. Every name ends with its date and time. The file on disk is
 * never renamed.
 */
export function captureDisplayName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^./\\]+$/, "");
  const match = TIMESTAMP_SUFFIX.exec(withoutExtension);
  const label = withoutExtension.replace(TIMESTAMP_SUFFIX, "").trim();
  if (label === "") return withoutExtension;
  if (match === null) return label;

  const [, year, month, day, hour, minute] = match.map(Number);
  const taken = new Date(year ?? 0, (month ?? 1) - 1, day, hour, minute);
  const when = taken.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return `${GENERIC_LABELS.has(label.toLowerCase()) ? "Screenshot" : label}, ${when}`;
}
