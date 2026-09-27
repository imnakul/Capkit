import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordingArtifacts, RecordingSource } from "../domain/recording";
import { RecorderDock } from "./RecorderDock";

const display: RecordingSource = {
  id: "display:1",
  kind: "display",
  title: "Built-in display",
  bounds: { x: 0, y: 0, width: 2560, height: 1440 },
  displayId: "1",
  scaleFactor: 1,
  isPrimary: true,
  thumbnailPath: null,
};

const secondDisplay: RecordingSource = {
  ...display,
  id: "display:2",
  title: "Side monitor",
  isPrimary: false,
};

const editorWindow: RecordingSource = {
  ...display,
  id: "window:9",
  kind: "window",
  title: "Editor",
  isPrimary: false,
};

const artifacts: RecordingArtifacts = {
  id: "rec-1",
  directory: "C:/Temp/CapKit/recordings/one",
  videoPath: "C:/Temp/CapKit/recordings/one/video.mp4",
  cursorPath: "C:/Temp/CapKit/recordings/one/cursor.json",
  systemAudioPath: null,
  microphonePath: null,
  width: 2560,
  height: 1440,
  fps: 30,
  durationSeconds: 4,
  stats: { paused: false, elapsedSeconds: 4, encodedFrames: 120, droppedFrames: 0, bytesWritten: 1024 },
};

const mocks = {
  start: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  stop: vi.fn<() => Promise<RecordingArtifacts>>(() => Promise.resolve(artifacts)),
  cancel: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  close: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  ready: vi.fn<() => Promise<void>>(() => Promise.resolve()),
};

vi.mock("../lib/recordingTauri", () => ({
  listRecordingSources: (): Promise<readonly RecordingSource[]> =>
    Promise.resolve([display, secondDisplay, editorWindow]),
  listAudioDevices: (): Promise<readonly { id: string; name: string; kind: string; isDefault: boolean }[]> =>
    Promise.resolve([{ id: "mic-1", name: "Headset", kind: "microphone", isDefault: true }]),
  startRecording: (): Promise<void> => mocks.start(),
  stopRecording: (): Promise<RecordingArtifacts> => mocks.stop(),
  cancelRecording: (): Promise<void> => mocks.cancel(),
  closeRecorder: (): Promise<void> => mocks.close(),
  recorderReady: (): Promise<void> => mocks.ready(),
  recordingStatus: (): Promise<null> => Promise.resolve(null),
  showRecordingBorder: (): Promise<void> => Promise.resolve(),
  hideRecordingBorder: (): Promise<void> => Promise.resolve(),
  recordingSrc: (path: string): string => path,
}));

vi.mock("../lib/tauri", () => ({
  describeInvokeError: (_error: unknown, fallback: string): string => fallback,
}));

describe("RecorderDock", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("reveals itself only after its first frame, so a hidden window never flashes", async () => {
    render(<RecorderDock />);
    await waitFor(() => {
      expect(mocks.ready).toHaveBeenCalledOnce();
    });
  });

  it("reveals itself under StrictMode remounting, where the first frame is cancelled", async () => {
    const { StrictMode } = await import("react");
    render(
      <StrictMode>
        <RecorderDock />
      </StrictMode>,
    );
    await waitFor(() => {
      expect(mocks.ready).toHaveBeenCalled();
    });
    // One frame is cancelled by the StrictMode cleanup; the remount schedules
    // again. Zero calls is the old readyRef bug.
    expect(mocks.ready.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("offers the capture modes and lists sources for the chosen one, with a preview to pick from", async () => {
    render(<RecorderDock />);

    expect(await screen.findByRole("button", { name: "Record a screen" })).toBeVisible();
    const picker = screen.getByRole("button", { name: "Choose what to record" });
    await waitFor(() => {
      expect(picker).toHaveTextContent("Built-in display");
    });

    // Picking among two sources of the same kind exercises the popover itself,
    // not just the mode filter recomputing the default.
    fireEvent.click(picker);
    expect(await screen.findByRole("option", { name: "Record Built-in display" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("option", { name: "Record Side monitor" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Choose what to record" })).toHaveTextContent("Side monitor");
    });
    // Selecting closes the popover.
    expect(screen.queryByRole("listbox", { name: "Available sources" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Record a window" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Choose what to record" })).toHaveTextContent("Editor");
    });
  });

  it("shows a countdown instead of recording immediately", async () => {
    render(<RecorderDock />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start recording" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));

    // The countdown replaces the dock entirely, and nothing is recorded until
    // it finishes, so the user always sees what is about to be captured.
    expect(screen.getByRole("status")).toHaveTextContent("3");
    expect(mocks.start).not.toHaveBeenCalled();

    await waitFor(
      () => {
        expect(mocks.start).toHaveBeenCalledOnce();
      },
      { timeout: 6000 },
    );
  });

  it("starts immediately when the countdown is turned off", async () => {
    render(<RecorderDock />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start recording" })).toBeEnabled();
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Countdown before recording" }), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));

    await waitFor(() => {
      expect(mocks.start).toHaveBeenCalledOnce();
    });
    expect(await screen.findByRole("button", { name: "Stop and save this recording" })).toBeVisible();
  });

  it("saves a finished recording where the dashboard can find it", async () => {
    render(<RecorderDock />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start recording" })).toBeEnabled();
    });

    // Skip the countdown so the test exercises stop, not the timer.
    fireEvent.change(screen.getByRole("combobox", { name: "Countdown before recording" }), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));

    const stop = await screen.findByRole("button", { name: "Stop and save this recording" });
    fireEvent.click(stop);

    await waitFor(() => {
      expect(mocks.close).toHaveBeenCalled();
    });
    const stored = window.localStorage.getItem("capkit.recordings.v1");
    expect(stored).toContain("rec-1");
  });

  it("discards without saving when the user backs out", async () => {
    render(<RecorderDock />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start recording" })).toBeEnabled();
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Countdown before recording" }), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));

    fireEvent.click(await screen.findByRole("button", { name: "Discard this recording" }));
    await waitFor(() => {
      expect(mocks.cancel).toHaveBeenCalledOnce();
    });
    expect(window.localStorage.getItem("capkit.recordings.v1")).toBeNull();
  });

  it("remembers the audio choices between sessions", async () => {
    render(<RecorderDock />);
    const mic = await screen.findByRole("button", { name: "Record the microphone" });
    expect(mic).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(mic);
    expect(screen.getByRole("button", { name: "Record the microphone" })).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("capkit.recorder.settings.v1")).toContain('"microphone":true');
  });
});
