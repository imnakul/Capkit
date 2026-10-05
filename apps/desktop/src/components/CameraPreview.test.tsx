import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraPreview } from "./CameraPreview";

const mocks = {
  ready: vi.fn<(mode: string) => Promise<void>>(() => Promise.resolve()),
  close: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  prepare: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  settings: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  stream: vi.fn<() => Promise<MediaStream>>(),
  drag: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  trackBegin: vi.fn<(extension: string) => Promise<void>>(() => Promise.resolve()),
  chunk: vi.fn<(bytes: Uint8Array) => Promise<void>>(() => Promise.resolve()),
};

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state: "inactive" | "recording" | "paused" = "inactive";
  constructor(
    public stream: unknown,
    public options: unknown,
  ) {
    FakeRecorder.instances.push(this);
  }
  start(): void {
    this.state = "recording";
  }
  stop(): void {
    this.state = "inactive";
    this.onstop?.();
  }
  pause(): void {
    this.state = "paused";
  }
  resume(): void {
    this.state = "recording";
  }
  static isTypeSupported(type: string): boolean {
    return type === "video/mp4;codecs=avc1";
  }
}

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: (): { startDragging: () => Promise<void> } => ({
    startDragging: (): Promise<void> => mocks.drag(),
  }),
}));

type StartedHandler = () => void;
type PausedHandler = (event: { payload: { paused: boolean } }) => void;

const cameraEvents = vi.hoisted((): {
  started: StartedHandler | null;
  paused: PausedHandler | null;
  finish: StartedHandler | null;
} => ({
  started: null,
  paused: null,
  finish: null,
}));

const emitted: string[] = [];

vi.mock("@tauri-apps/api/event", () => ({
  // The handler is stored untyped on purpose: the component's own listen
  // calls carry the real payload types, and the tests below drive them.
  listen: (event: string, handler: never): Promise<() => void> => {
    if (event === "snaphub://recording-started") cameraEvents.started = handler;
    else if (event === "snaphub://recording-paused") cameraEvents.paused = handler;
    else if (event === "snaphub://camera-track-finish") cameraEvents.finish = handler;
    return Promise.resolve((): void => undefined);
  },
  emit: (event: string): Promise<void> => {
    emitted.push(event);
    return Promise.resolve();
  },
}));

vi.mock("../lib/recordingTauri", () => ({
  beginCameraTrack: (extension: string): Promise<void> => mocks.trackBegin(extension),
  appendCameraChunk: (bytes: Uint8Array): Promise<void> => mocks.chunk(bytes),
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
    vi.unstubAllGlobals();
    cameraEvents.started = null;
    cameraEvents.paused = null;
    cameraEvents.finish = null;
    emitted.length = 0;
    FakeRecorder.instances.length = 0;
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

  it("shows shape glyphs with pressed state and no text", async () => {
    mocks.stream.mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream);
    render(<CameraPreview />);
    await screen.findByLabelText("Camera preview");

    for (const name of ["Circle camera", "Rounded camera", "Square camera"] as const) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveTextContent("");
      expect(button.querySelector("svg")).not.toBeNull();
    }
    expect(screen.getByRole("button", { name: "Circle camera" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Square camera" }));
    expect(screen.getByRole("button", { name: "Square camera" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const close = screen.getByRole("button", { name: "Close the camera" });
    expect(close.querySelector("svg")).not.toBeNull();
    expect(close).not.toHaveTextContent("close");
  });

  it("clips the bubble per shape", async () => {
    mocks.stream.mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream);
    render(<CameraPreview />);
    const video = await screen.findByLabelText("Camera preview");
    const wrapper = video.parentElement;
    expect(wrapper?.className).toContain("[clip-path:circle(50%)]");

    fireEvent.click(screen.getByRole("button", { name: "Rounded camera" }));
    expect(video.parentElement?.className).toContain("[clip-path:inset(0_round_22%)]");

    fireEvent.click(screen.getByRole("button", { name: "Square camera" }));
    expect(video.parentElement?.className).not.toContain("clip-path");
  });

  it("drags the bubble but not from its controls", async () => {
    mocks.stream.mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream);
    render(<CameraPreview />);
    const video = await screen.findByLabelText("Camera preview");

    fireEvent.pointerDown(video, { button: 0 });
    expect(mocks.drag).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Circle camera" }), { button: 0 });
    expect(mocks.drag).toHaveBeenCalledTimes(1);
  });

  it("appends chunks in order and emits finished after the last append", async () => {
    mocks.stream.mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream);
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    render(<CameraPreview />);
    await screen.findByLabelText("Camera preview");
    await vi.waitFor(() => {
      expect(mocks.ready).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(cameraEvents.started).not.toBeNull();
    });

    cameraEvents.started?.();
    await vi.waitFor(() => expect(mocks.trackBegin).toHaveBeenCalledWith("mp4"));
    await vi.waitFor(() => expect(FakeRecorder.instances.length).toBeGreaterThan(0));
    const recorder = FakeRecorder.instances.at(-1);
    expect(recorder).not.toBeUndefined();

    let resolveFirst!: () => void;
    mocks.chunk.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }),
    );
    recorder?.ondataavailable?.({ data: new Blob(["one"]) });
    recorder?.ondataavailable?.({ data: new Blob(["two"]) });
    recorder?.ondataavailable?.({ data: new Blob(["three"]) });
    await vi.waitFor(() => expect(mocks.chunk).toHaveBeenCalledTimes(1));
    resolveFirst();
    await vi.waitFor(() => expect(mocks.chunk).toHaveBeenCalledTimes(3));
    const sizes = mocks.chunk.mock.calls.map((call) => call[0].length);
    expect(sizes).toEqual([3, 3, 5]);

    cameraEvents.finish?.();
    await vi.waitFor(() => {
      expect(emitted).toContain("snaphub://camera-track-finished");
    });
  });

  it("pauses and resumes the camera recorder with the recording", async () => {
    mocks.stream.mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream);
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    render(<CameraPreview />);
    await screen.findByLabelText("Camera preview");
    await vi.waitFor(() => {
      expect(mocks.ready).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(cameraEvents.started).not.toBeNull();
    });

    cameraEvents.started?.();
    await vi.waitFor(() => expect(FakeRecorder.instances.length).toBeGreaterThan(0));
    const recorder = FakeRecorder.instances.at(-1);

    cameraEvents.paused?.({ payload: { paused: true } });
    expect(recorder?.state).toBe("paused");
    cameraEvents.paused?.({ payload: { paused: false } });
    expect(recorder?.state).toBe("recording");
  });

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
