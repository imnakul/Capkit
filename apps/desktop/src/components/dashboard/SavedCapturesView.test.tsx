import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SavedCapturesView } from "./SavedCapturesView";

const mocks = vi.hoisted(() => ({
  copyCapture: vi.fn<(path: string) => Promise<void>>(() => Promise.resolve()),
  startDrag: vi.fn<(path: string) => Promise<void>>(() => Promise.resolve()),
  deleteCapture: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  listCaptures: vi.fn(() => Promise.resolve([{
    path: "C:/Pictures/Snaphub/capture.png",
    fileName: "capture.png",
    thumbnailPath: "C:/Temp/Snaphub/library-thumbnails/capture.png",
    thumbnailUrl: "asset://capture.png",
    width: 1200,
    height: 800,
    sizeBytes: 2048,
    modifiedAt: "2026-07-19T09:30:00+05:30",
  }])),
  openCapture: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  openFolder: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));

vi.mock("../../lib/tauri", () => ({
  copySavedCapture: mocks.copyCapture,
  startSavedCaptureDrag: mocks.startDrag,
  deleteSavedCapture: mocks.deleteCapture,
  describeInvokeError: (_error: unknown, fallback: string): string => fallback,
  getSaveDirectory: (): Promise<string> => Promise.resolve("C:/Pictures/Snaphub"),
  listSavedCaptures: mocks.listCaptures,
  listenForSavedCapture: (): Promise<() => void> => Promise.resolve((): void => undefined),
  openSaveDirectory: mocks.openFolder,
  openSavedCapture: mocks.openCapture,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: (): Promise<boolean> => Promise.resolve(true) }));

describe("SavedCapturesView", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    mocks.copyCapture.mockClear();
    mocks.startDrag.mockClear();
    mocks.openCapture.mockClear();
  });

  it("opens folders and images and exposes the requested context actions", async () => {
    const onShowcase = vi.fn();
    render(<SavedCapturesView onShowcase={onShowcase} />);

    const capture = await screen.findByRole("button", { name: "View capture" });
    fireEvent.click(screen.getByRole("button", { name: "Open save folder" }));
    fireEvent.click(capture);
    expect(mocks.openFolder).toHaveBeenCalledOnce();
    expect(mocks.openCapture).toHaveBeenCalledOnce();

    fireEvent.contextMenu(capture, { clientX: 140, clientY: 120 });
    expect(screen.getByRole("menuitem", { name: "View" })).toBeEnabled();
    expect(screen.queryByRole("menuitem", { name: "Upload to Cloud" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Showcase" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeEnabled();

    fireEvent.click(screen.getByRole("menuitem", { name: "Showcase" }));
    expect(onShowcase).toHaveBeenCalledOnce();
  });

  it("marks favourites, remembers them and filters to them", async () => {
    window.localStorage.clear();
    const { unmount } = render(<SavedCapturesView onShowcase={vi.fn()} />);
    await screen.findByRole("button", { name: "View capture" });

    fireEvent.click(screen.getByRole("radio", { name: "Favourites" }));
    expect(screen.getByText(/No favourites yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "All" }));

    fireEvent.click(screen.getByRole("button", { name: "Mark capture as favourites" }));
    expect(screen.getByRole("button", { name: "Remove capture from favourites" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Favourites" }));
    expect(screen.getByRole("button", { name: "View capture" })).toBeInTheDocument();

    unmount();
    render(<SavedCapturesView onShowcase={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Remove capture from favourites" })).toBeInTheDocument();
    window.localStorage.clear();
  });

  it("spans the full main column with matching grid and skeleton columns", async () => {
    type Captures = Awaited<ReturnType<typeof mocks.listCaptures>>;
    let resolveList!: (captures: Captures) => void;
    const pending = new Promise<Captures>((resolve) => {
      resolveList = resolve;
    });
    mocks.listCaptures.mockReturnValueOnce(pending);
    render(<SavedCapturesView onShowcase={vi.fn()} />);

    const skeleton = await screen.findByRole("status", { name: "Loading saved captures" });
    expect(skeleton.className).toContain("grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]");
    resolveList([
      {
        path: "C:/Pictures/Snaphub/capture.png",
        fileName: "capture.png",
        thumbnailPath: "C:/Temp/Snaphub/library-thumbnails/capture.png",
        thumbnailUrl: "asset://capture.png",
        width: 1200,
        height: 800,
        sizeBytes: 2048,
        modifiedAt: "2026-07-19T09:30:00+05:30",
      },
    ]);
    await screen.findByRole("button", { name: "View capture" });

    const section = document.querySelector("section[aria-labelledby='saved-captures-title']");
    expect(section?.className).not.toContain("max-w-[1120px]");
    const grid = document.querySelector("section div.mt-5.grid");
    expect(grid?.className).toContain("grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]");
  });

  it("copies from the card button without opening the image, then shows Copied for 1.5 s", async () => {
    render(<SavedCapturesView onShowcase={vi.fn()} />);
    await screen.findByRole("button", { name: "View capture" });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy capture" }));
      await Promise.resolve();
    });
    expect(mocks.copyCapture).toHaveBeenCalledWith("C:/Pictures/Snaphub/capture.png");
    expect(mocks.openCapture).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Copy capture" })).toHaveTextContent("Copied");

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole("button", { name: "Copy capture" })).toHaveTextContent("Copy");
    expect(screen.getByRole("button", { name: "Copy capture" })).not.toHaveTextContent("Copied");
  });

  it("copies from the context menu and closes it", async () => {
    render(<SavedCapturesView onShowcase={vi.fn()} />);
    const capture = await screen.findByRole("button", { name: "View capture" });
    fireEvent.contextMenu(capture, { clientX: 140, clientY: 120 });
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual(["View", "Copy", "Showcase", "Delete"]);

    fireEvent.click(screen.getByRole("menuitem", { name: "Copy" }));
    await waitFor(() => expect(mocks.copyCapture).toHaveBeenCalledOnce());
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("copies the focused card with Ctrl+C", async () => {
    render(<SavedCapturesView onShowcase={vi.fn()} />);
    const capture = await screen.findByRole("button", { name: "View capture" });
    fireEvent.keyDown(capture, { key: "c", ctrlKey: true });
    await waitFor(() => expect(mocks.copyCapture).toHaveBeenCalledOnce());
    fireEvent.keyDown(document.body, { key: "c", ctrlKey: true });
    expect(mocks.copyCapture).toHaveBeenCalledOnce();
  });

  it("shows the error banner and refreshes when a copy fails", async () => {
    mocks.copyCapture.mockRejectedValueOnce(new Error("gone"));
    render(<SavedCapturesView onShowcase={vi.fn()} />);
    await screen.findByRole("button", { name: "View capture" });
    const listCalls = mocks.listCaptures.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Copy capture" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't copy this capture.");
    await waitFor(() => expect(mocks.listCaptures.mock.calls.length).toBeGreaterThan(listCalls));
  });

  it("opens the image when the pointer moves less than 5 px", async () => {
    render(<SavedCapturesView onShowcase={vi.fn()} />);
    const capture = await screen.findByRole("button", { name: "View capture" });
    fireEvent.pointerDown(capture, { button: 0, buttons: 1, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(capture, { buttons: 1, clientX: 13, clientY: 12, pointerId: 1 });
    fireEvent.pointerUp(capture, { button: 0, clientX: 13, clientY: 12, pointerId: 1 });
    fireEvent.click(capture);
    expect(mocks.startDrag).not.toHaveBeenCalled();
    expect(mocks.openCapture).toHaveBeenCalledOnce();
  });

  it("starts one native drag after 5 px of movement and suppresses the following click", async () => {
    render(<SavedCapturesView onShowcase={vi.fn()} />);
    const capture = await screen.findByRole("button", { name: "View capture" });
    fireEvent.pointerDown(capture, { button: 0, buttons: 1, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(capture, { buttons: 1, clientX: 16, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(capture, { buttons: 1, clientX: 30, clientY: 10, pointerId: 1 });
    expect(mocks.startDrag).toHaveBeenCalledOnce();
    expect(mocks.startDrag).toHaveBeenCalledWith("C:/Pictures/Snaphub/capture.png");

    fireEvent.click(capture);
    expect(mocks.openCapture).not.toHaveBeenCalled();
    fireEvent.pointerDown(capture, { button: 0, buttons: 1, clientX: 10, clientY: 10, pointerId: 2 });
    fireEvent.click(capture);
    expect(mocks.openCapture).toHaveBeenCalledOnce();
  });

  it("shows an error banner when the drag cannot start", async () => {
    mocks.startDrag.mockRejectedValueOnce(new Error("no"));
    render(<SavedCapturesView onShowcase={vi.fn()} />);
    const capture = await screen.findByRole("button", { name: "View capture" });
    fireEvent.pointerDown(capture, { button: 0, buttons: 1, clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(capture, { buttons: 1, clientX: 20, clientY: 0, pointerId: 1 });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't start dragging this capture.");
  });
});
