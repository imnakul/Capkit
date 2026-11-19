import { invoke, isTauri } from "@tauri-apps/api/core";
import { z } from "zod";

/**
 * Open-at-sign-in state from the native side. `managedBy: "package"` is the
 * Store build's MSIX startup task; `"app"` is the sign-in entry CapKit writes
 * itself in the unpackaged build.
 */
export const startupStateSchema = z.object({
  status: z.enum(["enabled", "disabled", "disabled-by-user", "disabled-by-policy", "enabled-by-policy"]),
  managedBy: z.enum(["package", "app"]),
});

export type StartupState = z.infer<typeof startupStateSchema>;

export type StartupPresentation = {
  isOn: boolean;
  canChange: boolean;
  /** Why the switch is locked, or null when CapKit controls it. */
  notice: string | null;
  canOpenWindowsSettings: boolean;
};

/**
 * Maps a startup state to what the Settings switch shows. Windows only lets
 * the user undo a "turned off in Windows" choice from Windows itself, and a
 * policy state cannot be changed at all, so both lock the switch.
 */
export function presentStartupState(state: StartupState): StartupPresentation {
  switch (state.status) {
    case "enabled":
      return { isOn: true, canChange: true, notice: null, canOpenWindowsSettings: false };
    case "disabled":
      return { isOn: false, canChange: true, notice: null, canOpenWindowsSettings: false };
    case "disabled-by-user":
      return {
        isOn: false,
        canChange: false,
        notice: "Turned off in Windows. Turn CapKit back on in Settings › Apps › Startup.",
        canOpenWindowsSettings: true,
      };
    case "disabled-by-policy":
      return { isOn: false, canChange: false, notice: "Your organization manages this setting.", canOpenWindowsSettings: false };
    case "enabled-by-policy":
      return { isOn: true, canChange: false, notice: "Your organization manages this setting.", canOpenWindowsSettings: false };
  }
}

export async function getStartupState(): Promise<StartupState> {
  if (!isTauri()) return { status: "disabled", managedBy: "app" };
  const raw: unknown = await invoke("get_startup_state");
  return startupStateSchema.parse(raw);
}

/** Resolves with the resulting state, which can differ from the request. */
export async function setStartupEnabled(enabled: boolean): Promise<StartupState> {
  if (!isTauri()) return { status: enabled ? "enabled" : "disabled", managedBy: "app" };
  const raw: unknown = await invoke("set_startup_enabled", { enabled });
  return startupStateSchema.parse(raw);
}

export async function openStartupSettings(): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_startup_settings");
}
