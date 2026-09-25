import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSnaphubSettings } from "../domain/settings";
import { requestOnScreenSnapshot } from "../lib/tauri";
import { OnScreenOverlay } from "./OnScreenOverlay";

vi.mock("../lib/tauri", () => ({
  describeInvokeError: (_error: unknown, fallback: string): string => fallback,
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
  showOnScreenSurface: vi.fn(() => Promise.resolve()),
}));

describe("OnScreenOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("shows every presentation tool in a bottom dock", async () => {
    render(<OnScreenOverlay />);

    expect(await screen.findByRole("toolbar", { name: "On-screen drawing tools" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Pencil, shortcut 1" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Presentation pointer, shortcut 8" })).toHaveAttribute("aria-pressed", "true");
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

  it("keeps the complete presenter laser visible only while the pointer is held", async () => {
    render(<OnScreenOverlay />);
    const surface = await screen.findByRole("application", {
      name: "On-screen annotation surface",
    });

    expect(screen.queryByTestId("on-screen-pointer-trail")).not.toBeInTheDocument();
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(100);
    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 120,
      clientY: 140,
      pointerId: 8,
    });
    performanceNow.mockReturnValue(130);
    fireEvent.pointerMove(surface, {
      buttons: 1,
      clientX: 260,
      clientY: 210,
      pointerId: 8,
    });
    performanceNow.mockRestore();

    expect(
      screen.getByTestId("on-screen-pointer-trail").querySelectorAll("path"),
    ).toHaveLength(2);

    fireEvent.pointerUp(surface, {
      button: 0,
      buttons: 0,
      clientX: 260,
      clientY: 210,
      pointerId: 8,
    });

    expect(screen.queryByTestId("on-screen-pointer-trail")).not.toBeInTheDocument();

    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 320,
      clientY: 240,
      pointerId: 9,
    });
    expect(screen.getByTestId("on-screen-pointer-trail")).toBeVisible();
    fireEvent.pointerCancel(surface, { pointerId: 9 });
    expect(screen.queryByTestId("on-screen-pointer-trail")).not.toBeInTheDocument();
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

    expect(highlight).toHaveStyle({ transform: "translate3d(350px, 0, 0)" });
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Rectangle, shortcut 2" }));
    expect(highlight).toHaveStyle({ transform: "translate3d(50px, 0, 0)" });
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
