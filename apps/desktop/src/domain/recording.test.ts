import { describe, expect, it } from "vitest";
import {
  defaultRecorderSettings,
  formatBytes,
  formatDuration,
  readRecorderSettings,
  repeatRatio,
  toRecordingRequest,
  type RecordingSource,
} from "./recording";

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

const window: RecordingSource = {
  ...display,
  id: "window:9",
  kind: "window",
  title: "Editor",
  bounds: { x: 120, y: 80, width: 1280, height: 800 },
  isPrimary: false,
};

describe("formatting", () => {
  it("shows minutes and seconds, and hours only when needed", () => {
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(3671)).toBe("1:01:11");
  });

  it("scales byte counts", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("requests", () => {
  it("records a whole display without a crop", () => {
    const request = toRecordingRequest(defaultRecorderSettings, display, null);
    expect(request.displayId).toBe("1");
    expect(request.region).toBeNull();
  });

  it("records a window as a crop of the display it sits on", () => {
    const request = toRecordingRequest(
      { ...defaultRecorderSettings, mode: "window" },
      window,
      null,
    );
    // A per-window capture would break the moment the window is resized, so the
    // window's bounds travel as a crop of its display instead.
    expect(request.displayId).toBe("1");
    expect(request.region).toEqual(window.bounds);
  });

  it("passes a drawn region straight through", () => {
    const region = { x: 10, y: 20, width: 300, height: 200 };
    const request = toRecordingRequest(
      { ...defaultRecorderSettings, mode: "region" },
      display,
      region,
    );
    expect(request.region).toEqual(region);
  });

  it("sends no microphone id when the default device is wanted", () => {
    const request = toRecordingRequest(defaultRecorderSettings, display, null);
    expect(request.microphoneDeviceId).toBeNull();
  });

  it("leaves the hardware cursor out of the frames by default", () => {
    // The cursor is recorded as its own track precisely so the editor can
    // smooth it; burning it in would make that impossible.
    expect(toRecordingRequest(defaultRecorderSettings, display, null).captureCursor).toBe(false);
  });
});

describe("stored settings", () => {
  it("falls back to defaults for missing or broken storage", () => {
    expect(readRecorderSettings(null)).toEqual(defaultRecorderSettings);
    expect(readRecorderSettings('{"mode":"nonsense"}')).toEqual(defaultRecorderSettings);
  });

  it("restores a valid configuration", () => {
    const stored = { ...defaultRecorderSettings, fps: 60 as const, countdown: 5 as const };
    expect(readRecorderSettings(JSON.stringify(stored))).toEqual(stored);
  });
});

describe("health", () => {
  it("reports the share of repeated frames", () => {
    expect(repeatRatio({ paused: false, elapsedSeconds: 1, encodedFrames: 100, droppedFrames: 5, bytesWritten: 0 })).toBeCloseTo(0.05);
    expect(repeatRatio({ paused: false, elapsedSeconds: 0, encodedFrames: 0, droppedFrames: 0, bytesWritten: 0 })).toBe(0);
  });
});
