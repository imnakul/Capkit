import type { SnaphubSettings } from "../domain/settings";

export function captureCursor(cursor: SnaphubSettings["cursor"], accentColor: string): string {
  if (!cursor.enabled) return "crosshair";
  const sizeByName: Record<SnaphubSettings["cursor"]["size"], number> = {
    small: 24,
    medium: 32,
    large: 40,
  };
  const size = sizeByName[cursor.size];
  const center = size / 2;
  const outerStroke = Math.max(4, Math.round(size / 7));
  const innerStroke = Math.max(2, Math.round(size / 16));
  const armStart = Math.round(size * 0.08);
  const armEnd = Math.round(size * 0.35);
  const farStart = size - armEnd;
  const farEnd = size - armStart;
  const cross = `<path d="M${String(center)} ${String(armStart)}v${String(armEnd - armStart)}M${String(center)} ${String(farStart)}v${String(farEnd - farStart)}M${String(armStart)} ${String(center)}h${String(armEnd - armStart)}M${String(farStart)} ${String(center)}h${String(farEnd - farStart)}"/>`;
  const shape = cursor.style === "target"
    ? `${cross}<circle cx="${String(center)}" cy="${String(center)}" r="${String(Math.round(size * 0.22))}"/>`
    : cursor.style === "precision"
      ? `<path d="M${String(center)} ${String(armStart)}L${String(farEnd)} ${String(center)} ${String(center)} ${String(farEnd)} ${String(armStart)} ${String(center)}Z"/><circle cx="${String(center)}" cy="${String(center)}" r="${String(Math.max(2, Math.round(size * 0.07)))}" fill="${accentColor}"/>`
      : cross;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(size)}" height="${String(size)}" viewBox="0 0 ${String(size)} ${String(size)}"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#090b09" stroke-width="${String(outerStroke)}">${shape}</g><g stroke="${accentColor}" stroke-width="${String(innerStroke)}">${shape}</g></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${String(center)} ${String(center)}, crosshair`;
}
