import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsTabs, type SettingsTabId } from "./SettingsTabs";

const tabs = [
  { id: "general", label: "General" },
  { id: "screenshots", label: "Screenshots" },
  { id: "screen-draw", label: "Screen Draw" },
  { id: "shortcuts", label: "Shortcuts" },
] as const satisfies readonly { id: SettingsTabId; label: string }[];

/** jsdom has no layout, so the pills need a geometry to be measured against. */
const tabGeometry: Record<string, { left: number; width: number }> = {
  "settings-tab-general": { left: 0, width: 72 },
  "settings-tab-screenshots": { left: 76, width: 104 },
  "settings-tab-screen-draw": { left: 184, width: 104 },
  "settings-tab-shortcuts": { left: 292, width: 88 },
};

function Harness(): React.JSX.Element {
  const [active, setActive] = useState<SettingsTabId>("general");
  return (
    <SettingsTabs active={active} onSelect={setActive} tabs={tabs}>
      <p>Panel body</p>
    </SettingsTabs>
  );
}

function activeIndicator(): HTMLElement {
  const indicator = document.querySelector<HTMLElement>('[data-indicator="active"]');
  if (indicator === null) throw new Error("The active pill must be rendered");
  return indicator;
}

describe("SettingsTabs", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement): number {
      return tabGeometry[this.id]?.left ?? 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement): number {
      return tabGeometry[this.id]?.width ?? 0;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("slides the active pill onto the selected tab", () => {
    render(<Harness />);

    expect(activeIndicator()).toHaveStyle({ transform: "translateX(0px)", width: "72px" });

    fireEvent.click(screen.getByRole("tab", { name: "Shortcuts" }));

    expect(activeIndicator()).toHaveStyle({ transform: "translateX(292px)", width: "88px" });
    expect(within(screen.getByRole("tabpanel")).getByText("Panel body")).toBeVisible();
  });

  it("moves focus and selection with the arrow keys", () => {
    render(<Harness />);
    const tablist = screen.getByRole("tablist", { name: "Settings sections" });

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Screenshots" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Screenshots" })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tablist, { key: "End" });
    expect(screen.getByRole("tab", { name: "Shortcuts" })).toHaveFocus();
    expect(activeIndicator()).toHaveStyle({ transform: "translateX(292px)" });

    fireEvent.keyDown(tablist, { key: "Home" });
    expect(screen.getByRole("tab", { name: "General" })).toHaveFocus();
    expect(activeIndicator()).toHaveStyle({ transform: "translateX(0px)" });
  });

  it("fades the hover pill out when the pointer leaves the list", () => {
    render(<Harness />);
    const tablist = screen.getByRole("tablist", { name: "Settings sections" });
    const hoverPill = document.querySelector<HTMLElement>('[data-indicator="hover"]');
    if (hoverPill === null) throw new Error("The hover pill must be rendered");

    fireEvent.mouseEnter(screen.getByRole("tab", { name: "Screen Draw" }));
    expect(hoverPill.style.opacity).toBe("1");
    expect(hoverPill.firstElementChild).toHaveStyle({ transform: "translateX(184px)" });

    fireEvent.mouseLeave(tablist);
    expect(hoverPill.style.opacity).toBe("0");
  });
});
