import type { Annotation, AnnotationStyle, LineAnnotation, ShapeAnnotation } from "./annotations";
import { effectiveFillStyle, isPatternFill, newSketchSeed } from "./strokeGeometry";

type StyleKey = keyof AnnotationStyle;

const WATCHED_KEYS: readonly StyleKey[] = ["color", "strokeWidth", "strokeStyle", "sketchLevel", "fillStyle", "cornerRadius", "fontFamily", "fontSize"];

/** The style fields that differ between two strips, in a stable order. */
export function changedStyleKeys(previous: AnnotationStyle, next: AnnotationStyle): StyleKey[] {
  return WATCHED_KEYS.filter((key) => previous[key] !== next[key]);
}

/**
 * Applies the style fields that just changed on the strip to an existing annotation.
 * Returns null when none of them applies to this kind, so the caller can skip an empty undo step.
 */
export function restyleAnnotation(annotation: Annotation, next: AnnotationStyle, keys: readonly StyleKey[]): Annotation | null {
  let result: Annotation = annotation;
  for (const key of keys) result = applyKey(result, next, key);
  return result === annotation ? null : result;
}

function applyKey(annotation: Annotation, style: AnnotationStyle, key: StyleKey): Annotation {
  switch (annotation.kind) {
    case "line":
    case "arrow":
    case "curved-arrow":
      if (key === "color") return { ...annotation, color: style.color };
      if (key === "strokeWidth") return { ...annotation, strokeWidth: style.strokeWidth };
      return applyLineStyle(annotation, style, key);
    case "pencil":
    case "highlighter":
      if (key === "color") return { ...annotation, color: style.color };
      if (key === "strokeWidth") return { ...annotation, strokeWidth: annotation.kind === "highlighter" ? style.strokeWidth * 4 : style.strokeWidth };
      return annotation;
    case "rectangle":
    case "ellipse": {
      if (key === "color") {
        const solid = effectiveFillStyle(annotation.fillStyle, annotation.fill) === "solid";
        return { ...annotation, color: style.color, ...(solid ? { fill: style.color } : {}) };
      }
      if (key === "strokeWidth") return { ...annotation, strokeWidth: style.strokeWidth };
      if (key === "cornerRadius") {
        if (annotation.kind !== "rectangle") return annotation;
        return { ...without(annotation, ["cornerRadius"]), ...(style.cornerRadius > 0 ? { cornerRadius: style.cornerRadius } : {}) };
      }
      if (key === "fillStyle") {
        const rest = without(annotation, ["fillStyle"]);
        const seed = isPatternFill(style.fillStyle) ? { seed: annotation.seed ?? newSketchSeed() } : {};
        return {
          ...rest,
          fill: style.fillStyle === "solid" ? annotation.color : "transparent",
          ...(style.fillStyle === "none" ? {} : { fillStyle: style.fillStyle }),
          ...seed,
        };
      }
      return applyLineStyle(annotation, style, key);
    }
    case "spotlight":
    case "blur":
    case "pixelate":
    case "blackout":
      if (key === "color") return { ...annotation, color: style.color };
      if (key === "strokeWidth") return { ...annotation, intensity: style.strokeWidth };
      return annotation;
    case "text":
      if (key === "color") return { ...annotation, color: style.color };
      if (key === "fontFamily") return { ...annotation, fontFamily: style.fontFamily };
      if (key === "fontSize") return { ...annotation, fontSize: style.fontSize };
      return annotation;
    case "counter":
      return key === "color" ? { ...annotation, color: style.color } : annotation;
  }
}

/** A copy without the named optional fields; the result is still a valid T because they are optional. */
function without<T extends object>(value: T, keys: readonly string[]): T {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key))) as T; // Only optional fields are removed.
}

type LineStyled = LineAnnotation | ShapeAnnotation;

function applyLineStyle<T extends LineStyled>(annotation: T, style: AnnotationStyle, key: StyleKey): T {
  if (key === "strokeStyle") {
    const rest = without(annotation, ["strokeStyle", "sketchLevel"]);
    if (style.strokeStyle === "solid") return rest;
    const sketchy = style.strokeStyle === "sketchy";
    return {
      ...rest,
      strokeStyle: style.strokeStyle,
      ...(sketchy ? { seed: annotation.seed ?? newSketchSeed(), ...(style.sketchLevel === "loose" ? {} : { sketchLevel: style.sketchLevel }) } : {}),
    }; // Only optional fields were added.
  }
  if (key === "sketchLevel" && annotation.strokeStyle === "sketchy") {
    return { ...without(annotation, ["sketchLevel"]), ...(style.sketchLevel === "loose" ? {} : { sketchLevel: style.sketchLevel }) }; // Only an optional field changed.
  }
  return annotation;
}
