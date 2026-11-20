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

  it("opens a note pin from Select without moving focus off the comment", () => {
    const pin = { id: "pin-1", kind: "counter" as const, position: { x: 40, y: 40 }, value: 1, color: "#d9ff43", radius: 12, opacity: 1 };
    const onPinSelect = vi.fn();
    render(
      <AnnotationCanvas
        activeTool="select"
        bounds={{ x: 0, y: 0, width: 420, height: 300 }}
        cursor="crosshair"
        scene={{ version: 1, elements: [pin] }}
        snapshotUrl="asset://capture.png"
        style={defaultAnnotationStyle}
        onCommit={() => undefined}
        onDelete={() => undefined}
        onPinSelect={onPinSelect}
        onUpdate={() => undefined}
      />,
    );
    const canvas = screen.getByRole("application", { name: "Screenshot annotation canvas" });
    const pressed = fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 40, clientY: 40, pointerId: 3 });
    expect(onPinSelect).toHaveBeenCalledWith("pin-1");
    expect(pressed).toBe(false);
  });

  it("selects, moves, and deletes an existing annotation", () => {
    const rectangle = {
      id: "rectangle-1",
      kind: "rectangle" as const,
      bounds: { x: 20, y: 30, width: 80, height: 50 },
      color: "#d9ff43",
      fill: "transparent",
      strokeWidth: 4,
      opacity: 1,
    };
    const onDelete = vi.fn();
    const onUpdate = vi.fn();
    render(
      <AnnotationCanvas
        activeTool="select"
        bounds={{ x: 0, y: 0, width: 420, height: 300 }}
        cursor="crosshair"
        scene={{ version: 1, elements: [rectangle] }}
        snapshotUrl="asset://capture.png"
        style={defaultAnnotationStyle}
        onCommit={() => undefined}
        onDelete={onDelete}
        onUpdate={onUpdate}
      />,
    );

    const canvas = screen.getByRole("application", { name: "Screenshot annotation canvas" });
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 30, clientY: 40, pointerId: 5 });
    fireEvent.pointerMove(canvas, { buttons: 1, clientX: 50, clientY: 60, pointerId: 5 });
    fireEvent.pointerUp(canvas, { button: 0, buttons: 0, clientX: 50, clientY: 60, pointerId: 5 });

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: "rectangle-1", bounds: { x: 40, y: 50, width: 80, height: 50 } }));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onDelete).toHaveBeenCalledWith("rectangle-1");
  });

  it("resizes a selected annotation by dragging or nudging a handle", () => {
    const rectangle = {
      id: "rectangle-1",
      kind: "rectangle" as const,
      bounds: { x: 20, y: 30, width: 80, height: 50 },
      color: "#d9ff43",
      fill: "transparent",
      strokeWidth: 4,
      opacity: 1,
    };
    const onUpdate = vi.fn();
    render(
      <AnnotationCanvas
        activeTool="select"
        bounds={{ x: 0, y: 0, width: 420, height: 300 }}
        cursor="crosshair"
        scene={{ version: 1, elements: [rectangle] }}
        snapshotUrl="asset://capture.png"
        style={defaultAnnotationStyle}
        onCommit={() => undefined}
        onDelete={() => undefined}
        onUpdate={onUpdate}
      />,
    );

    const canvas = screen.getByRole("application", { name: "Screenshot annotation canvas" });
    expect(screen.queryByRole("button", { name: /Resize rectangle annotation/ })).toBeNull();
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 30, clientY: 40, pointerId: 5 });
    fireEvent.pointerUp(canvas, { button: 0, buttons: 0, clientX: 30, clientY: 40, pointerId: 5 });
    onUpdate.mockClear();

    expect(screen.getAllByRole("button", { name: /Resize rectangle annotation/ })).toHaveLength(8);
    const corner = screen.getByRole("button", { name: "Resize rectangle annotation from the bottom-right corner" });
    fireEvent.pointerDown(corner, { button: 0, buttons: 1, clientX: 100, clientY: 80, pointerId: 6 });
    fireEvent.pointerMove(canvas, { buttons: 1, clientX: 130, clientY: 100, pointerId: 6 });
    fireEvent.pointerUp(canvas, { button: 0, buttons: 0, clientX: 130, clientY: 100, pointerId: 6 });
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ id: "rectangle-1", bounds: { x: 20, y: 30, width: 110, height: 70 } }));

    fireEvent.keyDown(screen.getByRole("button", { name: "Resize rectangle annotation from the right edge" }), { key: "ArrowRight", shiftKey: true });
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ bounds: { x: 20, y: 30, width: 90, height: 50 } }));
  });
});
