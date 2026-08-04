import {
  backgroundPresets,
  hexToRgb,
  type BackgroundSelection,
  type EffectSettings,
  type FrameSettings,
  type SceneSettings,
  type Size,
} from "./showcase";

/*
 * Canvas-paintable scene description.
 *
 * Showcase describes a background as a CSS shorthand, which a DOM node renders
 * for free but Canvas2D cannot consume at all. Video needs the same look drawn
 * onto a canvas, so this module carries a structured form that both targets can
 * render — CSS for the live preview, gradient objects for the compositor.
 *
 * It reads from `showcase.ts` rather than the shared core being lifted out of
 * it: the extraction would touch a 900-line module and 34 passing tests for no
 * user-visible gain, so it is deliberately deferred until something needs it.
 */

export type PaintStop = { readonly offset: number; readonly color: string };

export type BackgroundPaint =
  | { readonly kind: "solid"; readonly color: string }
  | { readonly kind: "linear"; readonly angleDeg: number; readonly stops: readonly PaintStop[] }
  | {
      readonly kind: "radial";
      /** Centre and radius as fractions of the shorter stage edge. */
      readonly cx: number;
      readonly cy: number;
      readonly radius: number;
      readonly stops: readonly PaintStop[];
    }
  | { readonly kind: "layers"; readonly layers: readonly BackgroundPaint[] }
  | { readonly kind: "image"; readonly url: string };

/** Structured paint for each built-in preset, mirroring its CSS exactly. */
const presetPaints: Readonly<Record<string, BackgroundPaint>> = {
  paper: { kind: "solid", color: "#ecebe5" },
  midnight: { kind: "solid", color: "#151716" },
  citrus: {
    kind: "linear",
    angleDeg: 135,
    stops: [
      { offset: 0, color: "#d9ff43" },
      { offset: 1, color: "#f9f5c7" },
    ],
  },
  ocean: {
    kind: "linear",
    angleDeg: 135,
    stops: [
      { offset: 0, color: "#8de3ef" },
      { offset: 1, color: "#31577a" },
    ],
  },
  sunset: {
    kind: "linear",
    angleDeg: 135,
    stops: [
      { offset: 0, color: "#f3a46f" },
      { offset: 1, color: "#a76591" },
    ],
  },
  wallpaper: {
    kind: "layers",
    layers: [
      {
        kind: "linear",
        angleDeg: 135,
        stops: [
          { offset: 0, color: "#26352e" },
          { offset: 0.7, color: "#121714" },
        ],
      },
      {
        kind: "radial",
        cx: 0.18,
        cy: 0.12,
        radius: 0.27,
        stops: [
          { offset: 0, color: "rgb(217 255 67 / 36%)" },
          { offset: 1, color: "rgb(217 255 67 / 0%)" },
        ],
      },
      {
        kind: "radial",
        cx: 0.83,
        cy: 0.82,
        radius: 0.32,
        stops: [
          { offset: 0, color: "rgb(95 148 130 / 48%)" },
          { offset: 1, color: "rgb(95 148 130 / 0%)" },
        ],
      },
    ],
  },
};

/** Parses the gradient CSS a generated spotlight background produces. */
function paintFromGeneratedCss(value: string): BackgroundPaint {
  const layers: BackgroundPaint[] = [];

  const linear = /linear-gradient\(135deg,\s*([^,]+),\s*([^)]+)\)/.exec(value);
  if (linear !== null) {
    layers.push({
      kind: "linear",
      angleDeg: 135,
      stops: [
        { offset: 0, color: (linear[1] ?? "#000000").trim() },
        { offset: 1, color: (linear[2] ?? "#000000").trim() },
      ],
    });
  }

  const radial = /radial-gradient\(circle at ([\d.]+)% ([\d.]+)%,\s*(rgb\([^)]*\)|#[0-9a-fA-F]{3,8}),\s*transparent\s*([\d.]+)%\)/g;
  let match = radial.exec(value);
  while (match !== null) {
    const colour = (match[3] ?? "#000000").trim();
    layers.push({
      kind: "radial",
      cx: Number(match[1] ?? 50) / 100,
      cy: Number(match[2] ?? 50) / 100,
      radius: Number(match[4] ?? 40) / 100,
      stops: [
        { offset: 0, color: colour },
        { offset: 1, color: transparentVersion(colour) },
      ],
    });
    match = radial.exec(value);
  }

  if (layers.length === 0) return { kind: "solid", color: value };
  return layers.length === 1 ? (layers[0] ?? { kind: "solid", color: value }) : { kind: "layers", layers };
}

/**
 * Same colour at zero alpha.
 *
 * Canvas gradients interpolate in premultiplied space, so a stop of literal
 * `transparent` fades through black and leaves a dark halo. Matching the hue is
 * what makes a canvas radial look like the CSS one.
 */
function transparentVersion(color: string): string {
  const rgb = /rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(color);
  if (rgb !== null) return `rgb(${rgb[1] ?? "0"} ${rgb[2] ?? "0"} ${rgb[3] ?? "0"} / 0%)`;
  const parsed = hexToRgb(color);
  if (parsed === null) return "rgb(0 0 0 / 0%)";
  return `rgb(${String(parsed.red)} ${String(parsed.green)} ${String(parsed.blue)} / 0%)`;
}

/** Structured paint for any background the user can choose. */
export function backgroundPaint(selection: BackgroundSelection): BackgroundPaint {
  if (selection.kind === "color") return { kind: "solid", color: selection.value };
  if (selection.kind === "image") return { kind: "image", url: selection.url };
  if (selection.kind === "gradient") return paintFromGeneratedCss(selection.value);
  const preset = presetPaints[selection.id];
  if (preset !== undefined) return preset;
  const fallback = backgroundPresets.find((entry) => entry.id === selection.id);
  return { kind: "solid", color: fallback?.background ?? "#171815" };
}

/** Renders a paint back to CSS so the DOM preview and the canvas agree. */
export function paintToCss(paint: BackgroundPaint): string {
  switch (paint.kind) {
    case "solid":
      return paint.color;
    case "image":
      return `url("${paint.url}") center / cover no-repeat`;
    case "linear":
      return `linear-gradient(${String(paint.angleDeg)}deg,${paint.stops
        .map((stop) => `${stop.color} ${String(Math.round(stop.offset * 100))}%`)
        .join(",")})`;
    case "radial":
      return `radial-gradient(circle at ${String(paint.cx * 100)}% ${String(paint.cy * 100)}%,${paint.stops
        .map((stop) => stop.color)
        .join(",")} ${String(Math.round(paint.radius * 100))}%)`;
    case "layers":
      // CSS paints the first layer on top, which is the reverse of how a canvas
      // draws them, so the order is flipped here.
      return [...paint.layers].reverse().map((layer) => paintToCss(layer)).join(",");
  }
}

/* -------------------------------------------------------------------------- */
/* Canvas painting                                                             */
/* -------------------------------------------------------------------------- */

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Fills the whole stage with a background paint. */
export function fillBackground(
  context: Canvas2D,
  paint: BackgroundPaint,
  size: Size,
  image: CanvasImageSource | null,
): void {
  const shortest = Math.min(size.width, size.height);
  switch (paint.kind) {
    case "solid": {
      context.fillStyle = paint.color;
      context.fillRect(0, 0, size.width, size.height);
      return;
    }
    case "linear": {
      const radians = ((paint.angleDeg - 90) * Math.PI) / 180;
      const half = Math.hypot(size.width, size.height) / 2;
      const cx = size.width / 2;
      const cy = size.height / 2;
      const gradient = context.createLinearGradient(
        cx - Math.cos(radians) * half,
        cy - Math.sin(radians) * half,
        cx + Math.cos(radians) * half,
        cy + Math.sin(radians) * half,
      );
      for (const stop of paint.stops) gradient.addColorStop(clamp01(stop.offset), stop.color);
      context.fillStyle = gradient;
      context.fillRect(0, 0, size.width, size.height);
      return;
    }
    case "radial": {
      const gradient = context.createRadialGradient(
        paint.cx * size.width,
        paint.cy * size.height,
        0,
        paint.cx * size.width,
        paint.cy * size.height,
        Math.max(1, paint.radius * shortest * 2),
      );
      for (const stop of paint.stops) gradient.addColorStop(clamp01(stop.offset), stop.color);
      context.fillStyle = gradient;
      context.fillRect(0, 0, size.width, size.height);
      return;
    }
    case "image": {
      if (image === null) {
        context.fillStyle = "#171815";
        context.fillRect(0, 0, size.width, size.height);
        return;
      }
      drawCover(context, image, size);
      return;
    }
    case "layers": {
      for (const layer of paint.layers) fillBackground(context, layer, size, image);
    }
  }
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** `object-fit: cover` for a canvas. */
export function drawCover(context: Canvas2D, image: CanvasImageSource, size: Size): void {
  const source = imageSize(image);
  if (source.width <= 0 || source.height <= 0) return;
  const scale = Math.max(size.width / source.width, size.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  context.drawImage(image, (size.width - width) / 2, (size.height - height) / 2, width, height);
}

function imageSize(image: CanvasImageSource): Size {
  if (typeof HTMLVideoElement !== "undefined" && image instanceof HTMLVideoElement) {
    return { width: image.videoWidth, height: image.videoHeight };
  }
  if (typeof VideoFrame !== "undefined" && image instanceof VideoFrame) {
    return { width: image.displayWidth, height: image.displayHeight };
  }
  const candidate = image as { width?: number; height?: number };
  return { width: candidate.width ?? 0, height: candidate.height ?? 0 };
}

/** Draws the grain, weave, glow, and falloff layers over the current content. */
export function paintEffects(context: Canvas2D, effects: EffectSettings, size: Size): void {
  const { width, height } = size;

  if (effects.noise > 0) {
    context.save();
    context.globalAlpha = (effects.noise / 100) * 0.22;
    // Deterministic dithering rather than random: an export must produce the
    // same frame twice, and random grain shimmers between frames.
    const cell = 3;
    for (let y = 0; y < height; y += cell) {
      for (let x = 0; x < width; x += cell) {
        const value = ((x * 73_856_093) ^ (y * 19_349_663)) % 255;
        context.fillStyle = value > 127 ? "#ffffff" : "#000000";
        context.fillRect(x, y, cell, cell);
      }
    }
    context.restore();
  }

  if (effects.texture > 0) {
    context.save();
    context.globalAlpha = (effects.texture / 100) * 0.5;
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1;
    context.beginPath();
    for (let offset = -height; offset < width; offset += 4) {
      context.moveTo(offset, 0);
      context.lineTo(offset + height, height);
    }
    context.stroke();
    context.restore();
  }

  if (effects.spotlight > 0) {
    const gradient = context.createRadialGradient(
      width / 2,
      height * 0.34,
      0,
      width / 2,
      height * 0.34,
      Math.max(width, height) * 0.62,
    );
    gradient.addColorStop(0, `rgb(255 255 255 / ${String(Math.round(effects.spotlight * 0.55))}%)`);
    gradient.addColorStop(1, "rgb(255 255 255 / 0%)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  if (effects.vignette > 0) {
    const gradient = context.createRadialGradient(
      width / 2,
      height * 0.45,
      Math.min(width, height) * 0.35,
      width / 2,
      height * 0.45,
      Math.max(width, height) * 0.78,
    );
    gradient.addColorStop(0, "rgb(0 0 0 / 0%)");
    gradient.addColorStop(1, `rgb(0 0 0 / ${String(Math.round(effects.vignette * 0.82))}%)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
}

/** Padding as four numbers, honouring the scene's linked flag. */
export function scenePadding(scene: SceneSettings): {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
} {
  return {
    top: scene.paddingTop,
    right: scene.paddingRight,
    bottom: scene.paddingBottom,
    left: scene.paddingLeft,
  };
}

/** Whether this frame style draws chrome around the media. */
export function frameInset(frame: FrameSettings): number {
  if (!frame.frameEnabled) return 0;
  switch (frame.frameId) {
    case "browser":
      return 10;
    case "glass":
      return 12;
    case "iphone":
    case "tablet":
      return 10;
    case "laptop":
    case "desktop":
      return 8;
    default:
      return 0;
  }
}
