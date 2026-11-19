import { describe, expect, it } from "vitest";
import { completionResultSchema } from "../lib/tauri";
import { captureSessionSchema, completionActionSchema, findSavedCapture, type SavedCapture } from "./capture";

describe("captureSessionSchema", () => {
  it("accepts the selected-region Copy & Save action", () => {
    expect(completionActionSchema.parse("copy-and-save")).toBe("copy-and-save");
  });

  it("validates completed and save-pending Copy & Save outcomes", () => {
    expect(
      completionResultSchema.parse({
        action: "copy-and-save",
        cleanupWarning: null,
        diagnostic: null,
        outputPath: "C:/Captures/CapKit.png",
        status: "completed",
      }).status,
    ).toBe("completed");
    expect(
      completionResultSchema.safeParse({
        action: "copy-and-save",
        cleanupWarning: null,
        diagnostic: null,
        outputPath: null,
        status: "completed",
      }).success,
    ).toBe(false);
    expect(
      completionResultSchema.parse({
        action: "copy-and-save",
        cleanupWarning: null,
        diagnostic: "SH-EXPORT-001: disk full",
        outputPath: null,
        status: "save-pending",
      }).status,
    ).toBe("save-pending");
  });

  it("accepts the RFC 3339 UTC offset emitted by the Rust backend", () => {
    const session = captureSessionSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      phase: "snapshot-ready",
      display: {
        id: "monitor-0-0",
        name: "Primary display",
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        scaleFactor: 1.5,
        isPrimary: true,
      },
      snapshotUrl: "http://asset.localhost/source.png",
      colorSpace: "srgb",
      createdAt: "2026-07-18T05:37:23.123+00:00",
    });

    expect(session.createdAt).toBe("2026-07-18T05:37:23.123+00:00");
  });
});

describe("findSavedCapture", () => {
  const capture: SavedCapture = {
    path: String.raw`C:\Users\me\Pictures\CapKit\capture.png`,
    fileName: "capture.png",
    thumbnailPath: String.raw`C:\Temp\capture.png`,
    thumbnailUrl: "asset://capture.png",
    width: 10,
    height: 10,
    sizeBytes: 1,
    modifiedAt: "2026-10-29T10:00:00+05:30",
  };

  it("matches a path spelled with other separators or casing", () => {
    expect(findSavedCapture([capture], "c:/users/me/pictures/capkit/CAPTURE.png")).toBe(capture);
  });

  it("returns null when the capture is not in the library", () => {
    expect(findSavedCapture([capture], String.raw`C:\Users\me\Pictures\CapKit\other.png`)).toBeNull();
  });
});
