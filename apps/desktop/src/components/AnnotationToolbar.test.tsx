import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAnnotationStyle } from "../domain/annotations";
import { defaultSnaphubSettings } from "../domain/settings";
import { AnnotationToolbar } from "./AnnotationToolbar";

describe("AnnotationToolbar", () => {
  afterEach(() => cleanup());

  it("reveals writing tools on hover without changing the selected tool", () => {
    const onToolChange = vi.fn();
    render(
      <AnnotationToolbar
        activeTool="select"
        canRedo={false}
        canUndo={false}
        palette={defaultSnaphubSettings.palette}
        style={defaultAnnotationStyle}
        toolbar={defaultSnaphubSettings.toolbar}
        onRedo={() => undefined}
        onScrollCapture={() => undefined}
        onStyleChange={() => undefined}
        onToolChange={onToolChange}
        onUndo={() => undefined}
      />,
    );

    fireEvent.pointerEnter(screen.getByRole("button", { name: "Text highlighter group" }));
    expect(screen.getByRole("button", { name: "Pencil" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Text highlighter" })).toBeVisible();
    expect(onToolChange).not.toHaveBeenCalled();
  });

  it("renders only enabled direct tools in Individual mode", () => {
    const toolbar = {
      ...defaultSnaphubSettings.toolbar,
      mode: "individual" as const,
      individual: {
        ...defaultSnaphubSettings.toolbar.individual,
        pencil: false,
      },
    };
    render(
      <AnnotationToolbar
        activeTool="select"
        canRedo={false}
        canUndo={false}
        palette={defaultSnaphubSettings.palette}
        style={defaultAnnotationStyle}
        toolbar={toolbar}
        onRedo={() => undefined}
        onScrollCapture={() => undefined}
        onStyleChange={() => undefined}
        onToolChange={() => undefined}
        onUndo={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Rectangle" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Pencil" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select" }).querySelector("svg")).toHaveClass("text-white");
  });

  it("flips the contextual rail above when the toolbar is at the bottom edge", () => {
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rectForElement(this: HTMLElement): DOMRect {
      if (this.getAttribute("aria-label") === "Quick editing tools") return new DOMRect(100, 710, 300, 48);
      if (this.hasAttribute("data-placement")) return new DOMRect(100, 765, 340, 56);
      return new DOMRect();
    });
    render(
      <AnnotationToolbar
        activeTool="select"
        canRedo={false}
        canUndo={false}
        palette={defaultSnaphubSettings.palette}
        style={defaultAnnotationStyle}
        toolbar={defaultSnaphubSettings.toolbar}
        onRedo={() => undefined}
        onScrollCapture={() => undefined}
        onStyleChange={() => undefined}
        onToolChange={() => undefined}
        onUndo={() => undefined}
      />,
    );

    fireEvent.pointerEnter(screen.getByRole("button", { name: "Text highlighter group" }));
    expect(screen.getByRole("group", { name: "Tool properties" }).parentElement).toHaveAttribute("data-placement", "top");
    bounds.mockRestore();
  });
});
