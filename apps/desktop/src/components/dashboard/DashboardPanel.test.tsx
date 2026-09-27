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

  it("opens on the screenshots dashboard", async () => {
    render(<DashboardPanel />);

    expect(await screen.findByRole("heading", { name: "Screenshots" })).toBeVisible();
    expect(screen.getByText("Only images explicitly saved by Capkit appear here. Clipboard-only captures stay private and unindexed.")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Capkit sections" })).toBeVisible();
  });

  it("no longer offers a Cloud section", () => {
    render(<DashboardPanel />);

    expect(screen.queryByRole("button", { name: "Open Cloud" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open Record" })).toBeVisible();
    // Studio is reached from a recording, so it is no longer a section.
    expect(screen.queryByRole("button", { name: "Open Studio" })).toBeNull();
  });

  it("orders the sidebar Screenshots, Showcase, Record, then Settings", () => {
    render(<DashboardPanel />);

    const nav = screen.getByRole("navigation", { name: "Capkit sections" });

    expect(
      within(nav)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Open Screenshots", "Open Showcase", "Open Record", "Open Settings"]);
  });

  it("opens the recorder from Record", async () => {
    render(<DashboardPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Open Record" }));
    expect(await screen.findByRole("heading", { name: "Capture your screen." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start recording" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Screenshots" })).not.toBeInTheDocument();
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
    selectTab("Screenshots");
    openSection("Colors & default size");

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
    selectTab("Screenshots");
    openSection("Colors & default size");

    fireEvent.click(screen.getByRole("button", { name: "Default annotation color" }));

    const colorList = screen.getByRole("listbox", { name: "Available annotation colors" });
    expect(within(colorList).getAllByRole("option")).toHaveLength(5);
    expect(within(colorList).getByRole("option", { name: "#D9FF43" })).toBeVisible();
  });

  it("provides a reset action for every settings section", () => {
    render(<DashboardPanel />);
    openSettings();

    // Every section now sits behind a tab, so the resets are counted the way
    // they are met: one tab at a time, with each section opened.
    let resets = 0;
    for (const tab of Object.keys(sectionTitles) as (keyof typeof sectionTitles)[]) {
      selectTab(tab);
      for (const section of sectionTitles[tab]) openSection(section);
      resets += screen.getAllByRole("button", { name: "Reset this section" }).length;
    }

    expect(resets).toBe(10);
  });

  it("provides inline resets for overlay tint and individual shortcuts", () => {
    render(<DashboardPanel />);
    openSettings();
    selectTab("Screenshots");
    openSection("Detection & overlay");

    expect(screen.getByRole("button", { name: "Reset overlay tint" })).toBeDisabled();

    selectTab("Shortcuts");

    expect(screen.getByRole("button", { name: "Reset Start capture shortcut" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Capture & copy shortcut" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Capture & save shortcut" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset Copy & Save selection shortcut" })).toBeDisabled();

    selectTab("Screen Draw");

    expect(screen.getByRole("button", { name: "Reset Toggle on-screen toolbar shortcut" })).toBeDisabled();
  });

  it("configures unique number keys for on-screen tools", () => {
    render(<DashboardPanel />);
    openSettings();
    selectTab("Screen Draw");

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
    selectTab("Screen Draw");

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
    selectTab("Screen Draw");

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
    selectTab("Screen Draw");

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
    selectTab("Screenshots");
    openSection("Default capture method");

    expect(screen.getByRole("radio", { name: "Use Automatic scrolling capture" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Use Always ask scrolling capture" }));
    expect(screen.getByRole("radio", { name: "Use Always ask scrolling capture" })).toHaveAttribute("aria-checked", "true");
  });

  it("leaves shortcut recording mode when its inline reset is pressed", () => {
    render(<DashboardPanel />);
    openSettings();
    selectTab("Shortcuts");

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
    selectTab("Shortcuts");

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
    selectTab("Shortcuts");

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
    selectTab("Shortcuts");

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
    selectTab("Shortcuts");

    const configure = screen.getByRole("button", { name: "Configure Copy & Save selection" });
    fireEvent.click(configure);
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });

    expect(configure).toHaveTextContent("Press shortcut…");
    expect(configure).toHaveAttribute("aria-pressed", "true");
  });

  it("opens Settings on General and wraps the tab list around", () => {
    render(<DashboardPanel />);
    openSettings();

    const tablist = screen.getByRole("tablist", { name: "Settings sections" });
    expect(
      within(tablist)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["General", "Screenshots", "Screen Draw", "Shortcuts"]);

    const general = screen.getByRole("tab", { name: "General" });
    expect(general).toHaveAttribute("aria-selected", "true");
    expect(general).toHaveAttribute("aria-controls", "settings-panel-general");
    expect(general).toHaveAttribute("tabindex", "0");
    for (const tab of ["Screenshots", "Screen Draw", "Shortcuts"]) {
      expect(screen.getByRole("tab", { name: tab })).toHaveAttribute("tabindex", "-1");
    }

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "settings-panel-general");
    expect(panel).toHaveAttribute("aria-labelledby", "settings-tab-general");

    fireEvent.keyDown(tablist, { key: "End" });
    expect(screen.getByRole("tab", { name: "Shortcuts" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "settings-panel-shortcuts");

    // ArrowRight past the last tab returns to the first.
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "settings-panel-general");

    // ArrowLeft past the first tab wraps to the last.
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Shortcuts" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tablist, { key: "Home" });
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
  });

  it("groups each settings section under the task it belongs to", () => {
    render(<DashboardPanel />);
    openSettings();

    // Startup belongs to General, so Screenshots has no trace of it, even once
    // the section that used to hold it is open.
    expect(screen.getByRole("switch", { name: "Open at startup" })).toBeVisible();

    for (const tab of Object.keys(sectionTitles) as (keyof typeof sectionTitles)[]) {
      selectTab(tab);
      expect(sectionHeadings()).toEqual(sectionTitles[tab]);
    }

    selectTab("Screenshots");
    openSection("Detection & overlay");
    expect(screen.queryByRole("switch", { name: "Open at startup" })).toBeNull();
  });

  it("opens the first section of each tab and leaves the rest alone", () => {
    render(<DashboardPanel />);
    openSettings();

    for (const [tab, titles] of Object.entries(sectionTitles)) {
      selectTab(tab);
      titles.forEach((title, index) => {
        expect(sectionHeader(title)).toHaveAttribute(
          "aria-expanded",
          index === 0 ? "true" : "false",
        );
      });
    }

    // Opening a second section leaves the first one open.
    selectTab("Screenshots");
    openSection("Colors & default size");
    expect(sectionHeader("Choose what stays within reach")).toHaveAttribute("aria-expanded", "true");
    expect(sectionHeader("Colors & default size")).toHaveAttribute("aria-expanded", "true");
    expect(sectionHeader("Detection & overlay")).toHaveAttribute("aria-expanded", "false");
  });

  it("cancels shortcut recording when the section holding it collapses", () => {
    render(<DashboardPanel />);
    openSettings();
    selectTab("Shortcuts");

    const configure = screen.getByRole("button", { name: "Configure Start capture" });
    fireEvent.click(configure);
    expect(configure).toHaveTextContent("Press shortcut…");

    fireEvent.click(sectionHeader("Shortcuts"));
    expect(sectionHeader("Shortcuts")).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(sectionHeader("Shortcuts"));
    expect(screen.getByRole("button", { name: "Configure Start capture" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

/** Section titles per tab, in the order each tab shows them. */
const sectionTitles = {
  General: ["Open at startup", "Theme accent", "Saved captures"],
  Screenshots: [
    "Choose what stays within reach",
    "Colors & default size",
    "Detection & overlay",
    "Capture cursor",
    "Default capture method",
  ],
  "Screen Draw": ["On-screen toolbar"],
  Shortcuts: ["Shortcuts"],
} as const;

function openSettings(): void {
  fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));
}

function selectTab(label: string): void {
  fireEvent.click(screen.getByRole("tab", { name: label }));
}

/** The section headings of the tab currently on screen, top to bottom. */
function sectionHeadings(): readonly (string | null)[] {
  return within(screen.getByRole("tabpanel"))
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent);
}

/** The disclosure control of the section carrying this heading. */
function sectionHeader(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: title });
  const section = heading.closest("section");
  if (section === null) throw new Error(`The ${title} heading must be inside a section`);
  const header = section.querySelector<HTMLElement>("button[aria-expanded]");
  if (header === null) throw new Error(`The ${title} section must have a disclosure header`);
  return header;
}

function openSection(title: string): void {
  const header = sectionHeader(title);
  if (header.getAttribute("aria-expanded") === "false") fireEvent.click(header);
}
