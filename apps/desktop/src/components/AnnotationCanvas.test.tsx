import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnnotationScene } from "../domain/annotations";
import { defaultAnnotationStyle } from "../domain/annotations";
import { AnnotationCanvas } from "./AnnotationCanvas";

vi.mock("react-konva", () => {
  function Container({ children }: PropsWithChildren): React.JSX.Element {
    return <div>{children}</div>;
  }
  function Shape(): React.JSX.Element {
    return <span />;
  }
  return {
    Arrow: Shape,
    Circle: Shape,
    Ellipse: Shape,
    Group: Container,
    Layer: Container,
    Line: Shape,
    Rect: Shape,
    Stage: Container,
    Text: Shape,
  };
});

const scene: AnnotationScene = {
  version: 1,
  elements: [
    {
      id: "blur-preview",
      kind: "blur",
      bounds: { x: 12, y: 16, width: 120, height: 72 },
      color: "#d9ff43",
      intensity: 4,
      opacity: 1,
    },
    {
      id: "pixel-preview",
      kind: "pixelate",
      bounds: { x: 30, y: 96, width: 160, height: 64 },
      color: "#d9ff43",
      intensity: 4,
      opacity: 1,
    },
  ],
};

describe("AnnotationCanvas effect previews", () => {
  afterEach(() => cleanup());

  it("shows live blur and nearest-neighbor pixelation over the source snapshot", () => {
    render(
      <AnnotationCanvas
        activeTool="select"
        bounds={{ x: 100, y: 80, width: 420, height: 300 }}
        cursor="crosshair"
        scene={scene}
        snapshotUrl="asset://capture.png"
        style={defaultAnnotationStyle}
        onCommit={() => undefined}
        onDelete={() => undefined}
        onUpdate={() => undefined}
      />,
    );

    const blur = document.querySelector<HTMLElement>('[data-effect-preview="blur"]');
    const pixelate = document.querySelector<HTMLElement>('[data-effect-preview="pixelate"]');
    expect(blur).not.toBeNull();
    expect(blur).toHaveStyle({ backdropFilter: "blur(4px)" });
    expect(pixelate).not.toBeNull();

    const pixelSource = pixelate?.querySelector("img");
    expect(pixelSource).toHaveAttribute("src", "asset://capture.png");
    expect(pixelSource).toHaveStyle({ imageRendering: "pixelated", transform: "scale(4)" });
    expect(screen.getByRole("application", { name: "Screenshot annotation canvas" })).toHaveStyle({ cursor: "crosshair" });
  });

  it("edits text in place on a second click and exposes its local delete action", () => {
    const textScene: AnnotationScene = {
      version: 1,
      elements: [{
        id: "text-1",
        kind: "text",
        position: { x: 20, y: 30 },
        text: "Type something",
        color: "#d9ff43",
        fontFamily: "Caveat Variable",
        fontSize: 24,
        opacity: 1,
      }],
    };
    const onDelete = vi.fn();
    render(
      <AnnotationCanvas
        activeTool="text"
        bounds={{ x: 0, y: 0, width: 420, height: 300 }}
        cursor="crosshair"
        scene={textScene}
        snapshotUrl="asset://capture.png"
        style={defaultAnnotationStyle}
        onCommit={() => undefined}
        onDelete={onDelete}
        onUpdate={() => undefined}
      />,
    );

    const textControl = screen.getByRole("button", { name: "Select text: Type something" });
    fireEvent.click(textControl);
    fireEvent.click(screen.getByRole("button", { name: "Edit text: Type something" }));
    expect(screen.getByRole("textbox", { name: "Edit annotation text" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Delete text annotation" }));
    expect(onDelete).toHaveBeenCalledWith("text-1");
  });

  it("commits the active text before creating a new placeholder", () => {
    const textScene: AnnotationScene = {
      version: 1,
      elements: [{
        id: "text-1",
        kind: "text",
        position: { x: 20, y: 30 },
        text: "Type something",
        color: "#d9ff43",
        fontFamily: "Caveat Variable",
        fontSize: 24,
        opacity: 1,
      }],
    };
    const onCommit = vi.fn();
    const onUpdate = vi.fn();
    render(
      <AnnotationCanvas
        activeTool="text"
        bounds={{ x: 0, y: 0, width: 420, height: 300 }}
        cursor="crosshair"
        scene={textScene}
        snapshotUrl="asset://capture.png"
        style={defaultAnnotationStyle}
        onCommit={onCommit}
        onDelete={() => undefined}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select text: Type something" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit text: Type something" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit annotation text" }), { target: { value: "Keep this edit" } });
    fireEvent.pointerDown(screen.getByRole("application", { name: "Screenshot annotation canvas" }), { button: 0, clientX: 220, clientY: 180, pointerId: 4 });

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: "text-1", text: "Keep this edit" }));
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ kind: "text", text: "Type something" }));
  });
});
