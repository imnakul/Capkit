import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CameraPreview } from "./CameraPreview";

const mocks = {
  ready: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  close: vi.fn<() => Promise<void>>(() => Promise.resolve()),
};

vi.mock("../lib/recordingTauri", () => ({
  cameraReady: (): Promise<void> => mocks.ready(),
  closeCamera: (): Promise<void> => mocks.close(),
}));

describe("CameraPreview", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("reveals itself under StrictMode remounting, where the first frame is cancelled", async () => {
    const { StrictMode } = await import("react");
    render(
      <StrictMode>
        <CameraPreview />
      </StrictMode>,
    );
    await waitFor(() => {
      expect(mocks.ready).toHaveBeenCalled();
    });
    // One frame is cancelled by the StrictMode cleanup; the remount schedules
    // again. Zero calls is the old readyRef bug.
    expect(mocks.ready.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
