export type Rgba = { r: number; g: number; b: number; a: number };

/** Parses rgb()/rgba() computed colours. Returns null for anything else. */
export function parseColor(value: string): Rgba | null {
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(value.trim());
  if (match === null) return null;
  const [, r = "0", g = "0", b = "0", alphaRaw] = match;
  let a = 1;
  if (alphaRaw !== undefined) {
    a = alphaRaw.endsWith("%") ? Number.parseFloat(alphaRaw) / 100 : Number.parseFloat(alphaRaw);
  }
  return { r: Number(r), g: Number(g), b: Number(b), a };
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two opaque colours. */
export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Composites a translucent colour over an opaque background. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

export type ContrastGrade = "AAA" | "AA" | "Fail";

export function gradeContrast(ratio: number, largeText: boolean): ContrastGrade {
  if (ratio >= (largeText ? 4.5 : 7)) return "AAA";
  if (ratio >= (largeText ? 3 : 4.5)) return "AA";
  return "Fail";
}

/** The opaque colour behind an element: its own and its ancestors' backgrounds composited over white. */
export function effectiveBackground(element: Element): Rgba {
  const layers: Rgba[] = [];
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const color = parseColor(getComputedStyle(node).backgroundColor);
    if (color !== null && color.a > 0) {
      layers.push(color);
      if (color.a >= 1) break;
    }
  }
  return layers.reduceRight<Rgba>((below, layer) => over(layer, below), { r: 255, g: 255, b: 255, a: 1 });
}
