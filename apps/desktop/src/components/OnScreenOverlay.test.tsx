import { act, cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Profiler } from "react";
import { defaultSnaphubSettings } from "../domain/settings";
import { requestOnScreenSnapshot, saveOnScreenCapture } from "../lib/tauri";
import { OnScreenOverlay } from "./OnScreenOverlay";

vi.mock("../lib/tauri", () => ({
  describeInvokeError: (error: unknown, fallback: string): string =>
    typeof error === "string" ? error : fallback,
  dismissOnScreen: vi.fn(() => Promise.resolve()),
  requestOnScreenSession: vi.fn(() => Promise.resolve({
    id: "c241d954-503e-4b62-bff9-c9a40b5f895f",
    phase: "snapshot-ready",
    display: {
      id: "display-1",
      name: "Display",
      bounds: { x: 0, y: 0, width: 1280, height: 720 },
      scaleFactor: 1,
      isPrimary: true,
    },
    snapshotUrl: "asset://on-screen.bmp",
    colorSpace: "unknown",
    createdAt: "2026-07-25T10:00:00+05:30",
  })),
  requestOnScreenSnapshot: vi.fn(() => Promise.resolve("asset://on-screen.bmp")),
  saveOnScreenCapture: vi.fn(() => Promise.resolve("C:/Captures/CapKit.png")),
  showOnScreenSurface: vi.fn(() => Promise.resolve()),
}));

function createAnimationFrameQueue(): {
  flushNextFrame: () => void;
  pendingFrames: () => number;
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
    flushNextFrame: (): void => {
      const frame = callbacks.shift();
      if (frame !== undefined) frame.callback(0);
    },
    pendingFrames: (): number => callbacks.length,
  };
}

function createMediaQueryList(matches: boolean, media: string): MediaQueryList {
  return {
    matches,
    media,
    onchange: null,
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
    dispatchEvent: (): boolean => false,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let settle: (value: T) => void = () => {
    throw new Error("Deferred promise was not initialized");
  };
  const promise = new Promise<T>((resolvePromise) => {
    settle = resolvePromise;
  });
  return { promise, resolve: (value) => settle(value) };
}

function drawLaserStroke(
  surface: HTMLElement,
  frames: ReturnType<typeof createAnimationFrameQueue>,
  pointerId: number,
): void {
  fireEvent.pointerDown(surface, {
    button: 0,
    clientX: pointerId * 10,
    clientY: pointerId * 12,
    pointerId,
  });
  fireEvent.pointerMove(surface, {
    buttons: 1,
    clientX: pointerId * 10 + 40,
    clientY: pointerId * 12 + 35,
    pointerId,
  });
  frames.flushNextFrame();
  fireEvent.pointerUp(surface, {
    button: 0,
    buttons: 0,
    clientX: pointerId * 10 + 40,
    clientY: pointerId * 12 + 35,
    pointerId,
  });
}

describe("OnScreenOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveOnScreenCapture).mockResolvedValue("C:/Captures/CapKit.png");
    vi.stubGlobal("matchMedia", (media: string): MediaQueryList => createMediaQueryList(false, media));
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows every presentation tool in a bottom dock", async () => {
    render(<OnScreenOverlay />);

    expect(await screen.findByRole("toolbar", { name: "On-screen drawing tools" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Select, shortcut V" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pencil, shortcut 1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Presentation pointer, shortcut 8" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Blur, shortcut 0" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Clear all on-screen changes" })).toHaveClass("bg-[#ff5b4d]");
    expect(screen.queryByRole("group", { name: "Drawing colors" })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "On-screen stroke size" })).not.toBeInTheDocument();
    expect(requestOnScreenSnapshot).not.toHaveBeenCalled();
  });

  it("can open Screen Draw over a frozen frame when live desktop is disabled", async () => {
    window.localStorage.setItem(
      "snaphub.settings.v1",
      JSON.stringify({
        ...defaultSnaphubSettings,
        onScreen: {
          ...defaultSnaphubSettings.onScreen,
          liveDesktop: false,
        },
      }),
    );

    render(<OnScreenOverlay />);

    expect(await screen.findByTestId("on-screen-frozen-background")).toHaveAttribute(
      "src",
      "asset://on-screen.bmp",
    );
    expect(screen.getByTestId("on-screen-frozen-background")).toHaveStyle({
      height: "720px",
      left: "0px",
      top: "0px",
      width: "1280px",
    });
    expect(screen.getByTestId("on-screen-frozen-background")).not.toHaveClass("size-full");
    expect(requestOnScreenSnapshot).toHaveBeenCalledWith(false);
  });

  it("changes tools using configured number keys", async () => {
    render(<OnScreenOverlay />);
    await screen.findByRole("toolbar", { name: "On-screen drawing tools" });

    fireEvent.keyDown(window, { key: "2" });

    expect(screen.getByRole("button", { name: "Rectangle, shortcut 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("uses the persisted spotlight radius", async () => {
    render(<OnScreenOverlay />);
    await screen.findByRole("toolbar", { name: "On-screen drawing tools" });

    fireEvent.click(screen.getByRole("button", { name: "Spotlight, shortcut 6" }));

    expect(screen.getByTestId("on-screen-spotlight")).toHaveStyle({
      height: "360px",
      width: "360px",
    });
  });

  it("updates the pointer dot without React renders for pointer movement", async () => {
    const frames = createAnimationFrameQueue();
    const onRender = vi.fn();
    render(
      <Profiler id="on-screen-overlay" onRender={onRender}>
        <OnScreenOverlay />
      </Profiler>,
    );
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });
    fireEvent.click(screen.getByRole("button", { name: "Presentation pointer, shortcut 8" }));
    const initialRenderCount = onRender.mock.calls.length;
    const dot = screen.getByTestId("on-screen-pointer-dot");

    expect(dot).toHaveAttribute("visibility", "hidden");
    for (let index = 0; index < 50; index += 1) {
      fireEvent.pointerMove(surface, {
        clientX: index * 2,
        clientY: index * 3,
        pointerId: 8,
      });
    }

    expect(onRender).toHaveBeenCalledTimes(initialRenderCount);
    expect(frames.pendingFrames()).toBe(1);
    frames.flushNextFrame();

    expect(dot).toHaveAttribute("cx", "98");
    expect(dot).toHaveAttribute("cy", "147");
    expect(dot).toHaveAttribute("visibility", "visible");
    expect(onRender).toHaveBeenCalledTimes(initialRenderCount);
  });

  it("appends every coalesced pointer sample that passes the distance threshold", async () => {
    const frames = createAnimationFrameQueue();
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });
    fireEvent.click(screen.getByRole("button", { name: "Presentation pointer, shortcut 8" }));
    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 120,
      clientY: 140,
      pointerId: 8,
    });
    const move = createEvent.pointerMove(surface, {
      buttons: 1,
      clientX: 150,
      clientY: 170,
      pointerId: 8,
    });
    Object.defineProperty(move, "getCoalescedEvents", {
      configurable: true,
      value: () => [
        { clientX: 130, clientY: 150 },
        { clientX: 140, clientY: 160 },
        { clientX: 150, clientY: 170 },
      ],
    });
    fireEvent(surface, move);
    frames.flushNextFrame();

    const path = screen.getByTestId("on-screen-pointer-core");
    expect(path.getAttribute("d")).toContain("M 130 150");
    expect(path.getAttribute("d")).toContain("L 140 160");
    expect(path.getAttribute("d")).toContain("L 150 170");
  });

  it("starts an independent fade on release and clears the live path for the next stroke", async () => {
    const frames = createAnimationFrameQueue();
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });
    fireEvent.click(screen.getByRole("button", { name: "Presentation pointer, shortcut 8" }));
    const pointerLayer = screen.getByTestId("on-screen-pointer-trail");
    const corePath = screen.getByTestId("on-screen-pointer-core");

    expect(pointerLayer).toBeInTheDocument();
    expect(screen.getByTestId("on-screen-pointer-dot")).toHaveAttribute("visibility", "hidden");
    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 120,
      clientY: 140,
      pointerId: 8,
    });
    fireEvent.pointerMove(surface, {
      buttons: 1,
      clientX: 260,
      clientY: 210,
      pointerId: 8,
    });
    frames.flushNextFrame();

    expect(pointerLayer.querySelectorAll("path")).toHaveLength(2);
    expect(corePath.getAttribute("d")).toContain("M 260 210");

    fireEvent.pointerUp(surface, {
      button: 0,
      buttons: 0,
      clientX: 260,
      clientY: 210,
      pointerId: 8,
    });

    expect(screen.getByTestId("on-screen-pointer-trail")).toBeInTheDocument();
    expect(corePath).toHaveAttribute("d", "");
    expect(
      screen.getByTestId("on-screen-fading-trail").querySelector("path"),
    ).toHaveAttribute("d", "M 260 210");

    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 320,
      clientY: 240,
      pointerId: 9,
    });
    expect(corePath).toHaveAttribute("d", "");
    fireEvent.pointerCancel(surface, { pointerId: 9 });
    expect(screen.getByTestId("on-screen-pointer-trail")).toBeInTheDocument();
  });

  it("removes a fading laser trail when its animation ends", async () => {
    const frames = createAnimationFrameQueue();
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });
    fireEvent.click(screen.getByRole("button", { name: "Presentation pointer, shortcut 8" }));
    drawLaserStroke(surface, frames, 1);

    const fadingTrail = screen.getByTestId("on-screen-fading-trail");
    expect(fadingTrail).toHaveClass(
      "animate-[laser-fade_450ms_ease-out_forwards]",
      "motion-reduce:hidden",
    );
    expect(fadingTrail.querySelectorAll("path")).toHaveLength(2);

    act(() => {
      fireEvent.animationEnd(fadingTrail);
      // React DOM registers WebKit's event name in jsdom, which lacks AnimationEvent.
      fireEvent(fadingTrail, new Event("webkitAnimationEnd", { bubbles: true }));
    });

    expect(screen.queryByTestId("on-screen-fading-trail")).not.toBeInTheDocument();
  });

  it("removes a fading laser trail after 600 ms if animationend never fires", async () => {
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });
    fireEvent.click(screen.getByRole("button", { name: "Presentation pointer, shortcut 8" }));
    vi.useFakeTimers();
    const frames = createAnimationFrameQueue();
    drawLaserStroke(surface, frames, 2);

    expect(screen.getByTestId("on-screen-fading-trail")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(599);
    });
    expect(screen.getByTestId("on-screen-fading-trail")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByTestId("on-screen-fading-trail")).not.toBeInTheDocument();
  });

  it("keeps at most three fading trails after four quick strokes", async () => {
    const frames = createAnimationFrameQueue();
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });
    fireEvent.click(screen.getByRole("button", { name: "Presentation pointer, shortcut 8" }));

    for (let pointerId = 1; pointerId <= 4; pointerId += 1) {
      drawLaserStroke(surface, frames, pointerId);
    }

    expect(screen.getAllByTestId("on-screen-fading-trail")).toHaveLength(3);
  });

  it("removes all fading trails when Clear is selected", async () => {
    const frames = createAnimationFrameQueue();
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });
    fireEvent.click(screen.getByRole("button", { name: "Presentation pointer, shortcut 8" }));
    drawLaserStroke(surface, frames, 1);
    expect(screen.getByTestId("on-screen-fading-trail")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear all on-screen changes" }));

    expect(screen.queryByTestId("on-screen-fading-trail")).not.toBeInTheDocument();
  });

  it("removes a released laser trail immediately when reduced motion is preferred", async () => {
    vi.stubGlobal("matchMedia", (media: string): MediaQueryList => createMediaQueryList(true, media));
    const frames = createAnimationFrameQueue();
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });
    fireEvent.click(screen.getByRole("button", { name: "Presentation pointer, shortcut 8" }));
    drawLaserStroke(surface, frames, 1);

    expect(screen.queryByTestId("on-screen-fading-trail")).not.toBeInTheDocument();
  });

  it("hides Screen Draw controls for two frames, saves once, and keeps drawings visible", async () => {
    const frames = createAnimationFrameQueue();
    const savedPath = deferred<string>();
    vi.mocked(saveOnScreenCapture).mockReturnValueOnce(savedPath.promise);
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });

    fireEvent.click(screen.getByRole("button", { name: "Rectangle, shortcut 2" }));
    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 80,
      clientY: 90,
      pointerId: 20,
    });
    fireEvent.pointerMove(surface, {
      clientX: 240,
      clientY: 210,
      pointerId: 20,
    });
    frames.flushNextFrame();
    fireEvent.pointerUp(surface, { button: 0, pointerId: 20 });
    const drawing = document.querySelector("[data-onscreen-object]");
    expect(drawing).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Presentation pointer, shortcut 8" }));

    fireEvent.keyDown(window, { key: "s" });

    const dock = screen.getByTestId("on-screen-dock");
    expect(dock).toHaveStyle({ visibility: "hidden" });
    expect(screen.getByTestId("on-screen-pointer-trail")).toHaveStyle({
      visibility: "hidden",
    });
    expect(drawing).toBeInTheDocument();
    expect(saveOnScreenCapture).not.toHaveBeenCalled();
    frames.flushNextFrame();
    expect(saveOnScreenCapture).not.toHaveBeenCalled();
    frames.flushNextFrame();
    await waitFor(() => expect(saveOnScreenCapture).toHaveBeenCalledTimes(1));
    expect(dock).toHaveStyle({ visibility: "hidden" });

    await act(async () => {
      savedPath.resolve("C:\\Captures\\CapKit.png");
      await savedPath.promise;
    });

    expect(screen.getByTestId("on-screen-save-status")).toHaveTextContent(
      "Saved to CapKit.png",
    );
    expect(dock).toHaveStyle({ visibility: "visible" });
    expect(drawing).toBeInTheDocument();
  });

  it("ignores repeated S presses until the first save settles", async () => {
    const frames = createAnimationFrameQueue();
    const savedPath = deferred<string>();
    vi.mocked(saveOnScreenCapture).mockReturnValueOnce(savedPath.promise);
    render(<OnScreenOverlay />);
    await screen.findByRole("application", { name: "On-screen annotation surface" });

    fireEvent.keyDown(window, { key: "S" });
    fireEvent.keyDown(window, { key: "s" });
    fireEvent.keyDown(window, { key: "S" });
    frames.flushNextFrame();
    frames.flushNextFrame();
    await waitFor(() => expect(saveOnScreenCapture).toHaveBeenCalledTimes(1));

    await act(async () => {
      savedPath.resolve("C:/Captures/CapKit.png");
      await savedPath.promise;
    });
    expect(screen.getByTestId("on-screen-save-status")).toHaveTextContent(
      "Saved to CapKit.png",
    );
  });

  it("does not save when S is typed in the editor or pressed with Ctrl", async () => {
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });
    fireEvent.click(screen.getByRole("button", { name: "Text, shortcut 5" }));
    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 100,
      clientY: 120,
      pointerId: 21,
    });
    const editor = screen.getByRole("textbox", { name: "On-screen text" });

    fireEvent.keyDown(editor, { key: "s" });
    fireEvent.change(editor, { target: { value: "s" } });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    expect(editor).toHaveValue("s");
    expect(saveOnScreenCapture).not.toHaveBeenCalled();
  });

  it("shows the save diagnostic and preserves drawings when native saving fails", async () => {
    const frames = createAnimationFrameQueue();
    vi.mocked(saveOnScreenCapture).mockRejectedValueOnce("native save diagnostic");
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });
    fireEvent.click(screen.getByRole("button", { name: "Rectangle, shortcut 2" }));
    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 80,
      clientY: 90,
      pointerId: 22,
    });
    fireEvent.pointerMove(surface, {
      clientX: 240,
      clientY: 210,
      pointerId: 22,
    });
    frames.flushNextFrame();
    fireEvent.pointerUp(surface, { button: 0, pointerId: 22 });
    const drawing = document.querySelector("[data-onscreen-object]");

    fireEvent.keyDown(window, { key: "s" });
    frames.flushNextFrame();
    frames.flushNextFrame();

    await waitFor(() => {
      expect(screen.getByTestId("on-screen-save-status")).toHaveTextContent(
        "Could not save this screen. Try again. native save diagnostic",
      );
    });
    expect(screen.getByTestId("on-screen-dock")).toHaveStyle({
      visibility: "visible",
    });
    expect(drawing).toBeInTheDocument();
  });

  it("saves from the accessible dock button", async () => {
    const frames = createAnimationFrameQueue();
    render(<OnScreenOverlay />);
    await screen.findByRole("application", { name: "On-screen annotation surface" });
    const saveButton = screen.getByRole("button", {
      name: "Save screen, shortcut S",
    });

    expect(saveButton).toHaveAttribute("title", "Save screen (S)");
    expect(saveButton).toHaveAttribute("aria-keyshortcuts", "S");
    expect(saveButton).toHaveClass("focus-visible:ring-2");
    saveButton.focus();
    expect(saveButton).toHaveFocus();
    fireEvent.click(saveButton);
    expect(screen.getByTestId("on-screen-dock")).toHaveStyle({
      visibility: "hidden",
    });

    frames.flushNextFrame();
    frames.flushNextFrame();
    await waitFor(() => expect(saveOnScreenCapture).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getByTestId("on-screen-save-status")).toHaveTextContent(
        "Saved to CapKit.png",
      );
    });
  });

  it("does not show a save result after Escape dismisses Screen Draw", async () => {
    const frames = createAnimationFrameQueue();
    const savedPath = deferred<string>();
    vi.mocked(saveOnScreenCapture).mockReturnValueOnce(savedPath.promise);
    render(<OnScreenOverlay />);
    await screen.findByRole("application", { name: "On-screen annotation surface" });

    fireEvent.keyDown(window, { key: "s" });
    frames.flushNextFrame();
    frames.flushNextFrame();
    await waitFor(() => expect(saveOnScreenCapture).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(window, { key: "Escape" });
    await act(async () => {
      savedPath.resolve("C:/Captures/CapKit.png");
      await savedPath.promise;
    });

    expect(screen.getByTestId("on-screen-save-status")).not.toHaveTextContent(
      "Saved to CapKit.png",
    );
  });

  it("creates and commits text in place after selecting the Text tool", async () => {
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });

    fireEvent.click(screen.getByRole("button", { name: "Text, shortcut 5" }));
    expect(screen.getByRole("status")).toHaveTextContent("Click anywhere to type");
    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 180,
      clientY: 140,
      pointerId: 3,
    });

    const editor = screen.getByRole("textbox", { name: "On-screen text" });
    expect(editor).toHaveFocus();
    fireEvent.change(editor, { target: { value: "Live note" } });
    fireEvent.pointerDown(editor, { button: 0, pointerId: 4 });
    expect(editor).toHaveValue("Live note");
    fireEvent.blur(editor);

    expect(screen.getByText("Live note")).toBeInTheDocument();
  });

  it("prevents the placement pointer default and focuses the text editor", async () => {
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });
    fireEvent.click(screen.getByRole("button", { name: "Text, shortcut 5" }));

    const pointerDown = fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 180,
      clientY: 140,
      pointerId: 3,
    });

    expect(pointerDown).toBe(false);
    expect(screen.getByRole("textbox", { name: "On-screen text" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "On-screen text" })).toHaveFocus();
  });

  it("refocuses an empty editor after a blur within the opening grace period", async () => {
    const frames = createAnimationFrameQueue();
    const now = vi.spyOn(performance, "now").mockReturnValue(10);
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });
    fireEvent.click(screen.getByRole("button", { name: "Text, shortcut 5" }));
    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 180,
      clientY: 140,
      pointerId: 3,
    });
    const editor = screen.getByRole("textbox", { name: "On-screen text" });

    frames.flushNextFrame();
    fireEvent.blur(editor);

    expect(screen.getByRole("textbox", { name: "On-screen text" })).toBeInTheDocument();
    frames.flushNextFrame();
    expect(editor).toHaveFocus();
    now.mockRestore();
  });

  it("commits typed text when a later click moves focus elsewhere", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(10);
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });
    fireEvent.click(screen.getByRole("button", { name: "Text, shortcut 5" }));
    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 180,
      clientY: 140,
      pointerId: 3,
    });
    const editor = screen.getByRole("textbox", { name: "On-screen text" });
    fireEvent.change(editor, { target: { value: "Live note" } });
    now.mockReturnValue(120);
    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 280,
      clientY: 200,
      pointerId: 4,
    });

    expect(screen.getByText("Live note")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "On-screen text" })).toBeInTheDocument();
    now.mockRestore();
  });

  it("closes an empty editor after the opening grace period without adding an object", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(10);
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });
    fireEvent.click(screen.getByRole("button", { name: "Text, shortcut 5" }));
    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 180,
      clientY: 140,
      pointerId: 3,
    });
    const editor = screen.getByRole("textbox", { name: "On-screen text" });
    now.mockReturnValue(120);
    fireEvent.blur(editor);

    expect(screen.queryByRole("textbox", { name: "On-screen text" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-onscreen-object]")).toBeNull();
    now.mockRestore();
  });

  it("undoes a completed drawing with the first click", async () => {
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });
    fireEvent.click(screen.getByRole("button", { name: "Rectangle, shortcut 2" }));
    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 80,
      clientY: 90,
      pointerId: 4,
    });
    fireEvent.pointerMove(surface, {
      clientX: 240,
      clientY: 210,
      pointerId: 4,
    });
    fireEvent.pointerUp(surface, {
      clientX: 240,
      clientY: 210,
      pointerId: 4,
    });

    expect(document.querySelector("[data-onscreen-object]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo on-screen change" }));
    expect(document.querySelector("[data-onscreen-object]")).toBeNull();
  });

  it("slides one shared highlight between hovered tools", async () => {
    render(<OnScreenOverlay />);
    await screen.findByRole("toolbar", { name: "On-screen drawing tools" });
    const highlight = screen.getByTestId("on-screen-tool-highlight");

    expect(highlight).toHaveStyle({ transform: "translate3d(0px, 0, 0)" });
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Rectangle, shortcut 2" }));
    expect(highlight).toHaveStyle({ transform: "translate3d(100px, 0, 0)" });
  });

  it("moves a selected rectangle with one update and restores it with undo", async () => {
    const frames = createAnimationFrameQueue();
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });

    fireEvent.click(screen.getByRole("button", { name: "Rectangle, shortcut 2" }));
    fireEvent.pointerDown(surface, { button: 0, clientX: 80, clientY: 90, pointerId: 4 });
    fireEvent.pointerMove(surface, { clientX: 240, clientY: 210, pointerId: 4 });
    frames.flushNextFrame();
    fireEvent.pointerUp(surface, { button: 0, pointerId: 4 });

    fireEvent.click(screen.getByRole("button", { name: "Select, shortcut V" }));
    fireEvent.pointerDown(surface, { button: 0, clientX: 100, clientY: 100, pointerId: 5 });
    fireEvent.pointerMove(surface, { clientX: 130, clientY: 120, pointerId: 5 });
    frames.flushNextFrame();
    fireEvent.pointerUp(surface, { button: 0, pointerId: 5 });

    const moved = document.querySelector("[data-onscreen-object]");
    expect(moved?.getAttribute("x")).toBe("110");
    expect(moved?.getAttribute("y")).toBe("110");
    expect(screen.getByTestId("on-screen-selection")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo on-screen change" }));
    const restored = document.querySelector("[data-onscreen-object]");
    expect(restored?.getAttribute("x")).toBe("80");
    expect(restored?.getAttribute("y")).toBe("90");
  });

  it("resizes a rectangle from its corner handle and drags only an arrow end", async () => {
    const frames = createAnimationFrameQueue();
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });

    fireEvent.click(screen.getByRole("button", { name: "Rectangle, shortcut 2" }));
    fireEvent.pointerDown(surface, { button: 0, clientX: 80, clientY: 90, pointerId: 4 });
    fireEvent.pointerMove(surface, { clientX: 240, clientY: 210, pointerId: 4 });
    frames.flushNextFrame();
    fireEvent.pointerUp(surface, { button: 0, pointerId: 4 });

    fireEvent.click(screen.getByRole("button", { name: "Select, shortcut V" }));
    fireEvent.pointerDown(surface, { button: 0, clientX: 100, clientY: 100, pointerId: 5 });
    fireEvent.pointerUp(surface, { button: 0, pointerId: 5 });
    // Bottom-right handle sits at (240, 210).
    fireEvent.pointerDown(surface, { button: 0, clientX: 240, clientY: 210, pointerId: 6 });
    fireEvent.pointerMove(surface, { clientX: 280, clientY: 250, pointerId: 6 });
    frames.flushNextFrame();
    fireEvent.pointerUp(surface, { button: 0, pointerId: 6 });

    const resized = document.querySelector("[data-onscreen-object]");
    expect(resized?.getAttribute("width")).toBe("200");
    expect(resized?.getAttribute("height")).toBe("160");

    fireEvent.click(screen.getByRole("button", { name: "Arrow, shortcut 4" }));
    fireEvent.pointerDown(surface, { button: 0, clientX: 50, clientY: 50, pointerId: 7 });
    fireEvent.pointerMove(surface, { clientX: 150, clientY: 150, pointerId: 7 });
    frames.flushNextFrame();
    fireEvent.pointerUp(surface, { button: 0, pointerId: 7 });

    fireEvent.click(screen.getByRole("button", { name: "Select, shortcut V" }));
    const lines = document.querySelectorAll("[data-onscreen-object]");
    const arrow = lines[lines.length - 1];
    expect(arrow?.tagName.toLowerCase()).toBe("line");
    fireEvent.pointerDown(surface, { button: 0, clientX: 100, clientY: 100, pointerId: 8 });
    fireEvent.pointerUp(surface, { button: 0, pointerId: 8 });
    // End handle sits at (150, 150).
    fireEvent.pointerDown(surface, { button: 0, clientX: 150, clientY: 150, pointerId: 9 });
    fireEvent.pointerMove(surface, { clientX: 180, clientY: 120, pointerId: 9 });
    frames.flushNextFrame();
    fireEvent.pointerUp(surface, { button: 0, pointerId: 9 });

    const movedArrow = document.querySelectorAll("[data-onscreen-object]");
    const moved = movedArrow[movedArrow.length - 1];
    expect(moved?.getAttribute("x1")).toBe("50");
    expect(moved?.getAttribute("y1")).toBe("50");
    expect(moved?.getAttribute("x2")).toBe("180");
    expect(moved?.getAttribute("y2")).toBe("120");
  });

  it("resizes selected text within 12–120", async () => {
    const frames = createAnimationFrameQueue();
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });

    fireEvent.click(screen.getByRole("button", { name: "Text, shortcut 5" }));
    fireEvent.pointerDown(surface, { button: 0, clientX: 180, clientY: 140, pointerId: 3 });
    const editor = screen.getByRole("textbox", { name: "On-screen text" });
    fireEvent.change(editor, { target: { value: "Hi" } });
    fireEvent.blur(editor);
    expect(await screen.findByText("Hi")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select, shortcut V" }));
    const textElement = screen.getByText("Hi");
    expect(textElement.getAttribute("font-size")).toBe("20");

    fireEvent.pointerDown(surface, { button: 0, clientX: 190, clientY: 135, pointerId: 5 });
    fireEvent.pointerUp(surface, { button: 0, pointerId: 5 });
    expect(screen.getByTestId("on-screen-selection")).toBeInTheDocument();

    // Handle sits at the bottom-right of the text bounds: x=228, y=140.
    fireEvent.pointerDown(surface, { button: 0, clientX: 228, clientY: 140, pointerId: 6 });
    fireEvent.pointerMove(surface, { clientX: 228, clientY: 150, pointerId: 6 });
    frames.flushNextFrame();
    fireEvent.pointerUp(surface, { button: 0, pointerId: 6 });

    expect(screen.getByText("Hi").getAttribute("font-size")).toBe("30");
  });

  it("deletes a selected drawing with the keyboard and the delete button, undoing each", async () => {
    const frames = createAnimationFrameQueue();
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });

    fireEvent.click(screen.getByRole("button", { name: "Rectangle, shortcut 2" }));
    fireEvent.pointerDown(surface, { button: 0, clientX: 80, clientY: 90, pointerId: 4 });
    fireEvent.pointerMove(surface, { clientX: 240, clientY: 210, pointerId: 4 });
    frames.flushNextFrame();
    fireEvent.pointerUp(surface, { button: 0, pointerId: 4 });
    expect(document.querySelector("[data-onscreen-object]")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Select, shortcut V" }));
    fireEvent.pointerDown(surface, { button: 0, clientX: 100, clientY: 100, pointerId: 5 });
    fireEvent.pointerUp(surface, { button: 0, pointerId: 5 });
    expect(screen.getByTestId("on-screen-selection")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Delete" });
    expect(document.querySelector("[data-onscreen-object]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Undo on-screen change" }));
    expect(document.querySelector("[data-onscreen-object]")).not.toBeNull();

    fireEvent.pointerDown(surface, { button: 0, clientX: 100, clientY: 100, pointerId: 6 });
    fireEvent.pointerUp(surface, { button: 0, pointerId: 6 });
    fireEvent.click(screen.getByRole("button", { name: "Delete selected drawing" }));
    expect(document.querySelector("[data-onscreen-object]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Undo on-screen change" }));
    expect(document.querySelector("[data-onscreen-object]")).not.toBeNull();
  });

  it("deselects on empty space and only closes Screen Draw on the second Escape", async () => {
    const { dismissOnScreen } = await import("../lib/tauri");
    const frames = createAnimationFrameQueue();
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });

    fireEvent.click(screen.getByRole("button", { name: "Rectangle, shortcut 2" }));
    fireEvent.pointerDown(surface, { button: 0, clientX: 80, clientY: 90, pointerId: 4 });
    fireEvent.pointerMove(surface, { clientX: 240, clientY: 210, pointerId: 4 });
    frames.flushNextFrame();
    fireEvent.pointerUp(surface, { button: 0, pointerId: 4 });

    fireEvent.click(screen.getByRole("button", { name: "Select, shortcut V" }));
    fireEvent.pointerDown(surface, { button: 0, clientX: 100, clientY: 100, pointerId: 5 });
    fireEvent.pointerUp(surface, { button: 0, pointerId: 5 });
    expect(screen.getByTestId("on-screen-selection")).toBeInTheDocument();

    fireEvent.pointerDown(surface, { button: 0, clientX: 1000, clientY: 600, pointerId: 6 });
    expect(screen.queryByTestId("on-screen-selection")).not.toBeInTheDocument();

    fireEvent.pointerDown(surface, { button: 0, clientX: 100, clientY: 100, pointerId: 7 });
    fireEvent.pointerUp(surface, { button: 0, pointerId: 7 });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("on-screen-selection")).not.toBeInTheDocument();
    expect(dismissOnScreen).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(dismissOnScreen).toHaveBeenCalledTimes(1);
  });

  it("switches to Select with V and ignores it while editing or with modifiers", async () => {
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });

    fireEvent.click(screen.getByRole("button", { name: "Rectangle, shortcut 2" }));
    expect(screen.getByRole("button", { name: "Rectangle, shortcut 2" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(window, { key: "v" });
    expect(screen.getByRole("button", { name: "Select, shortcut V" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Text, shortcut 5" }));
    fireEvent.pointerDown(surface, { button: 0, clientX: 180, clientY: 140, pointerId: 3 });
    const editor = screen.getByRole("textbox", { name: "On-screen text" });

    fireEvent.keyDown(editor, { key: "v" });
    expect(screen.getByRole("button", { name: "Text, shortcut 5" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Text, shortcut 5" })).toHaveAttribute("aria-pressed", "true");
  });

  it("hides the selection chrome while saving the screen", async () => {
    const frames = createAnimationFrameQueue();
    const savedPath = deferred<string>();
    vi.mocked(saveOnScreenCapture).mockReturnValueOnce(savedPath.promise);
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });

    fireEvent.click(screen.getByRole("button", { name: "Rectangle, shortcut 2" }));
    fireEvent.pointerDown(surface, { button: 0, clientX: 80, clientY: 90, pointerId: 4 });
    fireEvent.pointerMove(surface, { clientX: 240, clientY: 210, pointerId: 4 });
    frames.flushNextFrame();
    fireEvent.pointerUp(surface, { button: 0, pointerId: 4 });

    fireEvent.click(screen.getByRole("button", { name: "Select, shortcut V" }));
    fireEvent.pointerDown(surface, { button: 0, clientX: 100, clientY: 100, pointerId: 5 });
    fireEvent.pointerUp(surface, { button: 0, pointerId: 5 });
    expect(screen.getByTestId("on-screen-selection")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "s" });
    expect(screen.queryByTestId("on-screen-selection")).not.toBeInTheDocument();
    expect(screen.getByTestId("on-screen-dock")).toHaveStyle({ visibility: "hidden" });

    frames.flushNextFrame();
    frames.flushNextFrame();
    await waitFor(() => expect(saveOnScreenCapture).toHaveBeenCalledTimes(1));
    await act(async () => {
      savedPath.resolve("C:/Captures/CapKit.png");
      await savedPath.promise;
    });
    expect(screen.getByTestId("on-screen-selection")).toBeInTheDocument();
  });

  it("restores runtime-validated drawings when persistence is enabled", async () => {
    window.localStorage.setItem(
      "snaphub.settings.v1",
      JSON.stringify({
        ...defaultSnaphubSettings,
        onScreen: {
          ...defaultSnaphubSettings.onScreen,
          persistDrawings: true,
        },
      }),
    );
    window.localStorage.setItem(
      "capkit.onscreen.scene.v1",
      JSON.stringify([
        {
          id: "persisted-rectangle",
          kind: "rectangle",
          color: "#d9ff43",
          size: 4,
          start: { x: 20, y: 30 },
          end: { x: 180, y: 120 },
        },
      ]),
    );

    render(<OnScreenOverlay />);
    await screen.findByRole("toolbar", { name: "On-screen drawing tools" });

    expect(
      document.querySelector('[data-onscreen-object="persisted-rectangle"]'),
    ).not.toBeNull();
  });
});
