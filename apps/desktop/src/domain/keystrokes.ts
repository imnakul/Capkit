import { z } from "zod";
import type { CursorEvent, KeyEvent } from "./cursorTrack";

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

export const keystrokeModes = ["shortcuts", "all"] as const;
export type KeystrokeMode = (typeof keystrokeModes)[number];

export const keystrokePositions = ["bottom", "top"] as const;
export type KeystrokePosition = (typeof keystrokePositions)[number];

export const keystrokeSettingsSchema = z.object({
  show: z.boolean(),
  /** "shortcuts" shows only Ctrl, Alt, and Win combinations; "all" adds named
   * keys such as Enter, Tab, and the arrows. Typed text is never shown. */
  mode: z.enum(keystrokeModes),
  position: z.enum(keystrokePositions),
  /** Percent of the default label size. */
  size: z.number(),
  /** Also labels mouse presses ("Left click") next to the keys. */
  clickLabels: z.boolean(),
});

export type KeystrokeSettings = z.infer<typeof keystrokeSettingsSchema>;

export const defaultKeystrokeSettings: KeystrokeSettings = {
  show: true,
  mode: "shortcuts",
  position: "bottom",
  size: 100,
  clickLabels: false,
};

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

/** Seconds a label stays on screen after its last press. */
export const keystrokeHoldSeconds = 1.2;
const fadeInSeconds = 0.08;
const fadeOutSeconds = 0.25;
/** More than this and the row starts covering the content being demonstrated. */
const maxVisibleLabels = 3;

/** A label to paint and how opaque it is at the current time. */
export type KeystrokeChip = { readonly label: string; readonly opacity: number };

/** A press reduced to its label, ready for display. */
export type KeystrokeEntry = { readonly time: number; readonly label: string };

/** "Win + Shift + S", in the order Windows itself writes shortcuts. */
export function keystrokeLabel(event: KeyEvent): string {
  const parts: string[] = [];
  if (event.meta) parts.push("Win");
  if (event.ctrl) parts.push("Ctrl");
  if (event.alt) parts.push("Alt");
  if (event.shift) parts.push("Shift");
  parts.push(event.key);
  return parts.join(" + ");
}

function isShown(event: KeyEvent, mode: KeystrokeMode): boolean {
  if (event.kind !== "key" || event.key === "") return false;
  if (mode === "all") return true;
  return event.ctrl || event.alt || event.meta;
}

const clickNames: Record<CursorEvent["button"], string> = {
  left: "Left click",
  right: "Right click",
  middle: "Middle click",
};

/**
 * Every press the overlay will label, sorted by time.
 *
 * Computed once per track and settings change rather than per frame; the
 * per-frame work is then a single pass over this list.
 */
export function keystrokeEntries(
  keys: readonly KeyEvent[],
  clicks: readonly CursorEvent[],
  settings: KeystrokeSettings,
): readonly KeystrokeEntry[] {
  const entries: KeystrokeEntry[] = keys
    .filter((event) => isShown(event, settings.mode))
    .map((event) => ({ time: event.time, label: keystrokeLabel(event) }));
  if (settings.clickLabels) {
    for (const click of clicks) {
      if (click.kind === "down") entries.push({ time: click.time, label: clickNames[click.button] });
    }
  }
  return entries.sort((left, right) => left.time - right.time);
}

/**
 * The labels visible at `time`, oldest first.
 *
 * Repeating the same press while its label is still up counts it ("Ctrl + Z
 * ×3") instead of stacking copies, which is what keeps undo runs and arrow-key
 * navigation readable.
 */
export function keystrokeChipsAt(entries: readonly KeystrokeEntry[], time: number): readonly KeystrokeChip[] {
  const groups: { label: string; first: number; last: number; count: number }[] = [];
  for (const entry of entries) {
    if (entry.time > time) break;
    const previous = groups.at(-1);
    if (previous?.label === entry.label && entry.time - previous.last < keystrokeHoldSeconds) {
      previous.last = entry.time;
      previous.count += 1;
    } else {
      groups.push({ label: entry.label, first: entry.time, last: entry.time, count: 1 });
    }
  }

  const chips: KeystrokeChip[] = [];
  for (const group of groups.slice(-maxVisibleLabels)) {
    const age = time - group.last;
    if (age >= keystrokeHoldSeconds) continue;
    const fadeIn = Math.min(1, (time - group.first) / fadeInSeconds);
    const fadeOut = Math.min(1, (keystrokeHoldSeconds - age) / fadeOutSeconds);
    chips.push({
      label: group.count > 1 ? `${group.label} ×${String(group.count)}` : group.label,
      opacity: Math.max(0, Math.min(fadeIn, fadeOut)),
    });
  }
  return chips;
}
