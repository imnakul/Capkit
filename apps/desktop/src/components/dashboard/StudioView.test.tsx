import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CursorTrack } from "../../domain/cursorTrack";
import type { RecordingArtifacts } from "../../domain/recording";
import { StudioView } from "./StudioView";

const recording: RecordingArtifacts = {
  id: "rec-1",
  directory: "C:/Temp/CapKit/recordings/one",
  videoPath: "C:/Temp/CapKit/recordings/one/video.mp4",
  cursorPath: "C:/Temp/CapKit/recordings/one/cursor.json",
  systemAudioPath: "C:/Temp/CapKit/recordings/one/audio-system.m4a",
  microphonePath: null,
  cameraPath: null,
  width: 1920,
  height: 1080,
  fps: 30,
  durationSeconds: 10,
  stats: { paused: false, elapsedSeconds: 10, encodedFrames: 300, droppedFrames: 0, bytesWritten: 4096 },
};

const track: CursorTrack = {
  version: 1,
  times: [0, 1, 2],
  xs: [10, 400, 900],
  ys: [10, 300, 700],
  events: [
    { time: 1, kind: "down", button: "left", x: 400, y: 300 },
    { time: 1.1, kind: "up", button: "left", x: 400, y: 300 },
  ],
  shapes: [{ time: 0, shape: "default" }],
  displayBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
};

vi.mock("../../lib/recordingTauri", () => ({
  loadCursorTrack: (): Promise<CursorTrack> => Promise.resolve(track),
  recordingSrc: (path: string): string => path,
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

describe("StudioView", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("capkit.recordings.v1", JSON.stringify([recording]));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("invites a recording when the library is empty", () => {
    window.localStorage.clear();
    render(<StudioView />);
    expect(screen.getByRole("heading", { name: "Nothing to edit yet" })).toBeVisible();
  });

  it("opens the newest recording with a preview and a timeline", async () => {
    render(<StudioView />);
    expect(await screen.findByRole("img", { name: "Composed preview" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Timeline" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Play the preview" })).toBeVisible();
  });

  it("trims non-destructively and reports the remaining duration", async () => {
    render(<StudioView />);
    await screen.findByRole("group", { name: "Timeline" });

    const handle = screen.getByRole("button", { name: "Trim end" });
    // jsdom gives the track a zero-width rect, so the drag lands at 0 and the
    // trim clamps to the minimum — enough to prove the bounds are applied.
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 0 });

    await waitFor(() => {
      expect(screen.getByText(/Trim 0:00/)).toBeVisible();
    });
  });

  it("shows the camera empty state and disables its toggle without a track", async () => {
    render(<StudioView />);
    await screen.findByRole("img", { name: "Composed preview" });

    fireEvent.click(screen.getByRole("tab", { name: "Show Motion controls" }));
    fireEvent.click(screen.getByRole("button", { name: "Camera" }));
    expect(await screen.findByText("This recording has no camera")).toBeVisible();
    expect(screen.getByRole("switch", { name: "Show camera" })).toBeDisabled();
  });

  it("exposes the stage, motion, and audio panels", async () => {
    render(<StudioView />);
    await screen.findByRole("img", { name: "Composed preview" });

    expect(screen.getByRole("button", { name: "Apply the Spotlight look — Colours pulled from the image" })).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Show Motion controls" }));
    expect(await screen.findByRole("switch", { name: "Automatic zoom" })).toBeChecked();
    expect(screen.getByRole("slider", { name: "Smoothing" })).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Show Audio controls" }));
    // The recording has system audio but no microphone, so only one is offered.
    expect(await screen.findByRole("slider", { name: "Volume" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Microphone/ })).toBeNull();
  });

  it("keeps a composition per recording", async () => {
    render(<StudioView />);
    await screen.findByRole("img", { name: "Composed preview" });

    fireEvent.click(screen.getByRole("switch", { name: "Background" }));
    await waitFor(
      () => {
        expect(window.localStorage.getItem("capkit.studio.scene.v1")).toContain("rec-1");
      },
      { timeout: 3000 },
    );
  });

  it("offers both export formats", async () => {
    render(<StudioView />);
    await screen.findByRole("img", { name: "Composed preview" });
    expect(screen.getByRole("button", { name: "Export as MP4" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export as GIF" })).toBeEnabled();
  });
});
