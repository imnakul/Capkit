import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAnnotationStyle, type ToolId } from "../domain/annotations";
import { defaultSnaphubSettings, type CaptureToolbarToolId } from "../domain/settings";
import { AnnotationToolbar } from "./AnnotationToolbar";

type HarnessProps = {
  toolbar?: typeof defaultSnaphubSettings.toolbar;
  initialTool?: ToolId;
  placement?: "top" | "bottom";
  keyboardEnabled?: boolean;
  onToolChange?: (tool: ToolId) => void;
};

/** Holds the state App.tsx owns so the toolbar can be driven like the real surface. */
function Harness({
  toolbar = defaultSnaphubSettings.toolbar,
  initialTool = "select",
  placement = "bottom",
  keyboardEnabled = true,
  onToolChange,
}: HarnessProps): React.JSX.Element {
  const [activeTool, setActiveTool] = useState<ToolId>(initialTool);
  const [last, setLast] = useState<Partial<Record<number, CaptureToolbarToolId>>>({});
  const [open, setOpen] = useState<number | null>(null);
  return (
    <AnnotationToolbar
      activeTool={activeTool}
      canRedo={false}
      canUndo={false}
      keyboardEnabled={keyboardEnabled}
      lastToolByGroup={last}
      openGroupIndex={open}
      palette={defaultSnaphubSettings.palette}
      placement={placement}
      style={defaultAnnotationStyle}
      toolbar={toolbar}
      onGroupToolUsed={(index, toolId) => setLast((current) => ({ ...current, [index]: toolId }))}
      onOpenGroupChange={setOpen}
      onRedo={() => undefined}
      onScrollCapture={() => undefined}
      onStyleChange={() => undefined}
      onToolChange={(tool) => {
        setActiveTool(tool);
        onToolChange?.(tool);
      }}
      onUndo={() => undefined}
    />
  );
}

const individual = { ...defaultSnaphubSettings.toolbar, mode: "individual" as const };

describe("AnnotationToolbar", () => {
  afterEach(() => cleanup());

  it("opens a group on click, not on hover, and selects its first tool", () => {
    const onToolChange = vi.fn();
    render(<Harness onToolChange={onToolChange} />);

    fireEvent.pointerEnter(screen.getByRole("button", { name: "Text highlighter group" }));
    expect(screen.queryByRole("group", { name: "Tool properties" })).toBeNull();
    expect(onToolChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Text highlighter group" }));
    expect(screen.getByRole("group", { name: "Tool properties" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Pencil" })).toBeVisible();
    expect(onToolChange).toHaveBeenCalledWith("highlighter");
  });

  it("closes the open row when the group button is clicked again and switches rows between groups", () => {
    render(<Harness />);
    const first = screen.getByRole("button", { name: "Text highlighter group" });
    fireEvent.click(first);
    expect(screen.getByRole("group", { name: "Tool properties" })).toBeVisible();
    fireEvent.click(first);
    expect(screen.queryByRole("group", { name: "Tool properties" })).toBeNull();

    fireEvent.click(first);
    const groups = screen.getAllByRole("button", { expanded: false });
    const other = groups.find((button) => button !== first);
    if (other === undefined) throw new Error("expected a second group button");
    fireEvent.click(other);
    expect(screen.getAllByRole("group", { name: "Tool properties" })).toHaveLength(1);
    expect(first).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the style row inside the same card as the tools", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Text highlighter group" }));
    const card = screen.getByRole("toolbar", { name: "Quick editing tools" }).parentElement;
    expect(card).toContainElement(screen.getByRole("group", { name: "Tool properties" }));
    expect(card).toContainElement(screen.getByRole("slider", { name: "Tool size" }));
  });

  it("shows the last tool used in a group on the group button", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Text highlighter group" }));
    fireEvent.click(screen.getByRole("button", { name: "Pencil" }));
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.getByRole("button", { name: "Pencil group" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Text highlighter group" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Pencil group" }));
    expect(screen.getByRole("button", { name: "Pencil", pressed: true })).toBeVisible();
  });

  it("renders only enabled direct tools in Individual mode with no hover rail", () => {
    const toolbar = { ...individual, individual: { ...individual.individual, pencil: false } };
    render(<Harness toolbar={toolbar} />);

    expect(screen.getByRole("button", { name: "Rectangle" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Pencil" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select" }).querySelector("svg")).toHaveClass("text-white");
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Rectangle" }));
    expect(screen.queryByRole("group", { name: "Tool properties" })).toBeNull();
  });

  it("shows a style row in Individual mode only for tools that support style", () => {
    render(<Harness toolbar={individual} />);
    expect(screen.queryByRole("group", { name: "Tool properties" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
    expect(screen.getByRole("group", { name: "Tool properties" })).toBeVisible();
    expect(screen.getByRole("slider", { name: "Tool size" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.queryByRole("group", { name: "Tool properties" })).toBeNull();
  });

  it("does not advertise A for the Arrow tool", () => {
    render(<Harness toolbar={individual} />);
    const arrow = screen.getByRole("button", { name: "Arrow" });
    expect(arrow).not.toHaveAttribute("aria-keyshortcuts", "A");
    expect(arrow).toHaveTextContent("Arrow");
  });

  it("numbers the tools 1–9 then 0 and shows each number on its button", () => {
    render(<Harness toolbar={individual} />);
    const tools = screen.getAllByRole("button").filter((button) => button.getAttribute("aria-label") !== "Select");
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("aria-keyshortcuts", "V");
    expect(tools.slice(0, 10).map((button) => button.getAttribute("aria-keyshortcuts"))).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]);
    expect(tools[0]?.querySelector("kbd")).toHaveTextContent("1");
    expect(tools[10]).not.toHaveAttribute("aria-keyshortcuts");
  });

  it("picks a tool with its number key and Select with V", () => {
    const onToolChange = vi.fn();
    render(<Harness toolbar={individual} onToolChange={onToolChange} />);
    const second = screen.getAllByRole("button").find((button) => button.getAttribute("aria-keyshortcuts") === "2");
    fireEvent.keyDown(window, { key: "2" });
    expect(second).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(window, { key: "v" });
    expect(onToolChange).toHaveBeenLastCalledWith("select");
  });

  it("ignores number keys while typing, with modifiers, or when the keyboard is off", () => {
    const onToolChange = vi.fn();
    const { rerender } = render(<Harness toolbar={individual} onToolChange={onToolChange} />);
    const field = document.createElement("textarea");
    document.body.append(field);
    fireEvent.keyDown(field, { key: "1" });
    fireEvent.keyDown(window, { key: "1", ctrlKey: true });
    expect(onToolChange).not.toHaveBeenCalled();
    field.remove();
    rerender(<Harness keyboardEnabled={false} toolbar={individual} onToolChange={onToolChange} />);
    fireEvent.keyDown(window, { key: "1" });
    expect(onToolChange).not.toHaveBeenCalled();
  });

  it("puts the style row on the far side of the selection when the toolbar sits above it", () => {
    render(<Harness placement="top" toolbar={individual} initialTool="rectangle" />);
    const card = screen.getByRole("toolbar", { name: "Quick editing tools" }).parentElement;
    expect(card).toHaveClass("flex-col-reverse");
    expect(card?.dataset.placement).toBe("top");
  });

  it("keeps the tool buttons reachable by Tab before the open row", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Text highlighter group" }));
    const buttons = screen.getAllByRole("button");
    const toolbar = screen.getByRole("toolbar", { name: "Quick editing tools" });
    const row = screen.getByRole("group", { name: "Tool properties" });
    const lastTopRow = buttons.filter((button) => toolbar.contains(button)).at(-1);
    const firstRow = buttons.find((button) => row.contains(button));
    if (lastTopRow === undefined || firstRow === undefined) throw new Error("buttons missing");
    expect(lastTopRow.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

describe("AnnotationToolbar placement", () => {
  afterEach(() => cleanup());

  it("leaves tools moved to the vertical toolbar out of the horizontal one", () => {
    render(<Harness toolbar={{ ...individual, verticalTools: ["pencil"] }} />);
    expect(screen.queryByRole("button", { name: "Pencil" })).toBeNull();
    expect(screen.getByRole("button", { name: "Rectangle" })).toBeTruthy();
  });

  it("keeps the colour row for an active style tool that lives in the vertical toolbar", () => {
    render(<Harness initialTool="pencil" toolbar={{ ...individual, verticalTools: ["pencil"] }} />);
    expect(screen.queryByRole("button", { name: "Pencil" })).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Annotation color" })).toBeTruthy();
  });

  it("shows finishing actions moved to the horizontal toolbar after the tools", () => {
    const onSelect = vi.fn();
    render(
      <AnnotationToolbar
        actionItems={[{ id: "action-save", label: "Save", icon: (): null => null, shortcut: "S", onSelect }]}
        activeTool="select"
        canRedo={false}
        canUndo={false}
        lastToolByGroup={{}}
        openGroupIndex={null}
        palette={defaultSnaphubSettings.palette}
        style={defaultAnnotationStyle}
        toolbar={individual}
        onGroupToolUsed={() => undefined}
        onOpenGroupChange={() => undefined}
        onRedo={() => undefined}
        onScrollCapture={() => undefined}
        onStyleChange={() => undefined}
        onToolChange={() => undefined}
        onUndo={() => undefined}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.at(-1)).toHaveAccessibleName("Save");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
});
