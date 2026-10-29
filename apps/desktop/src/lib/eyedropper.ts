import type { ColorFormat } from "../domain/capture";

export const EYEDROPPER_KEY = "I";

type EyedropperKeyEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey">;

/**
 * Maps a capture-overlay keypress to an eyedropper format, or null when it isn't an eyedropper press.
 * A configured capture-mode shortcut on `I` keeps priority while a selection can complete.
 */
export function eyedropperFormat(
  event: EyedropperKeyEvent,
  completionShortcuts: readonly string[],
  isCompletionReady: boolean,
): ColorFormat | null {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  if (event.key.toUpperCase() !== EYEDROPPER_KEY) return null;
  if (!event.shiftKey && isCompletionReady && completionShortcuts.includes(EYEDROPPER_KEY)) {
    return null;
  }
  return event.shiftKey ? "rgb" : "hex";
}
