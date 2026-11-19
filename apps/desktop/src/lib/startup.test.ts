import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStartupState, presentStartupState, setStartupEnabled, type StartupState } from "./startup";

const tauri = vi.hoisted(() => ({ invoke: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(), isTauri: vi.fn(() => true) }));

vi.mock("@tauri-apps/api/core", () => tauri);

describe("presentStartupState", () => {
  it("lets CapKit change its own states", () => {
    expect(presentStartupState({ status: "enabled", managedBy: "package" })).toEqual({ isOn: true, canChange: true, notice: null, canOpenWindowsSettings: false });
    expect(presentStartupState({ status: "disabled", managedBy: "app" })).toEqual({ isOn: false, canChange: true, notice: null, canOpenWindowsSettings: false });
  });

  it("locks the switch and points to Windows when the user turned it off there", () => {
    const presentation = presentStartupState({ status: "disabled-by-user", managedBy: "package" });
    expect(presentation.isOn).toBe(false);
    expect(presentation.canChange).toBe(false);
    expect(presentation.canOpenWindowsSettings).toBe(true);
    expect(presentation.notice).toMatch(/Settings › Apps › Startup/);
  });

  it.each<[StartupState["status"], boolean]>([
    ["disabled-by-policy", false],
    ["enabled-by-policy", true],
  ])("locks the switch under %s", (status, isOn) => {
    expect(presentStartupState({ status, managedBy: "package" })).toEqual({
      isOn,
      canChange: false,
      notice: "Your organization manages this setting.",
      canOpenWindowsSettings: false,
    });
  });
});

describe("startup IPC", () => {
  beforeEach(() => {
    tauri.invoke.mockReset();
    tauri.isTauri.mockReturnValue(true);
  });

  it("validates the native state", async () => {
    tauri.invoke.mockResolvedValueOnce({ status: "disabled-by-user", managedBy: "package" });
    await expect(getStartupState()).resolves.toEqual({ status: "disabled-by-user", managedBy: "package" });
    expect(tauri.invoke).toHaveBeenCalledWith("get_startup_state");
  });

  it("rejects an unknown native state", async () => {
    tauri.invoke.mockResolvedValueOnce({ status: "maybe", managedBy: "package" });
    await expect(getStartupState()).rejects.toThrow();
  });

  it("returns the state Windows settled on, not the request", async () => {
    tauri.invoke.mockResolvedValueOnce({ status: "disabled-by-user", managedBy: "package" });
    await expect(setStartupEnabled(true)).resolves.toEqual({ status: "disabled-by-user", managedBy: "package" });
    expect(tauri.invoke).toHaveBeenCalledWith("set_startup_enabled", { enabled: true });
  });

  it("echoes the request outside the desktop shell", async () => {
    tauri.isTauri.mockReturnValue(false);
    await expect(setStartupEnabled(true)).resolves.toEqual({ status: "enabled", managedBy: "app" });
    expect(tauri.invoke).not.toHaveBeenCalled();
  });
});
