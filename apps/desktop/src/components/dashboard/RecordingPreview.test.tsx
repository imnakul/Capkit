import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecordingArtifacts } from "../../domain/recording";
import { RecordingPreview } from "./RecordingPreview";

const item: RecordingArtifacts = {
  id: "rec-1",
  directory: "C:/Temp/CapKit/recordings/one",
  videoPath: "C:/Temp/CapKit/recordings/one/video.mp4",
  cursorPath: "C:/Temp/CapKit/recordings/one/cursor.json",
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

vi.mock("../../lib/recordingTauri", () => ({
  recordingSrc: (path: string): string => path,
}));

describe("RecordingPreview", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the first frame without in-app playback controls", () => {
    const { container } = render(<RecordingPreview item={item} onOpen={vi.fn()} />);
    const video = container.querySelector("video");
    expect(video).toHaveAttribute("src", `${item.videoPath}#t=0.001`);
    expect(video).not.toHaveAttribute("controls");
    expect(video).toHaveAttribute("tabindex", "-1");
  });

  it("opens the recording from a native button, so Enter and Space work too", () => {
    const onOpen = vi.fn<(value: RecordingArtifacts) => void>();
    render(<RecordingPreview item={item} onOpen={onOpen} />);
    const open = screen.getByRole("button", { name: "Play recording 0:10 in your video player" });
    expect(open.tagName).toBe("BUTTON");
    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith(item);
  });
});
