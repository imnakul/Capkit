import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DashboardPanel } from "./DashboardPanel";

describe("DashboardPanel", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("opens on the saved captures dashboard", async () => {
    render(<DashboardPanel />);

    expect(await screen.findByRole("heading", { name: "Saved captures" })).toBeVisible();
    expect(screen.getByText("Only images explicitly saved by CapKit appear here. Clipboard-only captures stay private and unindexed.")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "CapKit sections" })).toBeVisible();
  });

  it("shows centered coming-soon states for unfinished product areas", () => {
    render(<DashboardPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Open Cloud" }));

    const cloudState = screen.getByRole("region", { name: "Cloud coming soon" });
    expect(within(cloudState).getByText("Cloud")).toBeVisible();
    expect(within(cloudState).getByRole("heading", { name: "Coming Soon..." })).toBeVisible();
    expect(screen.queryByText("Saved captures")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Showcase" }));

    const showcaseState = screen.getByRole("region", { name: "Showcase coming soon" });
    expect(within(showcaseState).getByText("Showcase")).toBeVisible();
    expect(within(showcaseState).getByRole("heading", { name: "Coming Soon..." })).toBeVisible();
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

    expect(screen.getAllByRole("button", { name: "Reset this section" })).toHaveLength(8);
  });

  it("provides inline resets for overlay tint and individual shortcuts", () => {
    render(<DashboardPanel />);
    openSettings();

    expect(screen.getByRole("button", { name: "Reset overlay tint" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Start capture shortcut" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Capture & copy shortcut" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Capture & save shortcut" })).toBeDisabled();
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
});

function openSettings(): void {
  fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));
}
