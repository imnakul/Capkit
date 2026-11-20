import { accentSchema } from "@snaphub/devtools-protocol/protocol";

/** Storage key for CapKit's accent colour; the lime default applies until CapKit sends one. */
export const ACCENT_KEY = "capkitAccent";
export const DEFAULT_ACCENT = "#d9ff43";

/** The stored accent, or the default when none is stored or the value is invalid. */
export async function readAccent(): Promise<string> {
  try {
    const parsed = accentSchema.safeParse((await chrome.storage.local.get(ACCENT_KEY))[ACCENT_KEY]);
    return parsed.success ? parsed.data : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}
