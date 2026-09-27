import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PinnedCaptureEntry } from "./PinnedView";

const tauri = vi.hoisted(() => ({
  close: vi.fn<() => Promise<void>>(),
  invoke: vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(),
  outerPosition: vi.fn<() => Promise<PhysicalPosition>>(),
  setPosition: vi.fn<(position: PhysicalPosition) => Promise<void>>(),
  setResizable: vi.fn<(resizable: boolean) => Promise<void>>(),
  startDragging: vi.fn<() => Promise<void>>(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string): string => `asset://${path}`,
  invoke: tauri.invoke,
}));

type MockWindow = {
  close: () => Promise<void>;
  outerPosition: () => Promise<PhysicalPosition>;
  setPosition: (position: PhysicalPosition) => Promise<void>;
  setResizable: (resizable: boolean) => Promise<void>;
  startDragging: () => Promise<void>;
};

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: (): MockWindow => ({
    close: tauri.close,
    outerPosition: tauri.outerPosition,
    setPosition: tauri.setPosition,
    setResizable: tauri.setResizable,
    startDragging: tauri.startDragging,
  }),
}));

describe("PinnedCaptureEntry", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    tauri.close.mockReset().mockResolvedValue(undefined);
    tauri.setResizable.mockReset().mockResolvedValue(undefined);
    tauri.startDragging.mockReset().mockResolvedValue(undefined);
    tauri.outerPosition.mockReset().mockResolvedValue(new PhysicalPosition(100, 200));
    tauri.setPosition.mockReset().mockResolvedValue(undefined);
    tauri.invoke.mockReset().mockImplementation((command: string): Promise<unknown> => {
      if (command === "pinned_capture_path") return Promise.resolve("C:/Temp/Snaphub/pins/pin.png");
      return Promise.resolve(undefined);
    });
  });

  it("loads the registered bitmap and exposes working pin actions", async () => {
    render(<PinnedCaptureEntry windowLabel="pin-test" />);

    const image = await screen.findByRole("img", { name: "Pinned CapKit capture" });
    fireEvent.load(image);
    expect(image).toHaveAttribute("src", "asset://C:/Temp/Snaphub/pins/pin.png");

    fireEvent.click(screen.getByRole("button", { name: "Copy image" }));
    await waitFor(() => {
      expect(tauri.invoke).toHaveBeenCalledWith("copy_pinned_capture", { label: "pin-test" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    await waitFor(() => {
      expect(tauri.invoke).toHaveBeenCalledWith("save_pinned_capture", { label: "pin-test" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(tauri.close).toHaveBeenCalledOnce());
  });

  it("does not render a click-through button", async () => {
    render(<PinnedCaptureEntry windowLabel="pin-test" />);
    await screen.findByRole("img", { name: "Pinned CapKit capture" });
    expect(screen.queryByRole("button", { name: "Click through" })).toBeNull();
  });

  it("starts dragging on primary pointer down but not on secondary pointer down", async () => {
    render(<PinnedCaptureEntry windowLabel="pin-test" />);
    await screen.findByRole("img", { name: "Pinned CapKit capture" });

    const handle = screen.getByRole("button", { name: "Move pinned image" });
    fireEvent.pointerDown(handle, { button: 2 });
    expect(tauri.startDragging).not.toHaveBeenCalled();

    fireEvent.pointerDown(handle, { button: 0 });
    expect(tauri.startDragging).toHaveBeenCalledOnce();
  });

  it("moves the window with arrow keys when the handle is focused", async () => {
    render(<PinnedCaptureEntry windowLabel="pin-test" />);
    await screen.findByRole("img", { name: "Pinned CapKit capture" });

    const handle = screen.getByRole("button", { name: "Move pinned image" });
    handle.focus();

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    await waitFor(() => {
      expect(tauri.setPosition).toHaveBeenCalledWith(new PhysicalPosition(110, 200));
    });

    tauri.setPosition.mockClear();
    fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true });
    await waitFor(() => {
      expect(tauri.setPosition).toHaveBeenCalledWith(new PhysicalPosition(100, 250));
    });
  });

  it("closes with Escape", async () => {
    render(<PinnedCaptureEntry windowLabel="pin-test" />);
    await screen.findByRole("img", { name: "Pinned CapKit capture" });

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(tauri.close).toHaveBeenCalledOnce());
  });

  it("closes with Escape even while the bitmap is loading", async () => {
    render(<PinnedCaptureEntry windowLabel="pin-test" />);

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(tauri.close).toHaveBeenCalledOnce());
  });
});
