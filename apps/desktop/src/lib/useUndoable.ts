import { useCallback, useRef, useState } from "react";

type History<T> = {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
};

/** How many steps back the studio remembers. */
const historyLimit = 60;

/** Consecutive edits to the same control inside this window collapse into one. */
const mergeWindowMs = 500;

export type Undoable<T> = {
  readonly value: T;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /**
   * Records a new value.
   *
   * `mergeKey` names the control being edited: dragging a slider fires dozens
   * of updates, and collapsing same-key edits keeps one undo step per gesture
   * instead of one per pixel.
   */
  readonly update: (next: T | ((current: T) => T), mergeKey?: string) => void;
  /** Replaces the value and keeps it undoable, used by resets and presets. */
  readonly replace: (next: T) => void;
  readonly undo: () => void;
  readonly redo: () => void;
};

/**
 * Editable state with undo and redo.
 *
 * Non-destructive editing is only comfortable when it can be walked back, so
 * the whole composition lives here as one immutable snapshot per step.
 */
export function useUndoable<T>(initial: T): Undoable<T> {
  const [history, setHistory] = useState<History<T>>({ past: [], present: initial, future: [] });
  const lastEdit = useRef<{ key: string; at: number }>({ key: "", at: 0 });

  const commit = useCallback((next: T | ((current: T) => T), mergeKey: string): void => {
    const now = Date.now();
    const merge = mergeKey !== "" && lastEdit.current.key === mergeKey && now - lastEdit.current.at < mergeWindowMs;
    lastEdit.current = { key: mergeKey, at: now };
    setHistory((current) => {
      const value = typeof next === "function" ? (next as (previous: T) => T)(current.present) : next;
      if (Object.is(value, current.present)) return current;
      if (merge) return { past: current.past, present: value, future: [] };
      return { past: [...current.past, current.present].slice(-historyLimit), present: value, future: [] };
    });
  }, []);

  const update = useCallback(
    (next: T | ((current: T) => T), mergeKey = ""): void => {
      commit(next, mergeKey);
    },
    [commit],
  );

  const replace = useCallback(
    (next: T): void => {
      commit(next, "");
    },
    [commit],
  );

  const undo = useCallback((): void => {
    lastEdit.current = { key: "", at: 0 };
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (previous === undefined) return current;
      return { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] };
    });
  }, []);

  const redo = useCallback((): void => {
    lastEdit.current = { key: "", at: 0 };
    setHistory((current) => {
      const next = current.future.at(0);
      if (next === undefined) return current;
      return { past: [...current.past, current.present], present: next, future: current.future.slice(1) };
    });
  }, []);

  return {
    value: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    update,
    replace,
    undo,
    redo,
  };
}
