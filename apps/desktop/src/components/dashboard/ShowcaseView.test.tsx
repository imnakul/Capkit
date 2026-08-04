import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedCapture } from "../../domain/capture";
import type { MediaFolder, MediaItem } from "../../domain/showcase";
import { ShowcaseView } from "./ShowcaseView";

const capture: SavedCapture = {
  path: "C:/Pictures/Capkit/capture.png",
  fileName: "capture.png",
  thumbnailPath: "C:/Temp/Capkit/library-thumbnails/capture.png",
  thumbnailUrl: "asset://capture.png",
  width: 1200,
  height: 800,
  sizeBytes: 2048,
  modifiedAt: "2026-07-23T09:30:00+05:30",
};

const wallpaper: MediaItem = {
  path: "C:/Wallpapers/dunes.jpg",
  fileName: "dunes.jpg",
  sizeBytes: 4096,
  modifiedAt: "2026-07-24T08:00:00+05:30",
  url: "asset://dunes.jpg",
};

const wallpaperFolder: MediaFolder = {
  path: "C:/Wallpapers",
  name: "Wallpapers",
  images: [wallpaper],
};

const openDialog = vi.fn<(options?: unknown) => Promise<string | string[] | null>>();

vi.mock("@tauri-apps/api/core", () => ({ isTauri: (): boolean => true }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (options?: unknown): Promise<string | string[] | null> => openDialog(options),
}));
vi.mock("../../lib/tauri", () => ({
  describeInvokeError: (_error: unknown, fallback: string): string => fallback,
  savedCaptureToMedia: (source: SavedCapture): MediaItem => ({
    path: source.path,
    fileName: source.fileName,
    sizeBytes: source.sizeBytes,
    modifiedAt: source.modifiedAt,
    url: source.thumbnailUrl,
  }),
  importMediaFiles: (): Promise<readonly MediaItem[]> => Promise.resolve([wallpaper]),
  listFolderImages: (): Promise<MediaFolder> => Promise.resolve(wallpaperFolder),
}));

describe("ShowcaseView", () => {
  afterEach(() => {
    cleanup();
    openDialog.mockReset();
    window.localStorage.clear();
  });

  it("shows the image panel on the left and the background panel on the right", () => {
    render(<ShowcaseView />);

    expect(screen.getByRole("heading", { name: "Showcase studio" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Image panel" })).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Background panel" })).toBeVisible();

    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "130" } });
    expect(screen.getByRole("slider", { name: "Zoom" })).toHaveValue("130");

    fireEvent.change(screen.getByRole("slider", { name: "Crop top" }), { target: { value: "20" } });
    expect(screen.getByRole("slider", { name: "Crop top" })).toHaveValue("20");

    fireEvent.click(screen.getByRole("button", { name: "Rotate 90° right" }));
    fireEvent.click(screen.getByRole("button", { name: "Flip horizontally" }));
    expect(screen.getByRole("button", { name: "Flip horizontally" })).toHaveAttribute("aria-pressed", "true");
  });

  it("adopts a capture handed over from the library", () => {
    render(<ShowcaseView initialCapture={capture} />);

    expect(screen.getByRole("button", { name: "Show capture.png in the preview" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Showcase preview of capture.png" })).toBeVisible();
  });

  it("imports media from anywhere on the computer", async () => {
    openDialog.mockResolvedValue(["C:/Wallpapers/dunes.jpg"]);
    render(<ShowcaseView />);

    fireEvent.click(screen.getByRole("button", { name: "Import media from this computer" }));

    expect(await screen.findByRole("button", { name: "Show dunes.jpg in the preview" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Showcase preview of dunes.jpg" })).toBeVisible();
  });

  it("adds a background folder as a collapsible section", async () => {
    openDialog.mockResolvedValue("C:/Wallpapers");
    render(<ShowcaseView />);

    fireEvent.click(screen.getByRole("button", { name: "Add a background folder from this computer" }));

    const toggle = await screen.findByRole("button", { name: /^Wallpapers/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Use dunes.jpg as the background" }));
    expect(screen.getByRole("button", { name: "Use dunes.jpg as the background" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Remove the Wallpapers folder" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Wallpapers/ })).toBeNull();
    });
  });

  it("applies a stage aspect ratio and overlay tone", () => {
    render(<ShowcaseView />);

    const ratio = screen.getByRole("combobox", { name: "Stage aspect ratio" });
    fireEvent.change(ratio, { target: { value: "16x9" } });
    expect(ratio).toHaveValue("16x9");

    fireEvent.change(ratio, { target: { value: "custom" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Custom aspect width" }), { target: { value: "5" } });
    expect(screen.getByRole("spinbutton", { name: "Custom aspect width" })).toHaveValue(5);

    fireEvent.change(screen.getByRole("slider", { name: "Background blur" }), { target: { value: "18" } });
    expect(screen.getByRole("slider", { name: "Background blur" })).toHaveValue("18");
  });

  it("reports the export size and offers a format and scale", () => {
    render(<ShowcaseView />);

    expect(screen.getByRole("combobox", { name: "Export scale" })).toHaveValue("2");
    fireEvent.change(screen.getByRole("combobox", { name: "Export format" }), { target: { value: "webp" } });
    expect(screen.getByRole("combobox", { name: "Export format" })).toHaveValue("webp");
    expect(screen.getByRole("button", { name: "Export the showcase as an image" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy the showcase to the clipboard" })).toBeVisible();
  });

  it("applies a look and walks the change back with undo", () => {
    render(<ShowcaseView />);

    expect(screen.getByRole("button", { name: "Undo the last change" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Apply the Editorial look — Paper, hairline, no chrome" }));
    fireEvent.click(screen.getByRole("tab", { name: "Show Frame controls" }));
    expect(screen.getByRole("switch", { name: "Show frame" })).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Undo the last change" }));
    expect(screen.getByRole("switch", { name: "Show frame" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Redo the last change" }));
    expect(screen.getByRole("switch", { name: "Show frame" })).not.toBeChecked();
  });

  it("puts crop handles on the canvas without losing the numeric sliders", () => {
    render(<ShowcaseView />);

    fireEvent.click(screen.getByRole("button", { name: "Crop on the canvas" }));
    expect(screen.getByRole("button", { name: "Drag the top left corner to crop" })).toBeVisible();
    expect(screen.getByRole("slider", { name: "Crop top" })).toHaveValue("0");

    fireEvent.click(screen.getByRole("button", { name: "Crop on the canvas" }));
    expect(screen.queryByRole("button", { name: "Drag the top left corner to crop" })).toBeNull();
  });

  it("offers the same effect set on the image and the background", () => {
    render(<ShowcaseView />);

    const [imageEffects, backgroundEffects] = screen.getAllByRole("button", { name: "Effects" });
    if (imageEffects === undefined || backgroundEffects === undefined) throw new Error("Both rails must expose an Effects section");

    fireEvent.click(backgroundEffects);
    fireEvent.change(screen.getByRole("slider", { name: "Background vignette" }), { target: { value: "60" } });
    expect(screen.getByRole("slider", { name: "Background vignette" })).toHaveValue("60");

    fireEvent.click(imageEffects);
    fireEvent.change(screen.getByRole("slider", { name: "Image vignette" }), { target: { value: "40" } });
    expect(screen.getByRole("slider", { name: "Image vignette" })).toHaveValue("40");

    fireEvent.click(screen.getByRole("button", { name: "Reset image effects" }));
    expect(screen.getByRole("slider", { name: "Image vignette" })).toHaveValue("0");
  });

  it("supports independent edge padding and visibility toggles", () => {
    render(<ShowcaseView />);

    expect(screen.getByRole("switch", { name: "Background" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /^Padding & radius/ }));
    fireEvent.click(screen.getByRole("button", { name: "Unlink padding sides" }));
    fireEvent.change(screen.getByRole("slider", { name: "Top" }), { target: { value: "96" } });
    expect(screen.getByRole("slider", { name: "Top" })).toHaveValue("96");
    expect(screen.getByRole("slider", { name: "Right" })).toHaveValue("56");

    fireEvent.click(screen.getByRole("tab", { name: "Show Frame controls" }));
    expect(screen.getByRole("switch", { name: "Show frame" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Use Mobile frame" }));
    fireEvent.click(screen.getByRole("switch", { name: "Show frame" }));
    expect(screen.getByRole("switch", { name: "Show frame" })).not.toBeChecked();
  });

  it("saves, applies, and deletes a named style", () => {
    render(<ShowcaseView />);

    fireEvent.click(screen.getByRole("tab", { name: "Show Text controls" }));
    fireEvent.click(screen.getByRole("switch", { name: "Add title" }));

    fireEvent.click(screen.getByRole("button", { name: "Saved styles" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Style name" }), { target: { value: "Launch shots" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the current composition as a style" }));

    expect(window.localStorage.getItem("capkit.showcase.styles")).toContain("Launch shots");
    expect(screen.getByRole("button", { name: "Apply the Launch shots style" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Reset showcase" }));
    expect(screen.getByRole("switch", { name: "Add title" })).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Apply the Launch shots style" }));
    expect(screen.getByRole("switch", { name: "Add title" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Delete the Launch shots style" }));
    expect(screen.queryByRole("button", { name: "Apply the Launch shots style" })).toBeNull();
  });
});
