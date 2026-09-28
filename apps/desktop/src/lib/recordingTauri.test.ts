import { afterEach, describe, expect, it, vi } from "vitest";
import { finishCameraTrack } from "./recordingTauri";

const cameraFinished = vi.hoisted((): { handler: (() => void) | null } => ({
  handler: null,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: never): Promise<() => void> => {
    if (event === "snaphub://camera-track-finished") cameraFinished.handler = handler;
    return Promise.resolve((): void => undefined);
  },
  emit: (): Promise<void> => Promise.resolve(),
}));

describe("finishCameraTrack", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    cameraFinished.handler = null;
  });

  it("resolves when the finished event arrives", async () => {
    const finished = finishCameraTrack(3000);
    await vi.waitFor(() => {
      expect(cameraFinished.handler).not.toBeNull();
    });
    cameraFinished.handler?.();
    await finished;
  });

  it("resolves after the timeout when nothing arrives", async () => {
    vi.useFakeTimers();
    const finished = finishCameraTrack(3000);
    await vi.advanceTimersByTimeAsync(2999);
    let settled = false;
    void finished.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    await finished;
  });
});
