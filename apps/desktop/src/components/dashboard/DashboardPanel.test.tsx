import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPanel } from "./DashboardPanel";

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(() => Promise.resolve("0.2.0")),
}));

describe("DashboardPanel", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("shows the app version and commit in the sidebar", async () => {
    render(<DashboardPanel />);

    expect(await screen.findByText(/v0\.2\.0 ·/)).toBeVisible();
  });

  it("opens on the saved captures dashboard", async () => {
    render(<DashboardPanel />);

    expect(await screen.findByRole("heading", { name: "Saved captures" })).toBeVisible();
    expect(screen.getByText("Only images explicitly saved by Capkit appear here. Clipboard-only captures stay private and unindexed.")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Capkit sections" })).toBeVisible();
  });

  it("no longer offers a Cloud section", () => {
    render(<DashboardPanel />);

    expect(screen.queryByRole("button", { name: "Open Cloud" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open Record" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Open Studio" })).toBeVisible();
  });

  it("opens the recorder and the studio", async () => {
    render(<DashboardPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Open Record" }));
    expect(await screen.findByRole("heading", { name: "Capture your screen." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Open the recorder" })).toBeVisible();
    expect(screen.queryByText("Saved captures")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Studio" }));
    // With no recordings yet, Studio explains how to get one rather than
    // showing an editor with nothing in it.
    expect(await screen.findByRole("heading", { name: "Nothing to edit yet" })).toBeVisible();
  });

  it("opens the Showcase studio", async () => {
    render(<DashboardPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Open Showcase" }));

    expect(await screen.findByRole("heading", { name: "Showcase studio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import media from this computer" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Show Background controls" })).toBeVisible();
  });

  it("limits the quick palette to five selected colors", () => {
    render(<DashboardPanel />);
    openSettings();

    expect(screen.getByText("5 / 5 selected")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add #39ff88" })).toBeDisabled();
  });

  it("switches the complete dashboard to dark mode", () => {
    render(<DashboardPanel />);
    openSettings();

    fireEvent.click(screen.getByRole("button", { name: "Use dark mode" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Use dark mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows a color marker for every default-color option", () => {
    render(<DashboardPanel />);
    openSettings();

    fireEvent.click(screen.getByRole("button", { name: "Default annotation color" }));

    const colorList = screen.getByRole("listbox", { name: "Available annotation colors" });
    expect(within(colorList).getAllByRole("option")).toHaveLength(5);
    expect(within(colorList).getByRole("option", { name: "#D9FF43" })).toBeVisible();
  });

  it("provides a reset action for every settings section", () => {
    render(<DashboardPanel />);
    openSettings();

    expect(screen.getAllByRole("button", { name: "Reset this section" })).toHaveLength(9);
  });

  it("provides inline resets for overlay tint and individual shortcuts", () => {
    render(<DashboardPanel />);
    openSettings();

    expect(screen.getByRole("button", { name: "Reset overlay tint" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Start capture shortcut" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Capture & copy shortcut" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Capture & save shortcut" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Copy & Save selection shortcut" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Toggle on-screen toolbar shortcut" })).toBeDisabled();
  });

  it("configures unique number keys for on-screen tools", () => {
    render(<DashboardPanel />);
    openSettings();

    const pencil = screen.getByRole("combobox", { name: "Shortcut for Pencil" });
    const rectangle = screen.getByRole("combobox", { name: "Shortcut for Rectangle" });
    expect(pencil).toHaveValue("1");
    expect(rectangle).toHaveValue("2");

    fireEvent.change(rectangle, { target: { value: "1" } });

    expect(rectangle).toHaveValue("1");
    expect(pencil).toHaveValue("");
  });

  it("keeps on-screen drawing appearance in Settings instead of the live dock", () => {
    render(<DashboardPanel />);
    openSettings();

    const strokeSize = screen.getByRole("slider", { name: "On-screen stroke width" });
    const spotlightSize = screen.getByRole("slider", { name: "On-screen spotlight size" });
    expect(strokeSize).toHaveValue("4");
    expect(spotlightSize).toHaveValue("180");

    fireEvent.change(strokeSize, { target: { value: "7" } });
    fireEvent.change(spotlightSize, { target: { value: "260" } });

    expect(strokeSize).toHaveValue("7");
    expect(spotlightSize).toHaveValue("260");
  });

  it("lets users preserve Screen Draw annotations between toggles", () => {
    render(<DashboardPanel />);
    openSettings();

    const persistence = screen.getByRole("switch", {
      name: "Keep drawings between toggles",
    });
    expect(persistence).not.toBeChecked();
    fireEvent.click(persistence);
    expect(persistence).toBeChecked();
  });

  it("keeps the desktop live under Screen Draw by default", () => {
    render(<DashboardPanel />);
    openSettings();

    const liveDesktop = screen.getByRole("switch", {
      name: "Keep desktop live",
    });
    expect(liveDesktop).toBeChecked();
    fireEvent.click(liveDesktop);
    expect(liveDesktop).not.toBeChecked();
  });

  it("lets users choose whether scrolling starts automatically or asks first", () => {
    render(<DashboardPanel />);
    openSettings();

    expect(screen.getByRole("radio", { name: "Use Automatic scrolling capture" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Use Always ask scrolling capture" }));
    expect(screen.getByRole("radio", { name: "Use Always ask scrolling capture" })).toHaveAttribute("aria-checked", "true");
  });

  it("leaves shortcut recording mode when its inline reset is pressed", () => {
    render(<DashboardPanel />);
    openSettings();

    const configureShortcut = screen.getByRole("button", { name: "Configure Start capture" });
    const resetShortcut = screen.getByRole("button", { name: "Reset Start capture shortcut" });

    fireEvent.click(configureShortcut);
    expect(configureShortcut).toHaveTextContent("Press shortcut…");
    expect(resetShortcut).toBeEnabled();

    fireEvent.click(resetShortcut);
    expect(configureShortcut).toHaveTextContent("Alt+Shift+S");
    expect(configureShortcut).toHaveAttribute("aria-pressed", "false");
  });

  it("leaves shortcut recording mode when the shortcuts section is reset", () => {
    render(<DashboardPanel />);
    openSettings();

    const configureShortcut = screen.getByRole("button", { name: "Configure Start capture" });
    const shortcutsHeading = screen.getByRole("heading", { name: "Shortcuts" });
    const shortcutsSection = shortcutsHeading.closest("section");
    if (shortcutsSection === null) throw new Error("Shortcuts heading must be inside a section");

    fireEvent.click(configureShortcut);
    fireEvent.click(within(shortcutsSection).getByRole("button", { name: "Reset this section" }));

    expect(configureShortcut).toHaveTextContent("Alt+Shift+S");
    expect(configureShortcut).toHaveAttribute("aria-pressed", "false");
  });

  it("records and resets the Copy & Save selection shortcut", () => {
    render(<DashboardPanel />);
    openSettings();

    const configure = screen.getByRole("button", { name: "Configure Copy & Save selection" });
    expect(configure).toHaveTextContent("A");
    fireEvent.click(configure);
    fireEvent.keyDown(window, { key: "d" });
    expect(configure).toHaveTextContent("D");

    fireEvent.click(screen.getByRole("button", { name: "Reset Copy & Save selection shortcut" }));
    expect(configure).toHaveTextContent("A");
  });

  it("rejects a completion shortcut collision and preserves prior values", () => {
    render(<DashboardPanel />);
    openSettings();

    const configure = screen.getByRole("button", { name: "Configure Copy & Save selection" });
    fireEvent.click(configure);
    fireEvent.keyDown(window, { key: "c" });

    expect(configure).toHaveTextContent("A");
    expect(configure).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText("That key is already used by Copy selection. Choose another key."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Configure Copy selection" })).toHaveTextContent("C");
  });

  it("keeps recording a completion shortcut while a modifier is held", () => {
    render(<DashboardPanel />);
    openSettings();

    const configure = screen.getByRole("button", { name: "Configure Copy & Save selection" });
    fireEvent.click(configure);
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });

    expect(configure).toHaveTextContent("Press shortcut…");
    expect(configure).toHaveAttribute("aria-pressed", "true");
  });
});

function openSettings(): void {
  fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));
}
