import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAnnotationStyle, type ToolId } from "../domain/annotations";
import { defaultSnaphubSettings } from "../domain/settings";
import { ContextControls } from "./ContextControls";

function renderControls(activeTool: ToolId, onStyleChange = vi.fn()): ReturnType<typeof vi.fn> {
  render(
    <ContextControls
      activeTool={activeTool}
      palette={defaultSnaphubSettings.palette}
      showStyleControls
      style={defaultAnnotationStyle}
      tools={[]}
      onStyleChange={onStyleChange}
      onToolSelect={() => undefined}
    />,
  );
  return onStyleChange;
}

describe("ContextControls", () => {
  afterEach(() => cleanup());

  it("changes the line style and supports arrow-key navigation", () => {
    const onStyleChange = renderControls("rectangle");
    const group = screen.getByRole("radiogroup", { name: "Line style" });
    expect(screen.getByRole("radio", { name: "Solid" })).toBeChecked();
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onStyleChange).toHaveBeenCalledWith(expect.objectContaining({ strokeStyle: "dashed" }));
    fireEvent.click(screen.getByRole("radio", { name: "Sketchy" }));
    expect(onStyleChange).toHaveBeenLastCalledWith(expect.objectContaining({ strokeStyle: "sketchy" }));
  });

  it("shows the corner slider for rectangles only", () => {
    const onStyleChange = renderControls("rectangle");
    fireEvent.change(screen.getByRole("slider", { name: "Corner radius" }), { target: { value: "16" } });
    expect(onStyleChange).toHaveBeenCalledWith(expect.objectContaining({ cornerRadius: 16 }));
    cleanup();
    renderControls("ellipse");
    expect(screen.queryByRole("slider", { name: "Corner radius" })).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Line style" })).toBeVisible();
  });

  it("hides line style for pencil", () => {
    renderControls("pencil");
    expect(screen.queryByRole("radiogroup", { name: "Line style" })).toBeNull();
  });
});
