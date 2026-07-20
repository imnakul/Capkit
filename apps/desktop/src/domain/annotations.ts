import type { Point, Rect } from "./capture";

export type ToolId =
  | "select"
  | "arrow"
  | "curved-arrow"
  | "line"
  | "rectangle"
  | "ellipse"
  | "highlighter"
  | "pencil"
  | "spotlight"
  | "counter"
  | "blur"
  | "pixelate"
  | "blackout"
  | "text";

export type AnnotationStyle = {
  color: string;
  fill: string;
  strokeWidth: number;
  opacity: number;
  fontFamily: string;
  fontSize: number;
  textContent: string;
};

type AnnotationBase = {
  id: string;
  opacity: number;
};

export type LineAnnotation = AnnotationBase & {
  kind: "line" | "arrow" | "curved-arrow" | "highlighter" | "pencil";
  points: readonly Point[];
  color: string;
  strokeWidth: number;
};

export type ShapeAnnotation = AnnotationBase & {
  kind: "rectangle" | "ellipse";
  bounds: Rect;
  color: string;
  fill: string;
  strokeWidth: number;
};

export type RegionAnnotation = AnnotationBase & {
  kind: "spotlight" | "blur" | "pixelate" | "blackout";
  bounds: Rect;
  color: string;
  intensity: number;
};

export type TextAnnotation = AnnotationBase & {
  kind: "text";
  position: Point;
  text: string;
  color: string;
  fontFamily: string;
  fontSize: number;
};

export type CounterAnnotation = AnnotationBase & {
  kind: "counter";
  position: Point;
  value: number;
  color: string;
  radius: number;
};

export type Annotation =
  | LineAnnotation
  | ShapeAnnotation
  | RegionAnnotation
  | TextAnnotation
  | CounterAnnotation;

export type AnnotationScene = {
  version: 1;
  elements: readonly Annotation[];
};

export const defaultAnnotationStyle: AnnotationStyle = {
  color: "#d9ff43",
  fill: "transparent",
  strokeWidth: 4,
  opacity: 1,
  fontFamily: "Caveat Variable",
  fontSize: 24,
  textContent: "Type your note",
};

export const emptyScene: AnnotationScene = { version: 1, elements: [] };

export type SceneHistory = {
  past: readonly AnnotationScene[];
  present: AnnotationScene;
  future: readonly AnnotationScene[];
};

export type SceneAction =
  | { type: "add"; annotation: Annotation }
  | { type: "update"; annotation: Annotation }
  | { type: "delete"; annotationId: string }
  | { type: "replace"; scene: AnnotationScene }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset" };

export const initialSceneHistory: SceneHistory = {
  past: [],
  present: emptyScene,
  future: [],
};

/** Maintains immutable scene history so every edit can be undone without touching source pixels. */
export function sceneHistoryReducer(state: SceneHistory, action: SceneAction): SceneHistory {
  switch (action.type) {
    case "add": {
      const next: AnnotationScene = {
        version: 1,
        elements: [...state.present.elements, action.annotation],
      };
      return { past: [...state.past, state.present], present: next, future: [] };
    }
    case "update": {
      const nextElements = state.present.elements.map((element) =>
        element.id === action.annotation.id ? action.annotation : element,
      );
      if (nextElements.every((element, index) => element === state.present.elements[index])) {
        return state;
      }
      return {
        past: [...state.past, state.present],
        present: { version: 1, elements: nextElements },
        future: [],
      };
    }
    case "delete": {
      const nextElements = state.present.elements.filter(
        (element) => element.id !== action.annotationId,
      );
      if (nextElements.length === state.present.elements.length) return state;
      return {
        past: [...state.past, state.present],
        present: { version: 1, elements: nextElements },
        future: [],
      };
    }
    case "replace":
      return {
        past: [...state.past, state.present],
        present: action.scene,
        future: [],
      };
    case "undo": {
      const previous = state.past.at(-1);
      if (previous === undefined) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      const next = state.future[0];
      if (next === undefined) return state;
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
    case "reset":
      return initialSceneHistory;
  }
}
