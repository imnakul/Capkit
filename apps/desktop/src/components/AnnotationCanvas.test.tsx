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

  it("commits the active text on click away without creating another box", () => {
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
    expect(onCommit).not.toHaveBeenCalled();
  });

  describe("text creation", () => {
    function renderText(overrides: Partial<React.ComponentProps<typeof AnnotationCanvas>> = {}): {
      onCommit: ReturnType<typeof vi.fn>;
      onDelete: ReturnType<typeof vi.fn>;
      canvas: HTMLElement;
    } {
      const onCommit = vi.fn();
      const onDelete = vi.fn();
      render(
        <AnnotationCanvas
          activeTool="text"
          bounds={{ x: 0, y: 0, width: 420, height: 300 }}
          cursor="crosshair"
          scene={{ version: 1, elements: [] }}
          snapshotUrl="asset://capture.png"
          style={defaultAnnotationStyle}
          onCommit={onCommit}
          onDelete={onDelete}
          onUpdate={() => undefined}
          {...overrides}
        />,
      );
      return { onCommit, onDelete, canvas: screen.getByRole("application", { name: "Screenshot annotation canvas" }) };
    }

    it("opens an editor with a placeholder on one click and stores nothing yet", () => {
      const { onCommit, canvas } = renderText();
      fireEvent.pointerDown(canvas, { button: 0, clientX: 50, clientY: 60, pointerId: 1 });
      const editor = screen.getByRole("textbox", { name: "Edit annotation text" });
      expect(editor).toHaveAttribute("placeholder", "Type something");
      expect(editor).toHaveValue("");
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("keeps the new editor focused after the press that created it", () => {
      const { canvas } = renderText();
      const notPrevented = fireEvent.pointerDown(canvas, { button: 0, clientX: 50, clientY: 60, pointerId: 1 });
      // A real press focuses the focusable canvas unless its default is prevented.
      if (notPrevented) canvas.focus();
      expect(notPrevented).toBe(false);
      expect(screen.getByRole("textbox", { name: "Edit annotation text" })).toHaveFocus();
    });

    it("drops empty or whitespace-only text without an undo entry", () => {
      const { onCommit, onDelete, canvas } = renderText();
      fireEvent.pointerDown(canvas, { button: 0, clientX: 50, clientY: 60, pointerId: 1 });
      fireEvent.change(screen.getByRole("textbox", { name: "Edit annotation text" }), { target: { value: "   " } });
      fireEvent.pointerDown(canvas, { button: 0, clientX: 200, clientY: 200, pointerId: 2 });
      expect(onCommit).not.toHaveBeenCalled();
      expect(onDelete).not.toHaveBeenCalled();
      expect(screen.queryByRole("textbox", { name: "Edit annotation text" })).toBeNull();
    });

    it("commits typed text on Enter, and Shift+Enter keeps editing", () => {
      const { onCommit, canvas } = renderText();
      fireEvent.pointerDown(canvas, { button: 0, clientX: 50, clientY: 60, pointerId: 1 });
      const editor = screen.getByRole("textbox", { name: "Edit annotation text" });
      fireEvent.change(editor, { target: { value: "one\ntwo" } });
      fireEvent.keyDown(editor, { key: "Enter", shiftKey: true });
      expect(onCommit).not.toHaveBeenCalled();
      fireEvent.keyDown(editor, { key: "Enter" });
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ kind: "text", text: "one\ntwo" }));
    });

    it("commits on Escape and returns focus to the canvas", () => {
      const { onCommit, canvas } = renderText();
      fireEvent.pointerDown(canvas, { button: 0, clientX: 50, clientY: 60, pointerId: 1 });
      const editor = screen.getByRole("textbox", { name: "Edit annotation text" });
      fireEvent.change(editor, { target: { value: "hello" } });
      fireEvent.keyDown(editor, { key: "Escape" });
      expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ text: "hello" }));
      expect(canvas).toHaveFocus();
    });
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

  it("reports a pin's live position while it is dragged, then null on release", () => {
    const pin = { id: "pin-1", kind: "counter" as const, position: { x: 40, y: 40 }, value: 1, color: "#d9ff43", radius: 12, opacity: 1 };
    const onPinDrag = vi.fn();
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
        onPinDrag={onPinDrag}
        onUpdate={() => undefined}
      />,
    );
    const canvas = screen.getByRole("application", { name: "Screenshot annotation canvas" });
    fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 40, clientY: 40, pointerId: 4 });
    fireEvent.pointerMove(canvas, { buttons: 1, clientX: 70, clientY: 55, pointerId: 4 });
    expect(onPinDrag).toHaveBeenLastCalledWith("pin-1", { x: 70, y: 55 });
    fireEvent.pointerUp(canvas, { button: 0, buttons: 0, clientX: 70, clientY: 55, pointerId: 4 });
    expect(onPinDrag).toHaveBeenLastCalledWith("pin-1", null);
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
  describe("editing without switching tools", () => {
    const frame = {
      id: "frame-1",
      kind: "rectangle" as const,
      bounds: { x: 20, y: 30, width: 200, height: 120 },
      color: "#d9ff43",
      fill: "transparent",
      strokeWidth: 4,
      opacity: 1,
    };

    function renderRectangleTool(): { onCommit: ReturnType<typeof vi.fn>; onUpdate: ReturnType<typeof vi.fn>; canvas: HTMLElement } {
      const onCommit = vi.fn();
      const onUpdate = vi.fn();
      render(
        <AnnotationCanvas
          activeTool="rectangle"
          bounds={{ x: 0, y: 0, width: 420, height: 300 }}
          cursor="crosshair"
          scene={{ version: 1, elements: [frame] }}
          snapshotUrl="asset://capture.png"
          style={defaultAnnotationStyle}
          onCommit={onCommit}
          onDelete={() => undefined}
          onUpdate={onUpdate}
        />,
      );
      return { onCommit, onUpdate, canvas: screen.getByRole("application", { name: "Screenshot annotation canvas" }) };
    }

    it("moves a rectangle grabbed by its border in one update", () => {
      const { onCommit, onUpdate, canvas } = renderRectangleTool();
      fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 20, clientY: 90, pointerId: 1 });
      fireEvent.pointerMove(canvas, { buttons: 1, clientX: 40, clientY: 90, pointerId: 1 });
      fireEvent.pointerUp(canvas, { button: 0, buttons: 0, clientX: 40, clientY: 90, pointerId: 1 });
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: "frame-1", bounds: { x: 40, y: 30, width: 200, height: 120 } }));
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("selects without an update when the press never leaves the 3 px slop", () => {
      const { onUpdate, canvas } = renderRectangleTool();
      fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 20, clientY: 90, pointerId: 1 });
      fireEvent.pointerMove(canvas, { buttons: 1, clientX: 22, clientY: 91, pointerId: 1 });
      fireEvent.pointerUp(canvas, { button: 0, buttons: 0, clientX: 22, clientY: 91, pointerId: 1 });
      expect(onUpdate).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Selected rectangle annotation")).toBeInTheDocument();
    });

    it("draws a new rectangle when Alt is held over the border", () => {
      const { onCommit, onUpdate, canvas } = renderRectangleTool();
      fireEvent.pointerDown(canvas, { button: 0, buttons: 1, altKey: true, clientX: 20, clientY: 90, pointerId: 1 });
      fireEvent.pointerUp(canvas, { button: 0, buttons: 0, altKey: true, clientX: 80, clientY: 130, pointerId: 1 });
      expect(onUpdate).not.toHaveBeenCalled();
      expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ kind: "rectangle" }));
    });

    it("draws inside an unfilled rectangle instead of selecting it", () => {
      const { onCommit, onUpdate, canvas } = renderRectangleTool();
      fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 100, clientY: 90, pointerId: 1 });
      fireEvent.pointerUp(canvas, { button: 0, buttons: 0, clientX: 160, clientY: 130, pointerId: 1 });
      expect(onUpdate).not.toHaveBeenCalled();
      expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ kind: "rectangle" }));
    });
  });

  describe("smart select", () => {
    function renderSmart(smartTarget: { x: number; y: number; width: number; height: number } | null): {
      onCommit: ReturnType<typeof vi.fn>;
      onSmartMiss: ReturnType<typeof vi.fn>;
      onSmartHover: ReturnType<typeof vi.fn>;
      canvas: HTMLElement;
    } {
      const onCommit = vi.fn();
      const onSmartMiss = vi.fn();
      const onSmartHover = vi.fn();
      render(
        <AnnotationCanvas
          activeTool="smart"
          bounds={{ x: 0, y: 0, width: 420, height: 300 }}
          cursor="crosshair"
          scene={{ version: 1, elements: [] }}
          smartTarget={smartTarget}
          smartTargetId="t1"
          snapshotUrl="asset://capture.png"
          style={defaultAnnotationStyle}
          onCommit={onCommit}
          onDelete={() => undefined}
          onSmartHover={onSmartHover}
          onSmartMiss={onSmartMiss}
          onUpdate={() => undefined}
        />,
      );
      return { onCommit, onSmartMiss, onSmartHover, canvas: screen.getByRole("application", { name: "Screenshot annotation canvas" }) };
    }

    const target = { x: 50, y: 60, width: 100, height: 40 };

    it("shows a ghost outline and reports the hovered point", () => {
      const { canvas, onSmartHover } = renderSmart(target);
      expect(screen.getByTestId("smart-ghost")).toBeInTheDocument();
      fireEvent.pointerMove(canvas, { buttons: 0, clientX: 70, clientY: 70, pointerId: 1 });
      expect(onSmartHover).toHaveBeenCalledWith({ x: 70, y: 70 });
    });

    it("a click adds a padded rectangle around the target", () => {
      const { canvas, onCommit } = renderSmart(target);
      fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 70, clientY: 70, pointerId: 1 });
      fireEvent.pointerUp(canvas, { button: 0, buttons: 0, clientX: 70, clientY: 70, pointerId: 1 });
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ kind: "rectangle", bounds: { x: 46, y: 56, width: 108, height: 48 } }));
    });

    it("Alt+click adds an ellipse that circumscribes the target", () => {
      const { canvas, onCommit } = renderSmart(target);
      fireEvent.pointerDown(canvas, { button: 0, buttons: 1, altKey: true, clientX: 70, clientY: 70, pointerId: 1 });
      fireEvent.pointerUp(canvas, { button: 0, buttons: 0, altKey: true, clientX: 70, clientY: 70, pointerId: 1 });
      expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ kind: "ellipse" }));
    });

    it("a drag draws a plain rectangle instead of snapping", () => {
      const { canvas, onCommit } = renderSmart(target);
      fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 200, clientY: 150, pointerId: 1 });
      fireEvent.pointerUp(canvas, { button: 0, buttons: 0, clientX: 260, clientY: 200, pointerId: 1 });
      expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ kind: "rectangle", bounds: { x: 200, y: 150, width: 60, height: 50 } }));
    });

    it("reports a miss when there is nothing to snap to", () => {
      const { canvas, onCommit, onSmartMiss } = renderSmart(null);
      fireEvent.pointerDown(canvas, { button: 0, buttons: 1, clientX: 70, clientY: 70, pointerId: 1 });
      fireEvent.pointerUp(canvas, { button: 0, buttons: 0, clientX: 70, clientY: 70, pointerId: 1 });
      expect(onCommit).not.toHaveBeenCalled();
      expect(onSmartMiss).toHaveBeenCalledTimes(1);
    });
  });
});
