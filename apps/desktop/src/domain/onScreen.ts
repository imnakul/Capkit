import { z } from "zod";
import { pointSchema, type Point, type Rect } from "./capture";

const onScreenObjectBaseSchema = z.object({
  id: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  size: z.number().positive().max(120),
});

export const onScreenObjectSchema = z.discriminatedUnion("kind", [
  onScreenObjectBaseSchema.extend({
    kind: z.literal("pencil"),
    points: z.array(pointSchema).min(1),
  }),
  onScreenObjectBaseSchema.extend({
    kind: z.enum(["rectangle", "ellipse", "arrow", "blur"]),
    start: pointSchema,
    end: pointSchema,
  }),
  onScreenObjectBaseSchema.extend({
    kind: z.literal("text"),
    position: pointSchema,
    text: z.string().min(1).max(2_000),
  }),
]);

const persistedOnScreenSceneSchema = z.array(onScreenObjectSchema).max(1_000);

export type OnScreenShapeObject = {
  id: string;
  kind: "rectangle" | "ellipse" | "arrow" | "blur";
  color: string;
  size: number;
  start: Point;
  end: Point;
};

export type OnScreenObject =
  | {
      id: string;
      kind: "pencil";
      color: string;
      size: number;
      points: readonly Point[];
    }
  | OnScreenShapeObject
  | {
      id: string;
      kind: "text";
      color: string;
      size: number;
      position: Point;
      text: string;
    };

export type OnScreenHistory = {
  past: readonly (readonly OnScreenObject[])[];
  present: readonly OnScreenObject[];
  future: readonly (readonly OnScreenObject[])[];
};

export type OnScreenHistoryAction =
  | { type: "commit"; object: OnScreenObject }
  | { type: "replace"; objects: readonly OnScreenObject[] }
  | { type: "remove"; id: string }
  | { type: "clear" }
  | { type: "undo" }
  | { type: "redo" };

export const initialOnScreenHistory: OnScreenHistory = {
  past: [],
  present: [],
  future: [],
};

export function parsePersistedOnScreenScene(raw: string | null): readonly OnScreenObject[] {
  if (raw === null) return [];
  try {
    const decoded: unknown = JSON.parse(raw);
    return persistedOnScreenSceneSchema.parse(decoded);
  } catch {
    return [];
  }
}

export function onScreenHistoryReducer(
  state: OnScreenHistory,
  action: OnScreenHistoryAction,
): OnScreenHistory {
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    if (previous === undefined) return state;
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future],
    };
  }
  if (action.type === "redo") {
    const next = state.future[0];
    if (next === undefined) return state;
    return {
      past: [...state.past, state.present],
      present: next,
      future: state.future.slice(1),
    };
  }

  const next =
    action.type === "commit"
      ? [...state.present, action.object]
      : action.type === "replace"
        ? action.objects
        : action.type === "remove"
          ? state.present.filter((object) => object.id !== action.id)
          : [];
  if (objectsMatch(state.present, next)) return state;
  return {
    past: [...state.past, state.present],
    present: next,
    future: [],
  };
}

export function normalizedObjectRect(
  object: OnScreenShapeObject,
): Rect {
  return {
    x: Math.min(object.start.x, object.end.x),
    y: Math.min(object.start.y, object.end.y),
    width: Math.abs(object.end.x - object.start.x),
    height: Math.abs(object.end.y - object.start.y),
  };
}

export function objectAtPoint(
  objects: readonly OnScreenObject[],
  point: Point,
  tolerance = 12,
): OnScreenObject | null {
  for (const object of [...objects].reverse()) {
    if (object.kind === "text") {
      const width = Math.max(48, object.text.length * object.size * 0.58);
      if (
        point.x >= object.position.x - tolerance &&
        point.x <= object.position.x + width + tolerance &&
        point.y >= object.position.y - object.size - tolerance &&
        point.y <= object.position.y + tolerance
      ) {
        return object;
      }
      continue;
    }
    if (object.kind === "pencil") {
      if (object.points.some((sample) => distance(sample, point) <= tolerance + object.size)) {
        return object;
      }
      continue;
    }
    const rect = normalizedObjectRect(object);
    if (
      point.x >= rect.x - tolerance &&
      point.x <= rect.x + rect.width + tolerance &&
      point.y >= rect.y - tolerance &&
      point.y <= rect.y + rect.height + tolerance
    ) {
      return object;
    }
  }
  return null;
}

export function pointsToSvgPath(points: readonly Point[]): string {
  const first = points[0];
  if (first === undefined) return "";
  if (points.length === 1) return `M ${String(first.x)} ${String(first.y)} L ${String(first.x + 0.01)} ${String(first.y + 0.01)}`;
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${String(point.x)} ${String(point.y)}`)
    .join(" ");
}

function objectsMatch(
  left: readonly OnScreenObject[],
  right: readonly OnScreenObject[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((object, index) => object === right[index]);
}

function distance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
