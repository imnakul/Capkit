import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Copy, Delete, Download, Tick, Upload } from "../icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SavedCapture } from "../../domain/capture";
import {
  backgroundValue,
  containScale,
  cropForRatio,
  cropRatios,
  croppedPixelSize,
  defaultFrameSettings,
  defaultImageSettings,
  defaultSceneSettings,
  defaultTextSettings,
  exportFileName,
  exportFormats,
  exportScales,
  fitRatioBox,
  flipTransform,
  formatFileSize,
  imageFilterValue,
  isAutoBackground,
  mediaTransform,
  mergeMediaFolders,
  mergeMediaItems,
  mergeSavedStyles,
  normalizeCrop,
  orientedSize,
  outputSize,
  overlayValue,
  savedStyleLibrarySchema,
  showcaseLibrarySchema,
  showcaseLibraryStorageKey,
  showcasePresetSchema,
  showcasePresetStorageKey,
  showcaseStylesStorageKey,
  spotlightGradient,
  stageAspectRatio,
  stageRatios,
  supportedMediaExtensions,
  type CropEdge,
  type CropInsets,
  type ExportFormat,
  type ExportScale,
  type FrameSettings,
  type ImageSettings,
  type Look,
  type MediaFolder,
  type MediaItem,
  type SavedStyle,
  type SceneSettings,
  type ShowcaseLibrary,
  type ShowcasePreset,
  type Size,
  type StageRatioId,
  type TextSettings,
} from "../../domain/showcase";
import { readImagePalette } from "../../lib/imagePalette";
import { copyImageToClipboard, downloadBlob, renderStageBlob } from "../../lib/showcaseExport";
import { describeInvokeError, importMediaFiles, listFolderImages, savedCaptureToMedia } from "../../lib/tauri";
import { useUndoable } from "../../lib/useUndoable";
import { BackgroundPanel, type DecorTab, type PaddingSide } from "./showcase/BackgroundPanel";
import { ImagePanel } from "./showcase/ImagePanel";
import { NumberField } from "./showcase/primitives";
import { CropOverlay, DemoScreenshot, EffectLayers, ShowcaseFrame } from "./showcase/stage";

type PickTarget = "media" | "background";

type Composition = {
  readonly image: ImageSettings;
  readonly scene: SceneSettings;
  readonly frame: FrameSettings;
  readonly text: TextSettings;
};

type ShowcaseViewProps = {
  initialCapture?: SavedCapture | null;
};

const demoNaturalSize: Size = { width: 1280, height: 800 };
const fallbackStageSize: Size = { width: 880, height: 560 };

const defaultComposition: Composition = {
  image: defaultImageSettings,
  scene: defaultSceneSettings,
  frame: defaultFrameSettings,
  text: defaultTextSettings,
};

const toolbarButtonClass =
  "inline-flex items-center gap-1.5 rounded-md border border-stone-400/70 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-stone-900 shadow-sm outline-none transition hover:border-stone-600 hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/25 dark:bg-white/12 dark:text-stone-50 dark:hover:border-white/45 dark:hover:bg-white/20";

const selectClass =
  "h-7 rounded-md border border-stone-400/70 bg-white px-1.5 text-[12px] font-semibold text-stone-800 outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:border-white/25 dark:bg-white/12 dark:text-stone-50";

/**
 * The Showcase studio.
 *
 * The left rail owns what happens *to* the image, the right rail owns what
 * happens *around* it, and the canvas owns framing and output. The whole
 * composition is a single undoable snapshot, so nothing here is destructive.
 */
export function ShowcaseView({ initialCapture = null }: ShowcaseViewProps): React.JSX.Element {
  const composition = useUndoable<Composition>(defaultComposition);
  const { image, scene, frame, text } = composition.value;
  const { update, replace, undo, redo } = composition;

  const [media, setMedia] = useState<readonly MediaItem[]>([]);
  const [activePath, setActivePath] = useState("");
  const [naturalSize, setNaturalSize] = useState<Size | null>(null);
  const [palette, setPalette] = useState<readonly string[]>([]);
  const [libraryImages, setLibraryImages] = useState<readonly MediaItem[]>([]);
  const [folders, setFolders] = useState<readonly MediaFolder[]>([]);
  const [styles, setStyles] = useState<readonly SavedStyle[]>([]);
  const [styleName, setStyleName] = useState("");
  const [stylesOpen, setStylesOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [activeTab, setActiveTab] = useState<DecorTab>("background");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [exportScale, setExportScale] = useState<ExportScale>(2);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingPickRef = useRef<((items: readonly MediaItem[]) => void) | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const autoStyledRef = useRef("");
  // Autosave stays off until the stored composition has been restored, so an
  // empty first render cannot overwrite it.
  const restoredRef = useRef(false);
  const stageNodeRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const [areaRef, areaSize] = useElementSize();

  const patchImage = useCallback(
    (patch: Partial<ImageSettings>, mergeKey?: string): void => {
      update((current) => ({ ...current, image: { ...current.image, ...patch } }), mergeKey);
    },
    [update],
  );
  const patchScene = useCallback(
    (patch: Partial<SceneSettings>, mergeKey?: string): void => {
      update((current) => ({ ...current, scene: { ...current.scene, ...patch } }), mergeKey);
    },
    [update],
  );
  const patchFrame = useCallback(
    (patch: Partial<FrameSettings>, mergeKey?: string): void => {
      update((current) => ({ ...current, frame: { ...current.frame, ...patch } }), mergeKey);
    },
    [update],
  );
  const patchText = useCallback(
    (patch: Partial<TextSettings>, mergeKey?: string): void => {
      update((current) => ({ ...current, text: { ...current.text, ...patch } }), mergeKey);
    },
    [update],
  );

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return (): void => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    if (initialCapture === null) return;
    const item = savedCaptureToMedia(initialCapture);
    setMedia((current) => mergeMediaItems(current, [item]));
    setActivePath(item.path);
  }, [initialCapture]);

  useEffect(() => {
    setNaturalSize(null);
  }, [activePath]);

  useEffect(() => {
    const raw = window.localStorage.getItem(showcasePresetStorageKey);
    if (raw === null) {
      restoredRef.current = true;
      return;
    }
    try {
      const preset = showcasePresetSchema.parse(JSON.parse(raw) as unknown);
      replace({ image: preset.image, scene: preset.scene, frame: preset.frame, text: preset.text });
      // A stored composition is a deliberate choice; imports must not overwrite it.
      autoStyledRef.current = "*";
    } catch {
      // A preset written by an older build is ignored rather than surfaced.
    } finally {
      restoredRef.current = true;
    }
  }, [replace]);

  // Work in progress survives closing the window; previously only an explicit
  // save was remembered, so an unsaved composition was lost on exit.
  useEffect(() => {
    if (!restoredRef.current) return;
    const timer = window.setTimeout(() => {
      const preset: ShowcasePreset = { version: 3, image, scene, frame, text };
      window.localStorage.setItem(showcasePresetStorageKey, JSON.stringify(preset));
    }, 600);
    return (): void => {
      window.clearTimeout(timer);
    };
  }, [image, scene, frame, text]);

  useEffect(() => {
    const raw = window.localStorage.getItem(showcaseStylesStorageKey);
    if (raw === null) return;
    try {
      setStyles(savedStyleLibrarySchema.parse(JSON.parse(raw) as unknown));
    } catch {
      // An unreadable style library is dropped rather than blocking the studio.
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    const raw = window.localStorage.getItem(showcaseLibraryStorageKey);
    if (raw === null) return;
    let library: ShowcaseLibrary;
    try {
      library = showcaseLibrarySchema.parse(JSON.parse(raw) as unknown);
    } catch {
      return;
    }
    const lifetime = { active: true };
    void (async (): Promise<void> => {
      if (library.images.length > 0) {
        const images = await importMediaFiles(library.images).catch(() => []);
        if (lifetime.active && images.length > 0) setLibraryImages((current) => mergeMediaItems(current, images));
      }
      for (const path of library.folders) {
        const folder = await listFolderImages(path).catch(() => null);
        if (folder !== null && lifetime.active) setFolders((current) => mergeMediaFolders(current, folder));
      }
    })();
    return (): void => {
      lifetime.active = false;
    };
  }, []);

  // Background images are addressed by path; their URLs are re-minted per session.
  useEffect(() => {
    update((current) => {
      const selection = current.scene.background;
      if (selection.kind !== "image") return current;
      const match = [...libraryImages, ...folders.flatMap((folder) => folder.images)].find((item) => item.path === selection.path);
      if (match === undefined || match.url === selection.url) return current;
      return { ...current, scene: { ...current.scene, background: { kind: "image", path: match.path, url: match.url } } };
    });
  }, [libraryImages, folders, update]);

  const activeMedia = useMemo(() => media.find((item) => item.path === activePath) ?? null, [media, activePath]);

  // Colours are read from the decoded bytes, not the rendered element, so the
  // sample survives the asset protocol and a fresh import styles its own stage.
  useEffect(() => {
    if (activeMedia === null) {
      setPalette([]);
      return;
    }
    const lifetime = { active: true };
    void readImagePalette(activeMedia.url).then((sampled) => {
      if (!lifetime.active || sampled.length === 0) return;
      setPalette(sampled);
      if (autoStyledRef.current !== "") return;
      autoStyledRef.current = activeMedia.path;
      update((current) =>
        isAutoBackground(current.scene.background)
          ? { ...current, scene: { ...current.scene, backgroundEnabled: true, background: { kind: "gradient", value: spotlightGradient(sampled) } } }
          : current,
      );
    });
    return (): void => {
      lifetime.active = false;
    };
  }, [activeMedia, update]);

  const natural = naturalSize ?? demoNaturalSize;
  const cropped = croppedPixelSize(natural, image.crop);
  const oriented = orientedSize(cropped, image.quarterTurns);
  const padding = scene.backgroundEnabled
    ? { top: scene.paddingTop, right: scene.paddingRight, bottom: scene.paddingBottom, left: scene.paddingLeft }
    : { top: 0, right: 0, bottom: 0, left: 0 };
  const paddingX = padding.left + padding.right;
  const paddingY = padding.top + padding.bottom;
  const ratio = scene.backgroundEnabled ? stageAspectRatio(scene) : null;
  const area: Size = areaSize.width > 0 ? areaSize : fallbackStageSize;
  const ratioBox = ratio === null ? null : fitRatioBox(ratio, area);
  const outer = ratioBox ?? area;
  const bounds: Size = { width: Math.max(40, outer.width - paddingX), height: Math.max(40, outer.height - paddingY) };
  const scale = containScale(oriented, bounds);
  // Auto wraps the stage around the media so all four gutters equal the padding.
  const stageBox: Size = ratioBox ?? {
    width: Math.round(oriented.width * scale) + paddingX,
    height: Math.round(oriented.height * scale) + paddingY,
  };
  const displaySize: Size = { width: natural.width * scale, height: natural.height * scale };
  const cropBoxSize: Size = { width: cropped.width * scale, height: cropped.height * scale };
  const mediaBoxSize: Size = { width: oriented.width * scale, height: oriented.height * scale };
  const safeCrop = normalizeCrop(image.crop);
  const overlay = overlayValue(scene);
  const output = outputSize(stageBox, exportScale);

  function persistLibrary(images: readonly MediaItem[], nextFolders: readonly MediaFolder[]): void {
    const payload: ShowcaseLibrary = { folders: nextFolders.map((folder) => folder.path), images: images.map((item) => item.path) };
    window.localStorage.setItem(showcaseLibraryStorageKey, JSON.stringify(payload));
  }

  async function pickImages(title: string): Promise<readonly MediaItem[]> {
    if (!isTauri()) return pickImagesFromBrowser();
    const selected = await open({ multiple: true, title, filters: [{ name: "Image", extensions: [...supportedMediaExtensions] }] });
    const paths = Array.isArray(selected) ? selected : typeof selected === "string" ? [selected] : [];
    if (paths.length === 0) return [];
    return importMediaFiles(paths);
  }

  function pickImagesFromBrowser(): Promise<readonly MediaItem[]> {
    const input = fileInputRef.current;
    if (input === null) return Promise.resolve([]);
    input.value = "";
    return new Promise<readonly MediaItem[]>((resolve) => {
      pendingPickRef.current = resolve;
      // `cancel` has no React synthetic equivalent, so the native event releases
      // the pending promise when the OS dialog is dismissed.
      input.addEventListener("cancel", () => resolveBrowserPick(null), { once: true });
      input.click();
    });
  }

  function fileToMedia(file: File): MediaItem {
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.push(url);
    return {
      path: `local:${file.name}:${String(file.lastModified)}:${String(file.size)}`,
      fileName: file.name,
      sizeBytes: file.size,
      modifiedAt: new Date(file.lastModified).toISOString(),
      url,
    };
  }

  function resolveBrowserPick(files: FileList | null): void {
    const resolve = pendingPickRef.current;
    pendingPickRef.current = null;
    if (resolve === null) return;
    resolve(Array.from(files ?? []).map((file) => fileToMedia(file)));
  }

  function adoptMedia(items: readonly MediaItem[]): void {
    if (items.length === 0) return;
    setMedia((current) => mergeMediaItems(current, items));
    const first = items.at(0);
    if (first === undefined) return;
    // A brand new import earns a freshly generated stage.
    autoStyledRef.current = "";
    setActivePath(first.path);
    setStatus(`Imported ${String(items.length)} file${items.length === 1 ? "" : "s"}`);
  }

  async function runImport(target: PickTarget): Promise<void> {
    setImporting(true);
    setStatus(null);
    try {
      const items = await pickImages(target === "media" ? "Import media into Showcase" : "Choose a background image");
      if (items.length === 0) return;
      if (target === "media") {
        adoptMedia(items);
        return;
      }
      const first = items.at(0);
      setLibraryImages((current) => {
        const next = mergeMediaItems(current, items);
        persistLibrary(next, folders);
        return next;
      });
      if (first !== undefined) {
        autoStyledRef.current = "*";
        patchScene({ background: { kind: "image", path: first.path, url: first.url }, backgroundEnabled: true });
      }
    } catch (error: unknown) {
      setStatus(describeInvokeError(error, "Those files could not be imported"));
    } finally {
      setImporting(false);
    }
  }

  async function addBackgroundFolder(): Promise<void> {
    if (!isTauri()) {
      setStatus("Background folders are available in the desktop app");
      return;
    }
    setImporting(true);
    setStatus(null);
    try {
      const selected = await open({ directory: true, multiple: false, title: "Add a background folder" });
      if (typeof selected !== "string") return;
      const folder = await listFolderImages(selected);
      setFolders((current) => {
        const next = mergeMediaFolders(current, folder);
        persistLibrary(libraryImages, next);
        return next;
      });
      setStatus(folder.images.length === 0 ? `${folder.name} has no supported images` : `${folder.name} · ${String(folder.images.length)} images`);
    } catch (error: unknown) {
      setStatus(describeInvokeError(error, "That folder could not be read"));
    } finally {
      setImporting(false);
    }
  }

  // Most screenshots arrive on the clipboard, so paste is bound view-wide.
  useEffect(() => {
    function onPaste(event: ClipboardEvent): void {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
      if (files.length === 0) return;
      event.preventDefault();
      const items = files.map((file) => {
        const url = URL.createObjectURL(file);
        objectUrlsRef.current.push(url);
        return {
          path: `local:${file.name}:${String(file.lastModified)}:${String(file.size)}`,
          fileName: file.name === "" ? "Pasted image.png" : file.name,
          sizeBytes: file.size,
          modifiedAt: new Date(file.lastModified).toISOString(),
          url,
        };
      });
      setMedia((current) => mergeMediaItems(current, items));
      const first = items.at(0);
      if (first === undefined) return;
      autoStyledRef.current = "";
      setActivePath(first.path);
      setStatus("Pasted from the clipboard");
    }
    window.addEventListener("paste", onPaste);
    return (): void => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return (): void => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  function handleDrop(event: React.DragEvent<HTMLElement>): void {
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) return;
    event.preventDefault();
    adoptMedia(files.map((file) => fileToMedia(file)));
  }

  function removeMedia(path: string): void {
    setMedia((current) => {
      const next = current.filter((item) => item.path !== path);
      if (path === activePath) setActivePath(next.at(0)?.path ?? "");
      return next;
    });
  }

  function handleMediaLoad(event: React.SyntheticEvent<HTMLImageElement>): void {
    const element = event.currentTarget;
    setNaturalSize({ width: element.naturalWidth, height: element.naturalHeight });
  }

  function regenerateStage(): void {
    if (palette.length === 0) {
      setStatus(activeMedia === null ? "Import an image first to sample its colours" : "Still reading the image colours…");
      return;
    }
    patchScene({ backgroundEnabled: true, background: { kind: "gradient", value: spotlightGradient(palette) } });
    setStatus("Background matched to the image");
  }

  function applyLook(look: Look): void {
    update((current) => ({
      ...current,
      image: { ...current.image, ...look.image },
      scene: { ...current.scene, backgroundEnabled: true, ...look.scene },
      frame: { ...current.frame, ...look.frame },
    }));
    autoStyledRef.current = "*";
    setStatus(`${look.label} look applied`);
  }

  function updatePadding(side: PaddingSide, value: number): void {
    if (scene.paddingLinked) {
      patchScene({ paddingTop: value, paddingRight: value, paddingBottom: value, paddingLeft: value }, "padding");
      return;
    }
    const key = { top: "paddingTop", right: "paddingRight", bottom: "paddingBottom", left: "paddingLeft" } as const;
    patchScene({ [key[side]]: value }, `padding-${side}`);
  }

  function updateCrop(edge: CropEdge, value: number): void {
    update(
      (current) => ({ ...current, image: { ...current.image, cropRatio: "free", crop: normalizeCrop({ ...current.image.crop, [edge]: value / 100 }) } }),
      `crop-${edge}`,
    );
  }

  function updateCropInsets(crop: CropInsets): void {
    update((current) => ({ ...current, image: { ...current.image, cropRatio: "free", crop } }), "crop-drag");
  }

  function applyCropRatio(id: (typeof cropRatios)[number]["id"]): void {
    const cropRatio = cropRatios.find((item) => item.id === id)?.ratio ?? null;
    if (cropRatio === null) {
      patchImage({ cropRatio: "free" });
      return;
    }
    patchImage({ cropRatio: id, crop: cropForRatio(natural, cropRatio) });
  }

  function persistStyles(next: readonly SavedStyle[]): void {
    setStyles(next);
    window.localStorage.setItem(showcaseStylesStorageKey, JSON.stringify(next));
  }

  function saveStyle(): void {
    const name = styleName.trim();
    if (name === "") return;
    const preset: ShowcasePreset = { version: 3, image, scene, frame, text };
    const style: SavedStyle = { id: `${name}-${String(Date.now())}`, name, savedAt: new Date().toISOString(), preset };
    persistStyles(mergeSavedStyles(styles, style));
    // The newest style also becomes the composition restored on next launch.
    window.localStorage.setItem(showcasePresetStorageKey, JSON.stringify(preset));
    setStyleName("");
    setStatus(`Saved “${name}”`);
  }

  function applyStyle(style: SavedStyle): void {
    replace({ image: style.preset.image, scene: style.preset.scene, frame: style.preset.frame, text: style.preset.text });
    autoStyledRef.current = "*";
    setStatus(`${style.name} applied`);
  }

  function resetAll(): void {
    replace(defaultComposition);
    autoStyledRef.current = "";
    setCropMode(false);
  }

  async function runExport(mode: "download" | "clipboard"): Promise<void> {
    const node = stageNodeRef.current;
    if (node === null) return;
    setExporting(true);
    setStatus(null);
    const wasCropping = cropMode;
    setCropMode(false);
    try {
      // The crop handles are chrome, not artwork — one frame lets React drop them.
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      const format: ExportFormat = mode === "clipboard" ? "png" : exportFormat;
      const blob = await renderStageBlob(node, {
        format,
        scale: exportScale,
        ...(format === "jpeg" ? { backgroundColor: "#ffffff" } : {}),
      });
      if (mode === "clipboard") {
        await copyImageToClipboard(blob);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
        setStatus("Copied to the clipboard");
        return;
      }
      downloadBlob(blob, exportFileName(format, new Date().toISOString()));
      setStatus(`Exported ${String(output.width)} × ${String(output.height)}`);
    } catch (error: unknown) {
      setStatus(describeInvokeError(error, "That export could not be produced"));
    } finally {
      setCropMode(wasCropping);
      setExporting(false);
    }
  }

  function beginMediaDrag(event: React.PointerEvent<HTMLDivElement>): void {
    if (cropMode) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: image.offsetX, offsetY: image.offsetY };
  }

  function moveMediaDrag(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    patchImage({ offsetX: Math.round(drag.offsetX + event.clientX - drag.startX), offsetY: Math.round(drag.offsetY + event.clientY - drag.startY) }, "pan");
  }

  function endMediaDrag(event: React.PointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  const artwork = (
    <div className="relative z-10 flex max-w-full flex-col items-center gap-4" style={{ perspective: "1100px" }}>
      <div className="relative">
        <div
          className={cropMode ? "touch-none" : "cursor-grab touch-none active:cursor-grabbing"}
          style={{ transform: mediaTransform(image), transformStyle: "preserve-3d" }}
          onPointerCancel={endMediaDrag}
          onPointerDown={beginMediaDrag}
          onPointerMove={moveMediaDrag}
          onPointerUp={endMediaDrag}
        >
          <ShowcaseFrame frame={frame} radius={scene.cornerRadius} tiltX={image.tiltX} tiltY={image.tiltY}>
            <div
              className="relative overflow-hidden"
              style={{
                width: `${String(Math.round(mediaBoxSize.width))}px`,
                height: `${String(Math.round(mediaBoxSize.height))}px`,
                borderRadius: `${String(Math.max(0, scene.cornerRadius - (frame.frameEnabled ? 4 : 0)))}px`,
                boxShadow: frame.borderWidth > 0 ? `inset 0 0 0 ${String(frame.borderWidth)}px ${frame.borderColor}` : undefined,
                transform: flipTransform(image),
              }}
            >
              <div
                className="absolute left-1/2 top-1/2 overflow-hidden"
                style={{
                  width: `${String(Math.round(cropBoxSize.width))}px`,
                  height: `${String(Math.round(cropBoxSize.height))}px`,
                  marginLeft: `${String(Math.round(-cropBoxSize.width / 2))}px`,
                  marginTop: `${String(Math.round(-cropBoxSize.height / 2))}px`,
                  transform: `rotate(${String(image.quarterTurns * 90)}deg)`,
                }}
              >
                <div
                  className="absolute"
                  style={{
                    width: `${String(Math.round(displaySize.width))}px`,
                    height: `${String(Math.round(displaySize.height))}px`,
                    left: `${String(Math.round(-displaySize.width * safeCrop.left))}px`,
                    top: `${String(Math.round(-displaySize.height * safeCrop.top))}px`,
                    filter: imageFilterValue(image),
                  }}
                >
                  {activeMedia === null ? (
                    <DemoScreenshot />
                  ) : (
                    <img alt={`Showcase preview of ${activeMedia.fileName}`} className="block size-full object-fill" src={activeMedia.url} onLoad={handleMediaLoad} />
                  )}
                </div>
                <EffectLayers effects={image.effects} />
              </div>
              {/* Outside the rotated, clipped crop box so the frame and grid are
                  never cut off by it. */}
              {cropMode ? <CropOverlay displaySize={displaySize} image={image} onChange={updateCropInsets} /> : null}
            </div>
          </ShowcaseFrame>
        </div>
        {text.showNote ? (
          <div className="absolute -right-5 -top-5 z-30 rotate-[-4deg] rounded-sm border border-stone-900/10 bg-[#d9ff43] px-2.5 py-1.5 text-[11px] font-semibold text-stone-900 shadow-lg">
            {text.note}
          </div>
        ) : null}
      </div>
      {text.showTitle ? (
        <div className="max-w-[420px] text-center">
          <p className="text-[16px] font-semibold tracking-[-0.02em] text-white drop-shadow-sm">{text.title}</p>
          <p className="mt-1 text-[11px] text-white/70">Captured, edited, and ready to share.</p>
        </div>
      ) : null}
    </div>
  );

  return (
    <section aria-labelledby="showcase-title" className="flex h-full w-full flex-col overflow-hidden p-2.5 xl:p-3">
      <input
        ref={fileInputRef}
        accept="image/*"
        aria-hidden="true"
        className="hidden"
        multiple
        tabIndex={-1}
        type="file"
        onChange={(event) => resolveBrowserPick(event.currentTarget.files)}
      />
      <h1 className="sr-only" id="showcase-title">
        Showcase studio
      </h1>

      <div className="grid min-h-0 flex-1 grid-cols-[196px_minmax(0,1fr)_244px] gap-2 xl:grid-cols-[228px_minmax(0,1fr)_284px] xl:gap-2.5 2xl:grid-cols-[248px_minmax(0,1fr)_312px] 2xl:gap-3">
        <ImagePanel
          cropMode={cropMode}
          image={image}
          natural={natural}
          onApplyRatio={applyCropRatio}
          onCropChange={updateCrop}
          onCropModeChange={setCropMode}
          onPatch={patchImage}
        />

        <main
          aria-label="Showcase preview"
          className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-stone-300/80 bg-[#dfe0da] dark:border-white/10 dark:bg-[#191b19]"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-black/8 px-2.5 py-2 dark:border-white/8">
            <button aria-label="Import media from this computer" className={toolbarButtonClass} disabled={importing} type="button" onClick={() => void runImport("media")}>
              <Upload aria-hidden="true" size={13} />
              Import media
            </button>

            <label className="flex items-center gap-1.5">
              <span className="hidden text-[12px] font-semibold text-stone-600 2xl:inline dark:text-stone-300">Ratio</span>
              <select
                aria-label="Stage aspect ratio"
                className={`${selectClass} max-w-[132px] truncate`}
                value={scene.aspectRatio}
                onChange={(event) => {
                  const id = event.currentTarget.value as StageRatioId;
                  const entry = stageRatios.find((item) => item.id === id);
                  patchScene({ aspectRatio: id });
                  // Platform shapes carry their own output settings.
                  if (entry?.scale !== undefined) setExportScale(entry.scale);
                  if (entry?.format !== undefined) setExportFormat(entry.format);
                }}
              >
                {stageRatios.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {`${entry.label} — ${entry.hint}`}
                  </option>
                ))}
              </select>
            </label>
            {scene.aspectRatio === "custom" ? (
              <div className="flex w-28 items-end gap-1">
                <NumberField ariaLabel="Custom aspect width" label="W" max={64} min={1} value={scene.customAspectWidth} onChange={(value) => patchScene({ customAspectWidth: value })} />
                <NumberField ariaLabel="Custom aspect height" label="H" max={64} min={1} value={scene.customAspectHeight} onChange={(value) => patchScene({ customAspectHeight: value })} />
              </div>
            ) : null}

            <p aria-live="polite" className="min-w-0 flex-1 truncate text-[12px] text-stone-500 dark:text-stone-400">
              {status ?? activeMedia?.fileName ?? "Drop, paste, or import an image"}
            </p>

            <span className="hidden font-mono text-[12px] text-stone-500 xl:inline dark:text-stone-400" title="Exported pixel size">
              {`${String(output.width)} × ${String(output.height)}`}
            </span>
            <select aria-label="Export scale" className={selectClass} value={String(exportScale)} onChange={(event) => setExportScale(Number(event.currentTarget.value) as ExportScale)}>
              {exportScales.map((entry) => (
                <option key={entry} value={String(entry)}>
                  {`${String(entry)}×`}
                </option>
              ))}
            </select>
            <select aria-label="Export format" className={selectClass} value={exportFormat} onChange={(event) => setExportFormat(event.currentTarget.value as ExportFormat)}>
              {exportFormats.map((entry) => (
                <option key={entry} value={entry}>
                  {entry.toUpperCase()}
                </option>
              ))}
            </select>
            <button aria-label="Copy the showcase to the clipboard" className={toolbarButtonClass} disabled={exporting} type="button" onClick={() => void runExport("clipboard")}>
              {copied ? <Tick aria-hidden="true" size={13} /> : <Copy aria-hidden="true" size={13} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              aria-label="Export the showcase as an image"
              className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-[12px] font-semibold text-white outline-none transition hover:bg-stone-700 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
              disabled={exporting}
              type="button"
              onClick={() => void runExport("download")}
            >
              <Download aria-hidden="true" size={13} />
              {exporting ? "Rendering…" : "Export"}
            </button>
          </div>

          {media.length > 0 ? (
            <div aria-label="Imported media" className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-black/8 px-2.5 py-2 dark:border-white/8" role="group">
              {media.map((item) => (
                <div className="group relative shrink-0" key={item.path}>
                  <button
                    aria-label={`Show ${item.fileName} in the preview`}
                    aria-pressed={item.path === activePath}
                    className="block size-12 overflow-hidden rounded-md border border-stone-300 bg-white outline-none transition hover:border-stone-500 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-pressed:border-stone-900 aria-pressed:ring-1 aria-pressed:ring-stone-900 dark:border-white/10 dark:bg-white/5 dark:aria-pressed:border-white dark:aria-pressed:ring-white"
                    title={`${item.fileName} · ${formatFileSize(item.sizeBytes)}`}
                    type="button"
                    onClick={() => setActivePath(item.path)}
                  >
                    <img alt="" className="size-full object-cover" src={item.url} />
                  </button>
                  <button
                    aria-label={`Remove ${item.fileName} from the studio`}
                    className="absolute -right-1 -top-1 hidden size-4 place-items-center rounded-full bg-stone-900 text-white outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] group-focus-within:grid group-hover:grid dark:bg-white dark:text-stone-900"
                    type="button"
                    onClick={() => removeMedia(item.path)}
                  >
                    <Delete aria-hidden="true" size={9} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="relative min-h-0 flex-1">
            {/* The sizer lives outside the scroll box on purpose: inside it, its
                inset would resolve against the scrollable overflow area and the
                stage would feed back into the measurement that sizes it. */}
            <div ref={areaRef} aria-hidden="true" className="pointer-events-none absolute inset-3" />
            <div className="grid size-full place-items-center overflow-auto p-3">
              {scene.backgroundEnabled ? (
                <div
                  ref={stageNodeRef}
                  className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-black/8 shadow-inner dark:border-white/8"
                  style={{ width: `${String(stageBox.width)}px`, height: `${String(stageBox.height)}px` }}
                >
                  <div
                    aria-hidden="true"
                    className="absolute inset-0"
                    style={{
                      background: backgroundValue(scene.background),
                      filter: scene.backgroundBlur > 0 ? `blur(${String(scene.backgroundBlur)}px)` : undefined,
                      transform: scene.backgroundBlur > 0 ? `scale(${String(1 + scene.backgroundBlur / 120)})` : undefined,
                    }}
                  />
                  <EffectLayers effects={scene.effects} />
                  {overlay === null ? null : <div aria-hidden="true" className="absolute inset-0" style={{ background: overlay }} />}
                  <div
                    className="relative z-10 flex size-full items-center justify-center"
                    style={{
                      paddingTop: `${String(padding.top)}px`,
                      paddingRight: `${String(padding.right)}px`,
                      paddingBottom: `${String(padding.bottom)}px`,
                      paddingLeft: `${String(padding.left)}px`,
                    }}
                  >
                    {artwork}
                  </div>
                </div>
              ) : (
                <div ref={stageNodeRef} className="flex shrink-0 items-center justify-center">
                  {artwork}
                </div>
              )}
            </div>
          </div>
        </main>

        <BackgroundPanel
          activeTab={activeTab}
          busy={importing}
          canRedo={composition.canRedo}
          canUndo={composition.canUndo}
          folders={folders}
          frame={frame}
          image={image}
          libraryImages={libraryImages}
          scene={scene}
          search={search}
          styleName={styleName}
          styles={styles}
          stylesOpen={stylesOpen}
          text={text}
          onAddFolder={() => void addBackgroundFolder()}
          onAddImage={() => void runImport("background")}
          onApplyLook={applyLook}
          onApplyStyle={applyStyle}
          onDeleteStyle={(id) => persistStyles(styles.filter((style) => style.id !== id))}
          onPaddingChange={updatePadding}
          onPatchFrame={patchFrame}
          onPatchImage={patchImage}
          onPatchScene={patchScene}
          onPatchText={patchText}
          onRedo={redo}
          onRegenerate={regenerateStage}
          onRemoveFolder={(path) =>
            setFolders((current) => {
              const next = current.filter((folder) => folder.path !== path);
              persistLibrary(libraryImages, next);
              return next;
            })
          }
          onResetAll={resetAll}
          onResetFrame={() => patchFrame(defaultFrameSettings)}
          onResetScene={() => patchScene(defaultSceneSettings)}
          onResetText={() => patchText(defaultTextSettings)}
          onSaveStyle={saveStyle}
          onSearchChange={setSearch}
          onStyleNameChange={setStyleName}
          onStylesOpenChange={setStylesOpen}
          onTabChange={setActiveTab}
          onUndo={undo}
        />
      </div>
    </section>
  );
}

/**
 * Observes an element's box so the stage can be sized in exact pixels.
 *
 * Teardown is returned from the ref callback rather than handled in a separate
 * effect: React runs effect cleanups and ref re-attachment in an order that let
 * a stray cleanup disconnect the freshly created observer, leaving the stage
 * stuck on its fallback size.
 */
function useElementSize(): [React.RefCallback<HTMLDivElement>, Size] {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  const ref = useCallback<React.RefCallback<HTMLDivElement>>((element) => {
    setNode(element);
  }, []);

  useEffect(() => {
    if (node === null) return;
    function measure(): void {
      if (node === null) return;
      setSize({ width: node.clientWidth, height: node.clientHeight });
    }
    measure();
    // Window resizes are covered explicitly: ResizeObserver is the precise
    // signal, but it is not guaranteed in every embedded webview.
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return (): void => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [node]);

  return [ref, size];
}
