import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSnaphubSettings, type SnaphubSettings } from "../../domain/settings";
import { ToolbarConfiguration } from "./ToolbarConfiguration";

function ControlledToolbar(): React.JSX.Element {
  const [toolbar, setToolbar] = useState<SnaphubSettings["toolbar"]>(defaultSnaphubSettings.toolbar);
  return <ToolbarConfiguration toolbar={toolbar} onChange={setToolbar} />;
}

describe("ToolbarConfiguration", () => {
  afterEach(() => cleanup());

  it("explains group semantics and returns removed-row tools to the available pool", () => {
    const view = render(<ControlledToolbar />);

    expect(view.getByText("Each row is one group")).toBeVisible();
    expect(view.getByRole("button", { name: /Rectangle, group default/ })).toBeVisible();
    fireEvent.click(view.getByRole("button", { name: "Remove toolbar group 2" }));
    expect(view.getByRole("button", { name: /Text highlighter\. Drag to reorder/ })).toBeVisible();
  });

  it("offers every tool as a direct toggle in Individual mode", () => {
    const view = render(<ControlledToolbar />);

    fireEvent.click(view.getByRole("radio", { name: "Use Individual toolbar mode" }));
    const pencil = view.getByRole("switch", { name: "Show Pencil" });
    expect(pencil).toBeChecked();
    fireEvent.click(pencil);
    expect(pencil).not.toBeChecked();
  });

  it("moves a tool across groups with pointer dragging", () => {
    const view = render(<ControlledToolbar />);
    const rectangle = view.getByRole("button", { name: /Rectangle, group default/ });
    const writingRow = view.getByLabelText("Toolbar group 2");
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    Object.defineProperties(rectangle, {
      hasPointerCapture: { configurable: true, value: vi.fn(() => false) },
      setPointerCapture: { configurable: true, value: vi.fn() },
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => writingRow),
    });

    fireEvent.pointerDown(rectangle, { button: 0, clientX: 10, clientY: 10, pointerId: 7 });
    fireEvent.pointerMove(rectangle, { buttons: 1, clientX: 30, clientY: 30, pointerId: 7 });
    fireEvent.pointerUp(rectangle, { button: 0, clientX: 30, clientY: 30, pointerId: 7 });

    expect(within(writingRow).getByRole("button", { name: /Rectangle\. Drag to reorder/ })).toBeVisible();
    if (originalElementFromPoint) {
      Object.defineProperty(document, "elementFromPoint", originalElementFromPoint);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  });

  it("moves an Individual-mode tool to the vertical toolbar and back with the arrow keys", () => {
    const changes: SnaphubSettings["toolbar"][] = [];
    function Spy(): React.JSX.Element {
      const [toolbar, setToolbar] = useState<SnaphubSettings["toolbar"]>({ ...defaultSnaphubSettings.toolbar, mode: "individual" });
      return <ToolbarConfiguration toolbar={toolbar} onChange={(next) => { changes.push(next); setToolbar(next); }} />;
    }
    const view = render(<Spy />);
    const placement = view.getByRole("radiogroup", { name: "Pencil toolbar" });
    fireEvent.click(within(placement).getByRole("radio", { name: "Vertical" }));
    expect(changes.at(-1)?.verticalTools).toEqual(["pencil"]);
    expect(within(placement).getByRole("radio", { name: "Vertical" })).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(within(placement).getByRole("radio", { name: "Vertical" }), { key: "ArrowLeft" });
    expect(changes.at(-1)?.verticalTools).toEqual([]);
    expect(within(placement).getByRole("radio", { name: "Horizontal" })).toHaveFocus();
  });

  it("hides a finishing action and moves another to the horizontal toolbar", () => {
    const changes: SnaphubSettings["toolbar"][] = [];
    function Spy(): React.JSX.Element {
      const [toolbar, setToolbar] = useState<SnaphubSettings["toolbar"]>(defaultSnaphubSettings.toolbar);
      return <ToolbarConfiguration toolbar={toolbar} onChange={(next) => { changes.push(next); setToolbar(next); }} />;
    }
    const view = render(<Spy />);
    expect(view.getByText("Finishing actions")).toBeVisible();
    fireEvent.click(view.getByRole("switch", { name: "Show Pin" }));
    expect(changes.at(-1)?.actions.pin).toEqual({ enabled: false, placement: "vertical" });
    expect(within(view.getByRole("radiogroup", { name: "Pin toolbar" })).getByRole("radio", { name: "Vertical" })).toBeDisabled();
    fireEvent.click(within(view.getByRole("radiogroup", { name: "Save toolbar" })).getByRole("radio", { name: "Horizontal" }));
    expect(changes.at(-1)?.actions.save).toEqual({ enabled: true, placement: "horizontal" });
  });

  it("toggles when the drawn switch is clicked, not only the hidden checkbox", () => {
    const view = render(<ControlledToolbar />);
    const copy = view.getByRole("switch", { name: "Show Copy" });
    const track = copy.nextElementSibling;
    if (!(track instanceof HTMLElement)) throw new Error("switch track not rendered");
    fireEvent.click(track);
    expect(copy).not.toBeChecked();
    fireEvent.click(track);
    expect(copy).toBeChecked();
  });
});
