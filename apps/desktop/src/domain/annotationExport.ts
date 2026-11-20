import type { Annotation, AnnotationScene } from "./annotations";
import {
  needsStrokeGeometry,
  shapeStrokeGeometry,
  type StrokeGeometry,
  type StrokeGeometryInput,
} from "./strokeGeometry";

/** An annotation as sent to the export renderer, with its computed geometry when it has a style. */
export type ExportAnnotation = Annotation & { strokeGeometry?: StrokeGeometry };

export type ExportScene = { version: 1; elements: readonly ExportAnnotation[] };

function isGeometryAnnotation(annotation: Annotation): annotation is Annotation & StrokeGeometryInput {
  switch (annotation.kind) {
    case "line":
    case "arrow":
    case "curved-arrow":
    case "rectangle":
    case "ellipse":
      return true;
    default:
      return false;
  }
}

/**
 * Attaches the shared stroke geometry to every dashed, dotted, sketchy or rounded
 * annotation so the Rust renderer draws exactly the points the canvas drew.
 * Solid, square annotations are sent unchanged and keep the original render path.
 */
export function sceneForExport(scene: AnnotationScene): ExportScene {
  return {
    version: scene.version,
    elements: scene.elements.map((annotation): ExportAnnotation => {
      if (!isGeometryAnnotation(annotation) || !needsStrokeGeometry(annotation)) return annotation;
      return { ...annotation, strokeGeometry: shapeStrokeGeometry(annotation) };
    }),
  };
}
