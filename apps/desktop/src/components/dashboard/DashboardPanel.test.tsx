import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DashboardPanel } from "./DashboardPanel";

describe("DashboardPanel", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("opens on the settings workspace", () => {
    render(<DashboardPanel />);

    expect(screen.getByRole("heading", { name: "Make capture feel like yours" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "ShotHub sections" })).toBeVisible();
  });

  it("keeps unfinished product areas intentionally empty", () => {
    render(<DashboardPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Open Dashboard" }));

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    expect(screen.queryByText("Make capture feel like yours")).not.toBeInTheDocument();
  });

  it("limits the quick palette to five selected colors", () => {
    render(<DashboardPanel />);

    expect(screen.getByText("5 / 5 selected")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add #39ff88" })).toBeDisabled();
  });

  it("switches the complete dashboard to dark mode", () => {
    render(<DashboardPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Use dark mode" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Use dark mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows a color marker for every default-color option", () => {
    render(<DashboardPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Default annotation color" }));

    const colorList = screen.getByRole("listbox", { name: "Available annotation colors" });
    expect(within(colorList).getAllByRole("option")).toHaveLength(5);
    expect(within(colorList).getByRole("option", { name: "#D9FF43" })).toBeVisible();
  });

  it("provides a reset action for every settings section", () => {
    render(<DashboardPanel />);

    expect(screen.getAllByRole("button", { name: "Reset this section" })).toHaveLength(6);
  });

  it("provides inline resets for overlay tint and individual shortcuts", () => {
    render(<DashboardPanel />);

    expect(screen.getByRole("button", { name: "Reset overlay tint" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Start capture shortcut" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Capture & copy shortcut" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Capture & save shortcut" })).toBeDisabled();
  });
});
