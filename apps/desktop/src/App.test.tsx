import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { CaptureSession, CompletionAction } from "./domain/capture";
import type { CompletionResult } from "./lib/tauri";

const captureMocks = vi.hoisted(() => ({
  captureScrolling: vi.fn(),
  completeCapture: vi.fn(),
  listeners: [] as (() => void)[],
  requestCapture: vi.fn(),
  retryCaptureSave: vi.fn(),
  showCaptureSurface: vi.fn(),
}));

vi.mock("./lib/tauri", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/tauri")>();
  return {
    ...actual,
    captureScrolling: captureMocks.captureScrolling,
    completeCapture: captureMocks.completeCapture,
    listenForCaptureRequest: vi.fn((callback: () => void) => {
      captureMocks.listeners.push(callback);
      return Promise.resolve((): void => {
        captureMocks.listeners.splice(captureMocks.listeners.indexOf(callback), 1);
      });
    }),
    requestCapture: captureMocks.requestCapture,
    retryCaptureSave: captureMocks.retryCaptureSave,
    showCaptureSurface: captureMocks.showCaptureSurface,
  };
});

function completedResult(action: CompletionAction): CompletionResult {
  return {
    action,
    cleanupWarning: null,
    diagnostic: null,
    outputPath: action === "copy-and-save" || action === "save" ? "Demo/Capkit.png" : null,
    status: "completed" as const,
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let rejectPromise: (error: unknown) => void = () => undefined;
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
}

function createCaptureSession(snapshotUrl = ""): CaptureSession {
  return {
    id: crypto.randomUUID(),
    phase: "snapshot-ready",
    display: {
      id: "display-1",
      name: "Demo display",
      bounds: { x: 0, y: 0, width: 1280, height: 720 },
      scaleFactor: 1,
      isPrimary: true,
    },
    snapshotUrl,
    colorSpace: "srgb",
    createdAt: new Date().toISOString(),
  };
}

let originalImageDecode: PropertyDescriptor | undefined;

function mockImageDecode(decode: () => Promise<void>): ReturnType<typeof vi.fn> {
  const imageDecode = vi.fn(decode);
  originalImageDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "decode");
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: imageDecode,
  });
  return imageDecode;
}

function restoreImageDecode(): void {
  if (originalImageDecode === undefined) {
    Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
  } else {
    Object.defineProperty(HTMLImageElement.prototype, "decode", originalImageDecode);
  }
  originalImageDecode = undefined;
}

function createAnimationFrameQueue(): {
  flushNext: () => void;
  pendingCount: () => number;
} {
  const callbacks: { callback: FrameRequestCallback; id: number }[] = [];
  let nextId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
    nextId += 1;
    callbacks.push({ callback, id: nextId });
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    const index = callbacks.findIndex((frame) => frame.id === id);
    if (index >= 0) callbacks.splice(index, 1);
  });
  return {
    flushNext: (): void => {
      const frame = callbacks.shift();
      if (frame !== undefined) act(() => frame.callback(0));
    },
    pendingCount: (): number => callbacks.length,
  };
}

async function selectRegion(): Promise<HTMLElement> {
  expect(await screen.findAllByText(/Hover to preview targets/)).not.toHaveLength(0);
  const surface = screen.getByRole("main");
  fireEvent.pointerMove(surface, { clientX: 80, clientY: 90, pointerId: 1 });
  fireEvent.pointerDown(surface, { button: 0, clientX: 80, clientY: 90, pointerId: 1 });
  fireEvent.pointerMove(surface, { buttons: 1, clientX: 520, clientY: 390, pointerId: 1 });
  fireEvent.pointerUp(surface, { buttons: 0, clientX: 520, clientY: 390, pointerId: 1 });
  return screen.findByRole("button", { name: "Copy & Save" });
}

vi.mock("./components/AnnotationCanvas", () => ({
  AnnotationCanvas: function MockAnnotationCanvas(): React.JSX.Element {
    return <div aria-label="Screenshot annotation canvas" role="application" />;
  },
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    captureMocks.listeners.length = 0;
    captureMocks.requestCapture.mockImplementation(() => Promise.resolve(createCaptureSession()));
    captureMocks.showCaptureSurface.mockResolvedValue(undefined);
    captureMocks.completeCapture.mockImplementation((action: CompletionAction) =>
      Promise.resolve(completedResult(action)),
    );
    captureMocks.retryCaptureSave.mockImplementation(() =>
      Promise.resolve(completedResult("copy-and-save")),
    );
    captureMocks.captureScrolling.mockImplementation(() => Promise.resolve({
      frameCount: 1,
      outputPath: "Demo/scroll.png",
      previewUrl: "Demo/scroll.png",
      stoppedReason: "manual-ready",
      stickyHeaderHeight: 0,
    }));
  });

  afterEach(() => {
    cleanup();
    restoreImageDecode();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("waits for the snapshot backdrop to decode and paint before revealing capture", async () => {
    const decoded = deferred<undefined>();
    const imageDecode = mockImageDecode(() => decoded.promise);
    const frames = createAnimationFrameQueue();
    captureMocks.requestCapture.mockResolvedValueOnce(
      createCaptureSession("asset://capture.bmp"),
    );
    render(<App />);

    await screen.findByRole("main");
    expect(imageDecode).toHaveBeenCalledTimes(1);
    expect(captureMocks.showCaptureSurface).not.toHaveBeenCalled();

    await act(async () => {
      decoded.resolve(undefined);
      await decoded.promise;
    });
    expect(frames.pendingCount()).toBe(1);
    frames.flushNext();
    expect(frames.pendingCount()).toBe(1);
    expect(captureMocks.showCaptureSurface).not.toHaveBeenCalled();
    frames.flushNext();

    await waitFor(() => expect(captureMocks.showCaptureSurface).toHaveBeenCalledTimes(1));
  });

  it("reveals after 1500 ms when the backdrop decode never settles", async () => {
    vi.useFakeTimers();
    mockImageDecode(() => new Promise<void>(() => undefined));
    captureMocks.requestCapture.mockResolvedValueOnce(
      createCaptureSession("asset://capture.bmp"),
    );
    render(<App />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(captureMocks.showCaptureSurface).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1499));
    expect(captureMocks.showCaptureSurface).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(captureMocks.showCaptureSurface).toHaveBeenCalledTimes(1);
  });

  it("does not reveal a cancelled session and allows a later capture", async () => {
    const decoded = deferred<undefined>();
    mockImageDecode(() => decoded.promise);
    captureMocks.requestCapture.mockResolvedValueOnce(
      createCaptureSession("asset://capture.bmp"),
    );
    render(<App />);
    await screen.findByRole("main");

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("main")).not.toBeInTheDocument());
    await act(async () => {
      decoded.resolve(undefined);
      await decoded.promise;
    });
    expect(captureMocks.showCaptureSurface).not.toHaveBeenCalled();

    act(() => captureMocks.listeners.forEach((listener) => listener()));
    await screen.findByRole("main");
    await waitFor(() => expect(captureMocks.showCaptureSurface).toHaveBeenCalledTimes(1));
  });

  it("reveals after a failed backdrop decode has passed two frames", async () => {
    const decoded = deferred<undefined>();
    mockImageDecode(() => decoded.promise);
    const frames = createAnimationFrameQueue();
    captureMocks.requestCapture.mockResolvedValueOnce(
      createCaptureSession("asset://capture.bmp"),
    );
    render(<App />);
    await screen.findByRole("main");

    await act(async () => {
      decoded.reject(new Error("decode failed"));
      await decoded.promise.catch(() => undefined);
    });
    expect(frames.pendingCount()).toBe(1);
    frames.flushNext();
    expect(captureMocks.showCaptureSurface).not.toHaveBeenCalled();
    frames.flushNext();

    await waitFor(() => expect(captureMocks.showCaptureSurface).toHaveBeenCalledTimes(1));
  });
  it("dismisses capture with Escape before a region is selected", async () => {
    render(<App />);

    expect(await screen.findAllByText(/Hover to preview targets/)).not.toHaveLength(0);
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("main")).not.toBeInTheDocument();
    });
  });

  it("creates an in-place selection and reveals quick actions", async () => {
    render(<App />);

    expect(await screen.findAllByText(/Hover to preview targets/)).not.toHaveLength(0);
    const surface = screen.getByRole("main");
    fireEvent.pointerMove(surface, { clientX: 80, clientY: 90, pointerId: 1 });
    expect(screen.getByLabelText(/Detected window/)).toBeInTheDocument();

    fireEvent.pointerDown(surface, { button: 0, clientX: 80, clientY: 90, pointerId: 1 });
    fireEvent.pointerMove(surface, { buttons: 1, clientX: 520, clientY: 390, pointerId: 1 });
    fireEvent.pointerMove(surface, { buttons: 0, clientX: 700, clientY: 520, pointerId: 1 });

    expect(screen.getByRole("toolbar", { name: "Quick editing tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" }).closest(".absolute")).toHaveClass(
      "[&_button]:!cursor-[inherit]",
    );
    expect(screen.getByText("440 × 300 px")).toBeInTheDocument();

    const shapeFamily = screen.getByRole("button", { name: "Rectangle group" });
    fireEvent.pointerDown(shapeFamily, { button: 0, pointerId: 2 });
    fireEvent.click(shapeFamily);
    expect(shapeFamily).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Rectangle" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("440 × 300 px")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("main")).not.toBeInTheDocument();
      expect(screen.queryByRole("toolbar", { name: "Quick editing tools" })).not.toBeInTheDocument();
    });
  });

  it("shows Copy & Save with A between Copy and Save", async () => {
    render(<App />);
    const combined = await selectRegion();
    const toolbar = screen.getByRole("toolbar", { name: "Capture actions" });

    expect(combined).toHaveAttribute("aria-keyshortcuts", "A");
    expect(combined).toHaveTextContent("A");
    expect(
      Array.from(toolbar.querySelectorAll("button")).map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Copy", "Copy & Save", "Save", "Pin"]);
  });

  it("ignores the completion key without a selection, with modifiers, or in an editable field", async () => {
    render(<App />);
    expect(await screen.findAllByText(/Hover to preview targets/)).not.toHaveLength(0);
    fireEvent.keyDown(window, { key: "A" });
    await selectRegion();
    fireEvent.keyDown(window, { key: "A", ctrlKey: true });

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    fireEvent.keyDown(input, { key: "A" });

    expect(captureMocks.completeCapture).not.toHaveBeenCalled();
    input.remove();
  });

  it("ignores the completion key while a selection is being drafted", async () => {
    render(<App />);
    expect(await screen.findAllByText(/Hover to preview targets/)).not.toHaveLength(0);
    const surface = screen.getByRole("main");
    fireEvent.pointerDown(surface, { button: 0, clientX: 40, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(surface, { buttons: 1, clientX: 200, clientY: 160, pointerId: 1 });

    fireEvent.keyDown(window, { key: "A" });

    expect(captureMocks.completeCapture).not.toHaveBeenCalled();
  });

  it("ignores the completion key during scrolling preview", async () => {
    render(<App />);
    await selectRegion();
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Counter group" }));
    fireEvent.click(screen.getByRole("button", { name: "Scrolling capture" }));
    expect(await screen.findByAltText("Stitched scrolling capture preview")).toBeVisible();

    fireEvent.keyDown(window, { key: "A" });

    expect(captureMocks.completeCapture).not.toHaveBeenCalled();
    expect(screen.queryByRole("toolbar", { name: "Capture actions" })).not.toBeInTheDocument();
  });

  it("guards rapid A presses before the first completion settles", async () => {
    const pending = deferred<ReturnType<typeof completedResult>>();
    captureMocks.completeCapture.mockReturnValueOnce(pending.promise);
    render(<App />);
    await selectRegion();

    fireEvent.keyDown(window, { key: "A" });
    fireEvent.keyDown(window, { key: "A" });
    expect(captureMocks.completeCapture).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Copying & saving…");
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();

    act(() => pending.resolve(completedResult("copy-and-save")));
    await waitFor(() => expect(screen.queryByRole("main")).not.toBeInTheDocument());
  });

  it("focuses Retry save after a partial failure and retries save only", async () => {
    captureMocks.completeCapture.mockResolvedValueOnce({
      action: "copy-and-save",
      cleanupWarning: null,
      diagnostic: "SH-EXPORT-001: disk full",
      outputPath: null,
      status: "save-pending",
    });
    render(<App />);
    const combined = await selectRegion();
    fireEvent.click(combined);

    const retry = await screen.findByRole("button", { name: "Retry save" });
    expect(retry).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Copied, but could not save. Retry save or press Esc to cancel.",
    );
    expect(screen.getByText("SH-EXPORT-001: disk full")).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    expect(screen.queryByRole("toolbar", { name: "Quick editing tools" })).not.toBeInTheDocument();

    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole("main")).not.toBeInTheDocument());
    expect(captureMocks.completeCapture).toHaveBeenCalledTimes(1);
    expect(captureMocks.retryCaptureSave).toHaveBeenCalledTimes(1);
  });

  it("keeps the selected scene editable after a render or clipboard failure", async () => {
    captureMocks.completeCapture.mockRejectedValueOnce(new Error("SH-CLIPBOARD-001: unavailable"));
    render(<App />);
    const combined = await selectRegion();
    fireEvent.click(combined);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Could not copy this capture. Try again.",
    );
    expect(screen.getByRole("status")).toHaveTextContent("SH-CLIPBOARD-001: unavailable");
    expect(combined).toBeEnabled();
    expect(screen.getByRole("toolbar", { name: "Quick editing tools" })).toBeVisible();
  });

  it("shows a save-specific error and keeps the selected scene after Save fails", async () => {
    captureMocks.completeCapture.mockRejectedValueOnce(new Error("SH-EXPORT-002: read only"));
    render(<App />);
    await selectRegion();

    fireEvent.keyDown(window, { key: "S" });

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Could not save this capture. Try again.");
    expect(status).toHaveTextContent("SH-EXPORT-002: read only");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("toolbar", { name: "Quick editing tools" })).toBeVisible();
  });

  it("ignores a stale completion response after cancel and a new capture", async () => {
    const pending = deferred<ReturnType<typeof completedResult>>();
    captureMocks.completeCapture.mockReturnValueOnce(pending.promise);
    render(<App />);
    await selectRegion();
    fireEvent.keyDown(window, { key: "A" });
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("main")).not.toBeInTheDocument());

    act(() => {
      captureMocks.listeners.forEach((listener) => listener());
    });
    expect(await screen.findAllByText(/Hover to preview targets/)).not.toHaveLength(0);
    act(() => {
      pending.resolve(completedResult("copy-and-save"));
    });
    await act(async () => {
      await pending.promise;
    });

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy & Save" })).not.toBeInTheDocument();
  });
});
