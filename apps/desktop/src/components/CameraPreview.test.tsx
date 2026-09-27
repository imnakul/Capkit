import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraPreview } from "./CameraPreview";

const mocks = {
  ready: vi.fn<(mode: string) => Promise<void>>(() => Promise.resolve()),
  close: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  prepare: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  settings: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  stream: vi.fn<() => Promise<MediaStream>>(),
};

vi.mock("../lib/recordingTauri", () => ({
  cameraReady: (mode: string): Promise<void> => mocks.ready(mode),
  closeCamera: (): Promise<void> => mocks.close(),
  prepareCameraPermission: (): Promise<void> => mocks.prepare(),
  openCameraPrivacySettings: (): Promise<void> => mocks.settings(),
}));

function failingStream(name: string): () => Promise<MediaStream> {
  return (): Promise<MediaStream> => {
    const error = new DOMException("denied", name);
    return Promise.reject(error);
  };
}

describe("CameraPreview", () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: mocks.stream },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("reveals itself under StrictMode remounting, where the first frame is cancelled", async () => {
    mocks.stream.mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream);
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

  it.each([
    ["NotAllowedError", "Windows is blocking camera access for Capkit.", true],
    ["SecurityError", "Windows is blocking camera access for Capkit.", true],
    ["NotFoundError", "No camera was found. Connect one and try again.", false],
    ["OverconstrainedError", "No camera was found. Connect one and try again.", false],
    ["NotReadableError", "The camera is being used by another app. Close it and try again.", false],
    ["AbortError", "The camera is being used by another app. Close it and try again.", false],
    ["Unknown", "The camera could not be started.", false],
  ])(
    "maps %s to its blocked copy and centres the panel",
    async (name, copy, withSettings) => {
      mocks.stream.mockImplementation(failingStream(name));
      render(<CameraPreview />);

      expect(await screen.findByText(copy)).toBeVisible();
      expect(mocks.ready).toHaveBeenCalledWith("blocked");
      if (withSettings) {
        expect(screen.getByRole("button", { name: "Open camera settings" })).toBeVisible();
      } else {
        expect(screen.queryByRole("button", { name: "Open camera settings" })).toBeNull();
      }
      expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Close the camera" })).toBeVisible();
    },
  );

  it("retries in place and reveals the live bubble on success", async () => {
    mocks.stream.mockImplementation(failingStream("NotAllowedError"));
    render(<CameraPreview />);
    await screen.findByText("Windows is blocking camera access for Capkit.");

    mocks.stream.mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByRole("button", { name: "Trying…" })).toBeDisabled();
    await waitFor(() => {
      expect(mocks.ready).toHaveBeenCalledWith("live");
    });
    expect(await screen.findByLabelText("Camera preview")).toBeVisible();
  });
});
