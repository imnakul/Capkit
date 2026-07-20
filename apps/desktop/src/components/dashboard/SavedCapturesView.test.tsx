import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SavedCapturesView } from "./SavedCapturesView";

const mocks = vi.hoisted(() => ({
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
  afterEach(() => cleanup());

  it("opens folders and images and exposes the requested context actions", async () => {
    const onShowcase = vi.fn();
    render(<SavedCapturesView cloudConfigured={false} onShowcase={onShowcase} />);

    const capture = await screen.findByRole("button", { name: "View capture.png" });
    fireEvent.click(screen.getByRole("button", { name: "Open save folder" }));
    fireEvent.click(capture);
    expect(mocks.openFolder).toHaveBeenCalledOnce();
    expect(mocks.openCapture).toHaveBeenCalledOnce();

    fireEvent.contextMenu(capture, { clientX: 140, clientY: 120 });
    expect(screen.getByRole("menuitem", { name: "View" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "Upload to Cloud" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Showcase" })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeEnabled();

    fireEvent.click(screen.getByRole("menuitem", { name: "Showcase" }));
    expect(onShowcase).toHaveBeenCalledOnce();
  });
});
