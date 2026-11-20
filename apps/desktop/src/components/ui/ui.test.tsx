import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FolderOpen as Folder } from "../icons";
import { Keycap } from "./Keycap";
import { PageHeader } from "./PageHeader";
import { Segmented } from "./Segmented";
import { SettingsCard } from "./SettingsCard";
import { Switch } from "./Switch";

afterEach(cleanup);

describe("SettingsCard", () => {
  function Harness({ initiallyOpen }: { initiallyOpen: boolean }): React.JSX.Element {
    const [open, setOpen] = useState(initiallyOpen);
    return (
      <SettingsCard icon={Folder} id="folders" open={open} summary="Documents" title="Folders" onToggle={() => setOpen((value) => !value)}>
        <button type="button">Inside</button>
      </SettingsCard>
    );
  }

  it("toggles from anywhere on the header row and shows the summary while closed", () => {
    render(<Harness initiallyOpen={false} />);
    const header = screen.getByRole("button", { name: /Folders/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(header).toHaveTextContent("Documents");

    fireEvent.click(screen.getByText("Documents"));
    expect(header).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the body inert while closed so focus and the accessibility tree skip it", () => {
    const { container } = render(<Harness initiallyOpen={false} />);
    const body = container.querySelector<HTMLElement>("#settings-section-folders");
    expect(body).toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: /Folders/ }));
    expect(body).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Inside" })).toBeVisible();
  });
});

describe("Switch", () => {
  it("reports the new state on click and is disabled when asked", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Switch checked={false} label="Open at startup" onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: "Open at startup" }));
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<Switch checked disabled label="Open at startup" onChange={onChange} />);
    expect(screen.getByRole("switch", { name: "Open at startup" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Open at startup" })).toBeChecked();
  });
});

describe("Segmented", () => {
  const options = [
    { value: "small", label: "Small" },
    { value: "medium", label: "Medium" },
    { value: "large", label: "Large" },
  ] as const;

  it("exposes radio semantics with a single tab stop on the selected segment", () => {
    render(<Segmented label="Cursor size" options={options} value="medium" onChange={() => undefined} />);
    expect(screen.getByRole("radiogroup", { name: "Cursor size" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Medium" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Small" })).toHaveAttribute("tabindex", "-1");
  });

  it("moves and selects with the arrow keys, wrapping at both ends, and jumps with Home and End", () => {
    const onChange = vi.fn();
    render(<Segmented label="Cursor size" options={options} value="large" onChange={onChange} />);
    const group = screen.getByRole("radiogroup", { name: "Cursor size" });

    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("small");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("medium");
    fireEvent.keyDown(group, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("small");
    fireEvent.keyDown(group, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("large");
  });
});

describe("PageHeader and Keycap", () => {
  it("renders one h1 with an optional trailing slot", () => {
    render(<PageHeader title="Screenshots" trailing={<span>3 files</span>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Screenshots" })).toBeVisible();
    expect(screen.getByText("3 files")).toBeVisible();
  });

  it("renders a shortcut as a kbd element", () => {
    render(<Keycap>Ctrl+Shift+S</Keycap>);
    expect(screen.getByText("Ctrl+Shift+S").tagName).toBe("KBD");
  });
});
