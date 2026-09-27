import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordRegion } from "./RecordRegion";

const mocks = {
  ready: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  confirm: vi.fn<(box: unknown) => Promise<void>>(() => Promise.resolve()),
  cancel: vi.fn<() => Promise<void>>(() => Promise.resolve()),
};

vi.mock("../lib/recordingTauri", () => ({
  recordRegionReady: (): Promise<void> => mocks.ready(),
  confirmRecordRegion: (box: unknown): Promise<void> => mocks.confirm(box),
  cancelRecordRegion: (): Promise<void> => mocks.cancel(),
}));

describe("RecordRegion", () => {
  beforeEach(() => {
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  function drawBox(width = 200, height = 120): void {
    const surface = screen.getByRole("application", { name: "Choose a region to record" });
    fireEvent.pointerDown(surface, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 100 + width, clientY: 100 + height, pointerId: 1 });
    fireEvent.pointerUp(surface, { button: 0, pointerId: 1 });
  }

  it("confirms the logical box with the button and with Enter", () => {
    render(<RecordRegion />);
    drawBox();

    fireEvent.click(screen.getByRole("button", { name: "Use this area" }));
    expect(mocks.confirm).toHaveBeenCalledWith({ x: 100, y: 100, width: 200, height: 120 });

    fireEvent.keyDown(window, { key: "Enter" });
    expect(mocks.confirm).toHaveBeenCalledTimes(2);
  });

  it("cancels with Escape and offers Redraw", () => {
    render(<RecordRegion />);
    drawBox();

    fireEvent.click(screen.getByRole("button", { name: "Redraw" }));
    expect(screen.queryByRole("button", { name: "Use this area" })).not.toBeInTheDocument();

    drawBox();
    expect(screen.getByRole("button", { name: "Use this area" })).toBeVisible();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
  });

  it("shows no confirm step for a drag under 32 px", () => {
    render(<RecordRegion />);
    drawBox(10, 10);

    expect(screen.queryByRole("button", { name: "Use this area" })).not.toBeInTheDocument();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
