import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PinnedCaptureEntry } from "./PinnedView";

const tauri = vi.hoisted(() => ({
  close: vi.fn<() => Promise<void>>(),
  invoke: vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(),
  setResizable: vi.fn<(resizable: boolean) => Promise<void>>(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string): string => `asset://${path}`,
  invoke: tauri.invoke,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: (): { close: () => Promise<void>; setResizable: (value: boolean) => Promise<void> } => ({
    close: tauri.close,
    setResizable: tauri.setResizable,
  }),
}));

describe("PinnedCaptureEntry", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    tauri.close.mockReset().mockResolvedValue(undefined);
    tauri.setResizable.mockReset().mockResolvedValue(undefined);
    tauri.invoke.mockReset().mockImplementation((command: string): Promise<unknown> => {
      if (command === "pinned_capture_path") return Promise.resolve("C:/Temp/Snaphub/pins/pin.png");
      return Promise.resolve(undefined);
    });
  });

  it("loads the registered bitmap and exposes working pin actions", async () => {
    render(<PinnedCaptureEntry windowLabel="pin-test" />);

    const image = await screen.findByRole("img", { name: "Pinned Snaphub capture" });
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

  it("closes with Escape even while the bitmap is loading", async () => {
    render(<PinnedCaptureEntry windowLabel="pin-test" />);

    await screen.findByRole("img", { name: "Pinned Snaphub capture" });
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(tauri.close).toHaveBeenCalledOnce());
  });
});
