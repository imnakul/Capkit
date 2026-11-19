import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserLinkStatus } from "../../lib/tauri";
import { BrowserExtensionSettings, secondsUntil } from "./BrowserExtensionSettings";

const tauri = vi.hoisted(() => ({
  getBrowserLinkStatus: vi.fn(),
  setBrowserLinkEnabled: vi.fn(),
  startBrowserPairing: vi.fn(),
  cancelBrowserPairing: vi.fn(),
  forgetBrowser: vi.fn(),
  listenForBrowserLinkStatus: vi.fn(),
}));

vi.mock("../../lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/tauri")>()),
  ...tauri,
}));

const off: BrowserLinkStatus = { enabled: false, state: "off", port: null, error: null, connected: [], paired: [] };
const listening: BrowserLinkStatus = { ...off, enabled: true, state: "listening", port: 47811 };
const origin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

describe("BrowserExtensionSettings", () => {
  beforeEach(() => {
    tauri.getBrowserLinkStatus.mockResolvedValue(off);
    tauri.listenForBrowserLinkStatus.mockResolvedValue(() => undefined);
    tauri.cancelBrowserPairing.mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("starts off and turns the link on", async () => {
    tauri.setBrowserLinkEnabled.mockResolvedValue(listening);
    render(<BrowserExtensionSettings />);

    const toggle = await screen.findByRole("switch", { name: "Developer tools" });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Pair a browser" })).toBeNull();

    fireEvent.click(toggle);

    expect(tauri.setBrowserLinkEnabled).toHaveBeenCalledWith(true);
    expect(await screen.findByRole("button", { name: "Pair a browser" })).toBeVisible();
  });

  it("shows the pairing code with a countdown and cancels it", async () => {
    tauri.getBrowserLinkStatus.mockResolvedValue(listening);
    tauri.startBrowserPairing.mockResolvedValue({ code: "123456", expiresAt: new Date(Date.now() + 120_000).toISOString() });
    render(<BrowserExtensionSettings />);

    fireEvent.click(await screen.findByRole("button", { name: "Pair a browser" }));
    expect(await screen.findByText("123456")).toBeVisible();
    expect(screen.getByText(/Expires in 1[12]\d s/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(tauri.cancelBrowserPairing).toHaveBeenCalled();
    expect(screen.queryByText("123456")).toBeNull();
  });

  it("offers a new code once the old one has expired", async () => {
    tauri.getBrowserLinkStatus.mockResolvedValue(listening);
    tauri.startBrowserPairing.mockResolvedValue({ code: "654321", expiresAt: new Date(Date.now() - 1000).toISOString() });
    render(<BrowserExtensionSettings />);

    fireEvent.click(await screen.findByRole("button", { name: "Pair a browser" }));

    expect(await screen.findByText("That code expired.")).toBeVisible();
    expect(screen.getByRole("button", { name: "New pairing code" })).toBeVisible();
  });

  it("lists paired browsers and forgets one", async () => {
    const paired: BrowserLinkStatus = {
      ...listening,
      connected: [{ name: "Chrome", version: "130" }],
      paired: [{ origin, browser: { name: "Chrome", version: "130" }, pairedAt: "2026-11-19T00:00:00Z" }],
    };
    tauri.getBrowserLinkStatus.mockResolvedValue(paired);
    tauri.forgetBrowser.mockResolvedValue(listening);
    render(<BrowserExtensionSettings />);

    expect(await screen.findByText(/Connected · chrome-extension/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Forget Chrome" }));

    expect(tauri.forgetBrowser).toHaveBeenCalledWith(origin);
    await waitFor(() => expect(screen.queryByRole("list", { name: "Paired browsers" })).toBeNull());
  });

  it("reports a failure to switch on", async () => {
    tauri.setBrowserLinkEnabled.mockRejectedValue("SH-LINK-001: ports busy");
    render(<BrowserExtensionSettings />);

    const toggle = await screen.findByRole("switch", { name: "Developer tools" });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);

    expect(await screen.findByRole("alert")).toHaveTextContent("ports busy");
  });

  it("counts whole seconds and never goes negative", () => {
    expect(secondsUntil(new Date(10_500).toISOString(), 0)).toBe(11);
    expect(secondsUntil(new Date(0).toISOString(), 5000)).toBe(0);
    expect(secondsUntil("not a date", 0)).toBe(0);
  });
});
