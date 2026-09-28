import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecordingArtifacts } from "../../domain/recording";
import type { CursorTrack } from "../../domain/cursorTrack";
import { contentRect, RecordingPreview } from "./RecordingPreview";

const item: RecordingArtifacts = {
  id: "rec-1",
  directory: "C:/Temp/CapKit/recordings/one",
  videoPath: "C:/Temp/CapKit/recordings/one/video.mp4",
  cursorPath: "C:/Temp/CapKit/recordings/one/cursor.json",
  systemAudioPath: null,
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
  times: [0, 1],
  xs: [10, 400],
  ys: [10, 300],
  events: [],
  shapes: [{ time: 0, shape: "default" }],
  displayBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
};

const loadTrack = vi.fn<() => Promise<CursorTrack | null>>(() => Promise.resolve(track));

vi.mock("../../lib/recordingTauri", () => ({
  loadCursorTrack: (): Promise<CursorTrack | null> => loadTrack(),
  recordingSrc: (path: string): string => path,
}));

function stubMedia(video: HTMLVideoElement): void {
  Object.defineProperties(video, {
    clientWidth: { configurable: true, value: 480 },
    clientHeight: { configurable: true, value: 270 },
    videoWidth: { configurable: true, value: 1920 },
    videoHeight: { configurable: true, value: 1080 },
    currentTime: { configurable: true, value: 1 },
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
}

describe("RecordingPreview", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("fetches the track only on the first play", async () => {
    render(<RecordingPreview item={item} />);
    expect(loadTrack).not.toHaveBeenCalled();

    const preview = screen.getByLabelText("Recording 0:10");
    if (!(preview instanceof HTMLVideoElement)) throw new Error("preview video must render");
    stubMedia(preview);
    fireEvent.play(preview);
    await vi.waitFor(() => expect(loadTrack).toHaveBeenCalledTimes(1));

    fireEvent.pause(preview);
    fireEvent.play(preview);
    expect(loadTrack).toHaveBeenCalledTimes(1);
  });

  it("plays plainly with no overlay work when there is no cursor track", () => {
    render(<RecordingPreview item={{ ...item, cursorPath: null }} />);

    const preview = screen.getByLabelText("Recording 0:10");
    if (!(preview instanceof HTMLVideoElement)) throw new Error("preview video must render");
    stubMedia(preview);
    fireEvent.play(preview);

    expect(loadTrack).not.toHaveBeenCalled();
    expect(preview).toHaveAttribute("src", item.videoPath);
  });

  it("maps a wide video into a tall box and a tall video into a wide box", () => {
    // 1920x1080 in a 480x270 box: exact fit, no bars.
    expect(contentRect(480, 270, 1920, 1080)).toEqual({ x: 0, y: 0, width: 480, height: 270 });
    // 1920x1080 in a 300x300 box: pillarboxed.
    expect(contentRect(300, 300, 1920, 1080)).toEqual({ x: 0, y: 65.625, width: 300, height: 168.75 });
    // 1080x1920 in a 300x300 box: letterboxed.
    expect(contentRect(300, 300, 1080, 1920)).toEqual({ x: 65.625, y: 0, width: 168.75, height: 300 });
  });
});
