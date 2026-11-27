import { effectiveBackground, parseColor, type Rgba } from "../contrast";

export type FontInfo = {
  family: string;
  stack: string;
  size: string;
  weight: string;
  lineHeight: string;
  letterSpacing: string;
  style: string;
  color: string;
};

export type ColorSwatch = { name: string; hex: string };

function hex2(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");
}

export function rgbaToHex({ r, g, b, a }: Rgba): string {
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return a < 1 ? `${base}${hex2(a * 255)}` : base;
}

/**
 * Any computed CSS colour as HEX. Chrome reports oklch()/color() values as written, so
 * those are painted on a 1px canvas and read back (sRGB, gamut-clipped).
 */
export function toHex(value: string, doc: Document): string {
  const parsed = parseColor(value);
  if (parsed !== null) return rgbaToHex(parsed);
  const context = doc.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (context === null) return value.trim();
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 255] = context.getImageData(0, 0, 1, 1).data;
  return rgbaToHex({ r, g, b, a: a / 255 });
}

/** First family in a font-family list, without quotes. */
export function firstFamily(stack: string): string {
  const first = stack.split(",")[0] ?? "";
  return first.trim().replace(/^["']|["']$/g, "");
}

export function readFont(element: Element): FontInfo {
  const style = getComputedStyle(element);
  return {
    family: firstFamily(style.fontFamily),
    stack: style.fontFamily,
    size: style.fontSize,
    weight: style.fontWeight,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    style: style.fontStyle,
    color: toHex(style.color, element.ownerDocument),
  };
}

/** The CSS a click copies; default-valued letter spacing and style are left out. */
export function fontCssText(font: FontInfo): string {
  const lines = [
    `font-family: ${font.stack};`,
    `font-size: ${font.size};`,
    `font-weight: ${font.weight};`,
    `line-height: ${font.lineHeight};`,
  ];
  if (font.letterSpacing !== "normal" && font.letterSpacing !== "0px") lines.push(`letter-spacing: ${font.letterSpacing};`);
  if (font.style !== "normal") lines.push(`font-style: ${font.style};`);
  lines.push(`color: ${font.color};`);
  return lines.join("\n");
}

function visible(value: string): boolean {
  const parsed = parseColor(value);
  return parsed === null ? value !== "transparent" && value !== "none" && value !== "" : parsed.a > 0;
}

/** Text, background, border and SVG paint colours of one element, as HEX, duplicates kept apart by name. */
export function readColors(element: Element): ColorSwatch[] {
  const doc = element.ownerDocument;
  const style = getComputedStyle(element);
  const swatches: ColorSwatch[] = [{ name: "Text", hex: toHex(style.color, doc) }];
  if (visible(style.backgroundColor)) swatches.push({ name: "Background", hex: toHex(style.backgroundColor, doc) });
  else swatches.push({ name: "Background (behind)", hex: rgbaToHex(effectiveBackground(element)) });
  const border = Number.parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== "none";
  if (border && visible(style.borderTopColor)) swatches.push({ name: "Border", hex: toHex(style.borderTopColor, doc) });
  if (element instanceof SVGElement) {
    const fill = style.getPropertyValue("fill");
    const stroke = style.getPropertyValue("stroke");
    if (visible(fill)) swatches.push({ name: "Fill", hex: toHex(fill, doc) });
    if (visible(stroke)) swatches.push({ name: "Stroke", hex: toHex(stroke, doc) });
  }
  return swatches;
}
