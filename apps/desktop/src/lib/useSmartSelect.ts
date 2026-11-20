import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CaptureSession, DetectedTarget, Point, Rect } from "../domain/capture";
import { isUsableSmartTarget, rectDisplayToSelection, selectionToDisplay } from "../domain/smartSelect";
import { detectTargets } from "./tauri";
import { createVisualTargetDetector, type VisualTargetDetector } from "./visualTargets";

/** Quiet period before asking Windows UI Automation, so a sweeping pointer sends few requests. */
const UIA_DEBOUNCE_MS = 40;

type SmartSelectOptions = {
  session: CaptureSession | null;
  selection: Rect | null;
  /** Smart select is the active tool; nothing is analysed otherwise. */
  active: boolean;
  /** Settings > Detection: UI Automation is only queried when the user turned UI regions on. */
  uiRegions: boolean;
  windows: boolean;
};

export type SmartSelect = {
  /** Candidate box in selection-local coordinates, or null when nothing is under the pointer. */
  target: Rect | null;
  /** Changes only when the candidate does; keys the ghost outline's fade-in. */
  targetId: string | null;
  /** Report the pointer (selection-local) or null when it leaves. */
  hover: (point: Point | null) => void;
};

function smallestContaining(targets: readonly DetectedTarget[], point: Point, selection: Rect): DetectedTarget | null {
  let best: DetectedTarget | null = null;
  for (const target of targets) {
    const { bounds } = target;
    const contains = point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
    if (!contains || !isUsableSmartTarget(target, selection)) continue;
    if (best === null || bounds.width * bounds.height < best.bounds.width * best.bounds.height) best = target;
  }
  return best;
}

/**
 * Finds the element under the pointer for the Smart select tool. Pixel analysis of the frozen
 * snapshot is always available (built lazily, even when the Detection setting is off); UI
 * Automation is added only when `uiRegions` is on, with one request in flight and a 40 ms debounce.
 */
export function useSmartSelect({ session, selection, active, uiRegions, windows }: SmartSelectOptions): SmartSelect {
  const [candidate, setCandidate] = useState<DetectedTarget | null>(null);
  const detector = useRef<VisualTargetDetector | null>(null);
  const selectionRef = useRef(selection);
  const frame = useRef<number | null>(null);
  const pendingPoint = useRef<Point | null>(null);
  const uiaTimer = useRef<number | null>(null);
  const uiaInFlight = useRef(false);
  const uiaSequence = useRef(0);
  const uiaPoint = useRef<Point | null>(null);
  const optionsRef = useRef({ uiRegions, windows });

  useEffect(() => {
    selectionRef.current = selection;
    optionsRef.current = { uiRegions, windows };
  }, [selection, uiRegions, windows]);

  useEffect(() => {
    detector.current = null;
    if (!active || session === null || session.snapshotUrl === "") return;
    let cancelled = false;
    void createVisualTargetDetector(session.snapshotUrl, session.display.bounds)
      .then((created) => {
        if (!cancelled) detector.current = created;
      })
      .catch(() => {
        // Pixels may not be readable from the asset protocol; UI Automation can still answer.
      });
    return (): void => {
      cancelled = true;
    };
  }, [active, session]);

  const cancelPending = useCallback((): void => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    if (uiaTimer.current !== null) window.clearTimeout(uiaTimer.current);
    frame.current = null;
    uiaTimer.current = null;
    pendingPoint.current = null;
    uiaPoint.current = null;
    uiaSequence.current += 1;
  }, []);

  useEffect(() => {
    if (active) return;
    cancelPending();
    setCandidate(null);
  }, [active, cancelPending]);

  useEffect(() => cancelPending, [cancelPending]);

  const queryUiAutomation = useCallback((displayPoint: Point): void => {
    if (session === null) return;
    uiaPoint.current = displayPoint;
    if (uiaTimer.current !== null) window.clearTimeout(uiaTimer.current);
    uiaTimer.current = window.setTimeout((): void => {
      uiaTimer.current = null;
      const point = uiaPoint.current;
      const currentSelection = selectionRef.current;
      if (point === null || currentSelection === null || uiaInFlight.current) return;
      uiaPoint.current = null;
      uiaInFlight.current = true;
      const sequence = uiaSequence.current + 1;
      uiaSequence.current = sequence;
      void detectTargets(point, session.display, true)
        .then((targets) => {
          if (sequence !== uiaSequence.current) return;
          const allowed = optionsRef.current.windows ? targets : targets.filter((target) => target.kind !== "window");
          const found = smallestContaining(allowed, point, currentSelection);
          if (found !== null) setCandidate((previous) => (previous?.id === found.id ? previous : found));
        })
        .catch((error: unknown) => console.error("SH-SMART-UIA-001", error))
        .finally(() => {
          uiaInFlight.current = false;
          if (uiaPoint.current !== null) queryUiAutomation(uiaPoint.current);
        });
    }, UIA_DEBOUNCE_MS);
  }, [session]);

  const hover = useCallback((point: Point | null): void => {
    if (point === null) {
      cancelPending();
      setCandidate(null);
      return;
    }
    pendingPoint.current = point;
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame((): void => {
      frame.current = null;
      const local = pendingPoint.current;
      const currentSelection = selectionRef.current;
      if (local === null || currentSelection === null) return;
      const displayPoint = selectionToDisplay(local, currentSelection);
      const visual = detector.current?.targetAt(displayPoint) ?? null;
      const usable = visual !== null && isUsableSmartTarget(visual, currentSelection) ? visual : null;
      setCandidate((previous) => (previous?.id === usable?.id ? previous : usable));
      if (optionsRef.current.uiRegions) queryUiAutomation(displayPoint);
    });
  }, [cancelPending, queryUiAutomation]);

  const target = useMemo(
    () => (candidate === null || selection === null ? null : rectDisplayToSelection(candidate.bounds, selection)),
    [candidate, selection],
  );

  return { target, targetId: candidate?.id ?? null, hover };
}
