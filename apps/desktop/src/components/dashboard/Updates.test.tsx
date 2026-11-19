import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSnaphubSettings } from "../../domain/settings";
import type { UpdateStatus } from "../../domain/updates";
import { DashboardPanel } from "./DashboardPanel";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn(() => Promise.resolve("0.3.0")) }));

const mocks = vi.hoisted(() => ({
  autoCheck: vi.fn<() => Promise<UpdateStatus>>(),
  check: vi.fn<() => Promise<UpdateStatus>>(),
  install: vi.fn<() => Promise<UpdateStatus>>(),
  current: vi.fn<() => Promise<UpdateStatus>>(),
  emit: { handler: null as ((status: UpdateStatus) => void) | null },
}));

vi.mock("../../lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/tauri")>()),
  autoCheckForUpdate: mocks.autoCheck,
  checkForUpdate: mocks.check,
  installUpdate: mocks.install,
  getUpdateStatus: mocks.current,
  listenForUpdateStatus: (handler: (status: UpdateStatus) => void): Promise<() => void> => {
    mocks.emit.handler = handler;
    return Promise.resolve((): void => undefined);
  },
}));

const available: UpdateStatus = { state: "available", currentVersion: "0.3.0", version: "0.4.0", notes: null };

function openSettings(): void {
  fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));
  fireEvent.click(screen.getByRole("button", { name: /Keep CapKit current/ }));
}

describe("updates in the dashboard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.autoCheck.mockResolvedValue({ state: "idle" });
    mocks.check.mockResolvedValue({ state: "up-to-date", currentVersion: "0.3.0" });
    mocks.install.mockResolvedValue({ state: "installing", version: "0.4.0", percent: 0 });
    mocks.current.mockResolvedValue({ state: "idle" });
  });

  afterEach(() => {
    cleanup();
    for (const mock of [mocks.autoCheck, mocks.check, mocks.install, mocks.current]) mock.mockReset();
    mocks.emit.handler = null;
  });

  it("runs the launch check once when auto-check is on", async () => {
    render(<DashboardPanel />);
    await waitFor(() => expect(mocks.autoCheck).toHaveBeenCalledOnce());
  });

  it("runs no launch check when auto-check is off, but the button still works", async () => {
    window.localStorage.setItem(
      "snaphub.settings.v1",
      JSON.stringify({ ...defaultSnaphubSettings, updates: { autoCheck: false } }),
    );
    render(<DashboardPanel />);
    openSettings();
    expect(mocks.autoCheck).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("You're on the latest version (v0.3.0).")).toBeVisible();
    expect(mocks.check).toHaveBeenCalledOnce();
  });

  it("shows the sidebar notice and installs on click when an update is available", async () => {
    render(<DashboardPanel />);
    await waitFor(() => expect(mocks.emit.handler).not.toBeNull());
    act(() => mocks.emit.handler?.(available));

    expect(await screen.findByText("Update available: v0.4.0")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Install and restart" }));
    await waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
  });

  it("shows download progress with the button disabled", async () => {
    render(<DashboardPanel />);
    await waitFor(() => expect(mocks.emit.handler).not.toBeNull());
    act(() => mocks.emit.handler?.({ state: "installing", version: "0.4.0", percent: 42 }));

    expect(await screen.findByText("Downloading… 42%")).toBeVisible();
    expect(screen.getByRole("button", { name: "Install and restart" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("explains the guard when a capture or recording is active", async () => {
    mocks.install.mockRejectedValueOnce(new Error("SH-UPDATE-001: Finish your capture or recording first."));
    render(<DashboardPanel />);
    await waitFor(() => expect(mocks.emit.handler).not.toBeNull());
    act(() => mocks.emit.handler?.(available));

    fireEvent.click(await screen.findByRole("button", { name: "Install and restart" }));
    expect(await screen.findByText("Finish your capture or recording first.")).toBeVisible();
  });

  it("offers Try again after a failed install", async () => {
    render(<DashboardPanel />);
    await waitFor(() => expect(mocks.emit.handler).not.toBeNull());
    act(() =>
      mocks.emit.handler?.({
        state: "error",
        currentVersion: "0.3.0",
        message: "Update failed. CapKit is still on v0.3.0.",
      }),
    );

    expect(await screen.findByText("Update failed. CapKit is still on v0.3.0.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("shows only the Store message in a packaged build", async () => {
    mocks.current.mockResolvedValue({ state: "unsupported" });
    render(<DashboardPanel />);
    openSettings();

    expect(await screen.findByText("Updates come from the Microsoft Store.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Check for updates" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Check for updates automatically" })).toBeNull();
  });
});
