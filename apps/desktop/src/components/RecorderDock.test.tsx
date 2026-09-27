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
  start: vi.fn<
    (
      settings: unknown,
      source: unknown,
      region: unknown,
    ) => Promise<void>
  >(() => Promise.resolve()),
  stop: vi.fn<() => Promise<RecordingArtifacts>>(() => Promise.resolve(artifacts)),
  cancel: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  close: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  ready: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  fit: vi.fn<(width: number, height: number) => Promise<void>>(() => Promise.resolve()),
  border: vi.fn<(bounds: unknown) => Promise<void>>(() => Promise.resolve()),
  openRegion: vi.fn<() => Promise<void>>(() => Promise.resolve()),
};

const regionListeners = vi.hoisted(() => ({
  selected: null as null | ((selection: { displayId: string; bounds: { x: number; y: number; width: number; height: number } }) => void),
  cancelled: null as null | (() => void),
}));

vi.mock("../lib/recordingTauri", () => ({
  fitRecorder: (width: number, height: number): Promise<void> => mocks.fit(width, height),
  openRecordRegion: (): Promise<void> => mocks.openRegion(),
  listenForRecordRegion: (
    onSelected: (selection: { displayId: string; bounds: { x: number; y: number; width: number; height: number } }) => void,
    onCancelled: () => void,
  ): Promise<() => void> => {
    regionListeners.selected = onSelected;
    regionListeners.cancelled = onCancelled;
    return Promise.resolve((): void => undefined);
  },
  listRecordingSources: (): Promise<readonly RecordingSource[]> =>
    Promise.resolve([display, secondDisplay, editorWindow]),
  listAudioDevices: (): Promise<readonly { id: string; name: string; kind: string; isDefault: boolean }[]> =>
    Promise.resolve([{ id: "mic-1", name: "Headset", kind: "microphone", isDefault: true }]),
  startRecording: (settings: unknown, source: unknown, region: unknown): Promise<void> =>
    mocks.start(settings, source, region),
  stopRecording: (): Promise<RecordingArtifacts> => mocks.stop(),
  cancelRecording: (): Promise<void> => mocks.cancel(),
  closeRecorder: (): Promise<void> => mocks.close(),
  recorderReady: (): Promise<void> => mocks.ready(),
  recordingStatus: (): Promise<null> => Promise.resolve(null),
  showRecordingBorder: (bounds: unknown): Promise<void> => mocks.border(bounds),
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
    regionListeners.selected = null;
    regionListeners.cancelled = null;
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

  it("fits the window before revealing it, and still reveals when fitting fails", async () => {
    const rect = {
      x: 0, y: 0, width: 724, height: 140, top: 0, left: 0, right: 724, bottom: 140,
      toJSON: (): string => "{}",
    } as DOMRect;
    const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
    try {
      render(<RecorderDock />);
      await waitFor(() => {
        expect(mocks.ready).toHaveBeenCalled();
      });
      expect(mocks.fit).toHaveBeenCalledWith(724, 140);
      const fitOrder = mocks.fit.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
      const readyOrder = mocks.ready.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY;
      expect(fitOrder).toBeLessThan(readyOrder);
    } finally {
      measure.mockRestore();
    }
  });

  it("shows the resize error but still reveals the dock when fitting fails", async () => {
    const rect = {
      x: 0, y: 0, width: 724, height: 140, top: 0, left: 0, right: 724, bottom: 140,
      toJSON: (): string => "{}",
    } as DOMRect;
    const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
    mocks.fit.mockRejectedValueOnce(new Error("no monitor"));
    try {
      render(<RecorderDock />);
      await waitFor(() => {
        expect(mocks.ready).toHaveBeenCalled();
      });
      expect(await screen.findByText("The recorder could not be resized.")).toBeVisible();
    } finally {
      measure.mockRestore();
    }
  });

  it("opens the source grid above the toolbar row and closes it with Escape", async () => {
    render(<RecorderDock />);
    const picker = await screen.findByRole("button", { name: "Choose what to record" });

    fireEvent.click(picker);
    const listbox = await screen.findByRole("listbox", { name: "Available sources" });
    const toolbar = screen.getByRole("toolbar", { name: "Recorder" });
    expect(toolbar.innerHTML.indexOf("Available sources")).toBeLessThan(
      toolbar.innerHTML.indexOf("What to record"),
    );

    fireEvent.keyDown(listbox, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Available sources" })).not.toBeInTheDocument();
    expect(picker).toHaveFocus();
  });

  it("disables Record in Region mode until an area is drawn", async () => {
    render(<RecorderDock />);
    await screen.findByRole("button", { name: "Choose what to record" });

    fireEvent.click(screen.getByRole("button", { name: "Record a region" }));

    expect(screen.getByRole("button", { name: "Start recording" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Draw area to record" })).toBeVisible();
  });

  it("records the drawn area and ignores areas drawn for another display", async () => {
    render(<RecorderDock />);
    await screen.findByRole("button", { name: "Choose what to record" });
    fireEvent.click(screen.getByRole("button", { name: "Record a region" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Countdown before recording" }), {
      target: { value: "0" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Draw area to record" }));
    expect(mocks.openRegion).toHaveBeenCalledTimes(1);

    regionListeners.selected?.({ displayId: "other", bounds: { x: 0, y: 0, width: 100, height: 100 } });
    expect(screen.getByRole("button", { name: "Start recording" })).toBeDisabled();

    regionListeners.selected?.({ displayId: "1", bounds: { x: 10, y: 20, width: 640, height: 360 } });
    const redraw = await screen.findByRole("button", { name: "Redraw area to record" });
    expect(redraw).toHaveTextContent("640 × 360 · Redraw");
    expect(screen.getByRole("button", { name: "Start recording" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    await waitFor(() => {
      expect(mocks.border).toHaveBeenCalledWith({ x: 10, y: 20, width: 640, height: 360 });
    });
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "region" }),
      expect.objectContaining({ displayId: "1" }),
      { x: 10, y: 20, width: 640, height: 360 },
    );
  });

  it("re-enables drawing with no error when the overlay is cancelled", async () => {
    render(<RecorderDock />);
    await screen.findByRole("button", { name: "Choose what to record" });
    fireEvent.click(screen.getByRole("button", { name: "Record a region" }));

    fireEvent.click(screen.getByRole("button", { name: "Draw area to record" }));
    expect(screen.getByRole("button", { name: "Draw area to record" })).toBeDisabled();

    regionListeners.cancelled?.();
    expect(await screen.findByRole("button", { name: "Draw area to record" })).not.toBeDisabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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
