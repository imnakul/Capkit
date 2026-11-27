import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CursorTrack } from "../../domain/cursorTrack";
import type { RecordingArtifacts } from "../../domain/recording";
import { RecordView } from "./RecordView";

const recording: RecordingArtifacts = {
  id: "rec-1",
  directory: "C:/Temp/CapKit/recordings/one",
  videoPath: "C:/Temp/CapKit/recordings/one/video.mp4",
  cursorPath: null,
  systemAudioPath: null,
  microphonePath: null,
  cameraPath: null,
  cursorInVideo: false,
  width: 1920,
  height: 1080,
  fps: 30,
  durationSeconds: 10,
  stats: { paused: false, elapsedSeconds: 10, encodedFrames: 300, droppedFrames: 0, bytesWritten: 4096 },
};

const track: CursorTrack = {
  version: 1,
  times: [0, 1],
  xs: [10, 400],
  ys: [10, 300],
  events: [{ time: 1, kind: "down", button: "left", x: 400, y: 300 }],
  shapes: [{ time: 0, shape: "default" }],
  keysRecorded: false,
  keys: [],
  displayBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
};

const openRecorder = vi.fn<() => Promise<void>>();
const openRecording = vi.fn<(path: string) => Promise<void>>(() => Promise.resolve());
const copyRecording = vi.fn<(path: string) => Promise<void>>(() => Promise.resolve());
const revealRecording = vi.fn<(path: string) => Promise<void>>(() => Promise.resolve());

vi.mock("../../lib/recordingTauri", () => ({
  openRecorder: (): Promise<void> => openRecorder(),
  openRecording: (path: string): Promise<void> => openRecording(path),
  copyRecording: (path: string): Promise<void> => copyRecording(path),
  revealRecording: (path: string): Promise<void> => revealRecording(path),
  recordingSrc: (path: string): string => path,
  recordingSupported: (): Promise<boolean> => Promise.resolve(true),
  loadCursorTrack: (): Promise<CursorTrack> => Promise.resolve(track),
}));

vi.mock("../../lib/tauri", () => ({
  describeInvokeError: (_error: unknown, fallback: string): string => fallback,
}));

vi.mock("../../lib/videoExport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/videoExport")>();
  return {
    ...actual,
    canEncodeVideo: (): Promise<boolean> => Promise.resolve(true),
    exportVideo: (): Promise<Blob> => Promise.resolve(new Blob(["x"])),
    downloadExport: (): void => undefined,
  };
});

describe("RecordView", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("capkit.recordings.v1", JSON.stringify([recording]));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens the recorder from Start recording", async () => {
    render(<RecordView />);

    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));

    await vi.waitFor(() => expect(openRecorder).toHaveBeenCalledTimes(1));
  });

  it("disables Start recording while opening so a double click opens once", async () => {
    let resolveOpen!: () => void;
    openRecorder.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        resolveOpen = resolve;
      }),
    );
    render(<RecordView />);

    const button = screen.getByRole("button", { name: "Start recording" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(openRecorder).toHaveBeenCalledTimes(1);
    resolveOpen();
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    expect(openRecorder).toHaveBeenCalledTimes(1);
  });

  it("opens a recording in the video player from its thumbnail", async () => {
    render(<RecordView />);

    fireEvent.click(screen.getByRole("button", { name: "Play recording 0:10 in your video player" }));

    await vi.waitFor(() => expect(openRecording).toHaveBeenCalledWith(recording.videoPath));
  });

  it("explains when the video player cannot open the recording", async () => {
    openRecording.mockRejectedValueOnce(new Error("missing"));
    render(<RecordView />);

    fireEvent.click(screen.getByRole("button", { name: "Play recording 0:10 in your video player" }));

    expect(await screen.findByText("Couldn't open this recording in your video player.")).toBeInTheDocument();
  });

  it("copies the recording file and shows the tick", async () => {
    render(<RecordView />);

    fireEvent.click(screen.getByRole("button", { name: "Copy this recording" }));

    await vi.waitFor(() => expect(copyRecording).toHaveBeenCalledWith(recording.videoPath));
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });

  it("takes the tick back and explains when the copy fails", async () => {
    copyRecording.mockRejectedValueOnce(new Error("busy"));
    render(<RecordView />);

    fireEvent.click(screen.getByRole("button", { name: "Copy this recording" }));

    expect(await screen.findByText("Couldn't copy this recording.")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
  });

  it("shows the recording in its folder", async () => {
    render(<RecordView />);

    fireEvent.click(screen.getByRole("button", { name: "Show this recording in its folder" }));

    await vi.waitFor(() => expect(revealRecording).toHaveBeenCalledWith(recording.videoPath));
  });

  it("explains when the folder cannot be shown", async () => {
    revealRecording.mockRejectedValueOnce(new Error("gone"));
    render(<RecordView />);

    fireEvent.click(screen.getByRole("button", { name: "Show this recording in its folder" }));

    expect(await screen.findByText("Couldn't show this recording in its folder.")).toBeInTheDocument();
  });

  it("fills the available width with as many recording columns as fit, like screenshots", () => {
    render(<RecordView />);

    const list = screen.getByRole("list", { name: "Recordings" });
    expect(list.className).toContain("grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]");
  });

  it("edits a recording in place and returns to the library", async () => {
    render(<RecordView />);

    fireEvent.click(screen.getByRole("button", { name: "Edit this recording" }));

    // Editing is Studio, reached from the recording itself, so the editor and
    // its way back both live inside Record.
    expect(await screen.findByRole("img", { name: "Composed preview" })).toBeInTheDocument();
    const back = screen.getByRole("button", { name: "Back to recordings" });
    expect(back).toBeVisible();
    const topBar = back.closest("div");
    if (topBar === null) throw new Error("The back button must sit in the editing top bar");
    expect(within(topBar).getByText("0:10")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit this recording" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to recordings" }));

    expect(screen.getByRole("button", { name: "Edit this recording" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Back to recordings" })).toBeNull();
  });
});
