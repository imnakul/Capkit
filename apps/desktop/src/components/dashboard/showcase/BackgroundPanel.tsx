import { Computer, Copy, Delete, Download, FolderAdd, Frame, Image, ImageAdd, Layers, MagicWand, Palette, Redo, RotateCounterClockwise, Save, Smartphone, Sparkles, Tablet, Text, Tick, Undo } from "../../icons";
import {
  backgroundPresets,
  defaultEffectSettings,
  defaultSceneSettings,
  looks,
  overlayTones,
  type BackgroundPresetId,
  type FrameId,
  type FrameSettings,
  type ImageSettings,
  type Look,
  type MediaFolder,
  type MediaItem,
  type SavedStyle,
  type SceneSettings,
  type TextSettings,
} from "../../../domain/showcase";
import { EffectSliders } from "./ImagePanel";
import { Chip, CollapsibleSection, ColorField, ControlLabel, PanelHeading, Slider, TextField, Toggle } from "./primitives";

export type DecorTab = "background" | "frame" | "text";
export type PaddingSide = "top" | "right" | "bottom" | "left";

const decorTabs: readonly { id: DecorTab; label: string; icon: typeof Palette }[] = [
  { id: "background", label: "Background", icon: Palette },
  { id: "frame", label: "Frame", icon: Frame },
  { id: "text", label: "Text", icon: Text },
];

const frameOptions: readonly { id: FrameId; label: string; icon: typeof Computer }[] = [
  { id: "clean", label: "Clean", icon: Layers },
  { id: "browser", label: "Browser", icon: Computer },
  { id: "glass", label: "Glass", icon: Sparkles },
  { id: "iphone", label: "Mobile", icon: Smartphone },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "laptop", label: "Laptop", icon: Computer },
  { id: "desktop", label: "Desktop", icon: Computer },
];

const actionClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-stone-300 bg-white/70 px-2 py-1.5 text-[12px] font-semibold text-stone-700 outline-none transition hover:border-stone-500 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/12 dark:bg-white/5 dark:text-stone-200 dark:hover:border-white/25 dark:hover:text-white";

export type BackgroundPanelProps = {
  activeTab: DecorTab;
  busy: boolean;
  scene: SceneSettings;
  frame: FrameSettings;
  image: ImageSettings;
  text: TextSettings;
  libraryImages: readonly MediaItem[];
  folders: readonly MediaFolder[];
  styles: readonly SavedStyle[];
  styleName: string;
  search: string;
  stylesOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onTabChange: (tab: DecorTab) => void;
  onPatchScene: (patch: Partial<SceneSettings>, mergeKey?: string) => void;
  onPatchFrame: (patch: Partial<FrameSettings>, mergeKey?: string) => void;
  onPatchImage: (patch: Partial<ImageSettings>, mergeKey?: string) => void;
  onPatchText: (patch: Partial<TextSettings>, mergeKey?: string) => void;
  onPaddingChange: (side: PaddingSide, value: number) => void;
  onApplyLook: (look: Look) => void;
  onAddImage: () => void;
  onAddFolder: () => void;
  onRemoveFolder: (path: string) => void;
  onRegenerate: () => void;
  onResetScene: () => void;
  onResetFrame: () => void;
  onResetText: () => void;
  onResetAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onStyleNameChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onStylesOpenChange: (value: boolean) => void;
  onSaveStyle: () => void;
  onApplyStyle: (style: SavedStyle) => void;
  onDeleteStyle: (id: string) => void;
};

/** Everything that happens *around* the image, plus the studio's own actions. */
export function BackgroundPanel(props: BackgroundPanelProps): React.JSX.Element {
  const { activeTab, canRedo, canUndo, styles, styleName, stylesOpen } = props;
  return (
    <aside aria-label="Background panel" className="flex min-h-0 flex-col rounded-lg border border-stone-300/80 bg-white/55 dark:border-white/10 dark:bg-white/[0.025]">
      <div className="shrink-0 border-b border-stone-200 px-2 py-2 dark:border-white/8">
        <div className="flex items-center gap-1.5">
          <button aria-label="Undo the last change" className={`${actionClass} size-8 px-0`} disabled={!canUndo} type="button" onClick={props.onUndo}>
            <Undo aria-hidden="true" size={14} />
          </button>
          <button aria-label="Redo the last change" className={`${actionClass} size-8 px-0`} disabled={!canRedo} type="button" onClick={props.onRedo}>
            <Redo aria-hidden="true" size={14} />
          </button>
          <button
            aria-expanded={stylesOpen}
            aria-label="Saved styles"
            className={`${actionClass} flex-1`}
            type="button"
            onClick={() => props.onStylesOpenChange(!stylesOpen)}
          >
            <Save aria-hidden="true" size={14} />
            Styles
            {styles.length === 0 ? null : <span className="font-mono text-[11px] text-stone-400">{styles.length}</span>}
          </button>
          <button aria-label="Reset showcase" className={`${actionClass} size-8 px-0`} type="button" onClick={props.onResetAll}>
            <RotateCounterClockwise aria-hidden="true" size={14} />
          </button>
        </div>

        {stylesOpen ? (
          <div className="mt-2 space-y-2 rounded-md border border-stone-200 bg-white/60 p-2 dark:border-white/8 dark:bg-white/5">
            <div className="flex items-end gap-1.5">
              <div className="min-w-0 flex-1">
                <TextField label="Style name" placeholder="Launch shots" value={styleName} onChange={props.onStyleNameChange} />
              </div>
              <button aria-label="Save the current composition as a style" className={`${actionClass} h-8`} disabled={styleName.trim() === ""} type="button" onClick={props.onSaveStyle}>
                <Download aria-hidden="true" size={13} />
                Save
              </button>
            </div>
            {styles.length === 0 ? (
              <p className="text-[12px] leading-4 text-stone-400 dark:text-stone-500">
                Save a composition once and reuse it on every future capture in one click.
              </p>
            ) : (
              <ul className="space-y-1">
                {styles.map((style) => (
                  <li className="flex items-center gap-1" key={style.id}>
                    <button
                      aria-label={`Apply the ${style.name} style`}
                      className={`${actionClass} min-w-0 flex-1 justify-start`}
                      type="button"
                      onClick={() => props.onApplyStyle(style)}
                    >
                      <Copy aria-hidden="true" size={12} />
                      <span className="truncate">{style.name}</span>
                    </button>
                    <button
                      aria-label={`Delete the ${style.name} style`}
                      className="grid size-7 shrink-0 place-items-center rounded text-stone-400 outline-none transition hover:bg-stone-200/70 hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:hover:bg-white/10 dark:hover:text-white"
                      type="button"
                      onClick={() => props.onDeleteStyle(style.id)}
                    >
                      <Delete aria-hidden="true" size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <div className="grid shrink-0 grid-cols-3 border-b border-stone-200 px-1 pt-1 dark:border-white/8" role="tablist">
        {decorTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              aria-label={`Show ${tab.label} controls`}
              aria-selected={activeTab === tab.id}
              className="relative flex flex-col items-center gap-1 rounded-t-md px-1 py-2 text-[12px] font-semibold text-stone-400 outline-none transition hover:text-stone-700 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-selected:text-stone-900 dark:hover:text-stone-200 dark:aria-selected:text-white"
              key={tab.id}
              role="tab"
              type="button"
              onClick={() => props.onTabChange(tab.id)}
            >
              <Icon aria-hidden="true" size={15} />
              <span>{tab.label}</span>
              {activeTab === tab.id ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--snaphub-accent)]" /> : null}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5" role="tabpanel">
        {activeTab === "background" ? <BackgroundControls {...props} /> : null}
        {activeTab === "frame" ? <FrameControls {...props} /> : null}
        {activeTab === "text" ? <TextControls {...props} /> : null}
      </div>
    </aside>
  );
}

function BackgroundControls(props: BackgroundPanelProps): React.JSX.Element {
  const { scene, libraryImages, folders, busy, search } = props;
  const activeImagePath = scene.background.kind === "image" ? scene.background.path : null;
  const activePresetId: BackgroundPresetId | null = scene.background.kind === "preset" ? scene.background.id : null;
  const needle = search.trim().toLowerCase();
  const matches = (item: MediaItem): boolean => needle === "" || item.fileName.toLowerCase().includes(needle);
  const matchedLibrary = libraryImages.filter((item) => matches(item));
  const matchedFolders = folders
    .map((folder) => ({ ...folder, images: folder.images.filter((item) => matches(item)) }))
    .filter((folder) => needle === "" || folder.images.length > 0);

  return (
    <div className="space-y-3">
      <PanelHeading eyebrow="Background panel" resetLabel="Reset the background panel" title="Set the stage" onReset={props.onResetScene} />

      <div className="space-y-2">
        <ControlLabel hint="Backdrop + frame + effects" label="Looks" />
        <div className="grid grid-cols-3 gap-2">
          {looks.map((look) => (
            <button
              aria-label={`Apply the ${look.label} look — ${look.hint}`}
              className="group outline-none"
              key={look.id}
              title={look.hint}
              type="button"
              onClick={() => props.onApplyLook(look)}
            >
              {/* A look is a whole composition, so its card previews a framed
                  shot on the backdrop — not just the fill, which is what the
                  Backdrop swatches below show. */}
              <span
                className="grid aspect-[1.3] place-items-center rounded-md border border-stone-200 shadow-sm transition group-hover:scale-[1.04] group-focus-visible:ring-2 group-focus-visible:ring-[var(--snaphub-accent)] dark:border-white/10"
                style={{ background: look.swatch }}
              >
                <span className="block h-1/2 w-3/5 rounded-[2px] bg-white/90 shadow-[0_2px_6px_rgb(0_0_0/45%)]" />
              </span>
              <span className="mt-1 block truncate text-[12px] font-medium text-stone-600 dark:text-stone-300">{look.label}</span>
            </button>
          ))}
        </div>
      </div>

      <Toggle checked={scene.backgroundEnabled} label="Background" onChange={(value) => props.onPatchScene({ backgroundEnabled: value })} />
      {scene.backgroundEnabled ? null : (
        <p className="rounded-md border border-dashed border-stone-300 px-2.5 py-2 text-[12px] leading-5 text-stone-500 dark:border-white/12 dark:text-stone-400">
          The stage is removed entirely — the export is just the image.
        </p>
      )}

      <div className={scene.backgroundEnabled ? "space-y-2.5" : "pointer-events-none space-y-2.5 opacity-40"}>
        <CollapsibleSection
          defaultOpen
          icon={Palette}
          resetLabel="Reset the backdrop"
          title="Backdrop"
          onReset={() => props.onPatchScene({ background: defaultSceneSettings.background, customColor: defaultSceneSettings.customColor, backgroundBlur: 0 })}
        >
          <ControlLabel hint="Only the fill behind your image" label="Backdrop fill" />
          <button aria-label="Generate a background from the image colours" className={`${actionClass} w-full`} type="button" onClick={props.onRegenerate}>
            <MagicWand aria-hidden="true" size={13} />
            Match the image
          </button>
          <div className="grid grid-cols-3 gap-2">
            {backgroundPresets.map((preset) => (
              <button
                aria-label={`Use ${preset.label} background`}
                aria-pressed={activePresetId === preset.id}
                className="group outline-none"
                key={preset.id}
                type="button"
                onClick={() => props.onPatchScene({ background: { kind: "preset", id: preset.id } })}
              >
                <span
                  className="block aspect-[1.3] rounded-md border border-stone-200 shadow-sm transition group-hover:scale-[1.04] group-focus-visible:ring-2 group-focus-visible:ring-[var(--snaphub-accent)] group-aria-pressed:border-stone-900 group-aria-pressed:ring-1 group-aria-pressed:ring-stone-900 dark:border-white/10 dark:group-aria-pressed:border-white"
                  style={{ background: preset.swatch }}
                />
                <span className="mt-1 block truncate text-[12px] font-medium text-stone-500 dark:text-stone-400">{preset.label}</span>
              </button>
            ))}
          </div>
          <ColorField
            label="Custom colour"
            value={scene.customColor}
            onChange={(value) => props.onPatchScene({ customColor: value, background: { kind: "color", value } }, "customColor")}
          />
          <Slider label="Background blur" max={40} min={0} suffix="px" value={scene.backgroundBlur} onChange={(value) => props.onPatchScene({ backgroundBlur: value }, "backgroundBlur")} />
        </CollapsibleSection>

        <CollapsibleSection icon={Layers} resetLabel="Reset the overlay" title="Overlay" onReset={() => props.onPatchScene({ overlayTone: "none", overlayStrength: 25 })}>
          <div className="grid grid-cols-3 gap-1.5">
            {overlayTones.map((tone) => (
              <Chip active={scene.overlayTone === tone.id} key={tone.id} label={`Use the ${tone.label} overlay`} onClick={() => props.onPatchScene({ overlayTone: tone.id })}>
                {tone.label}
              </Chip>
            ))}
          </div>
          <Slider label="Overlay strength" max={90} min={0} suffix="%" value={scene.overlayStrength} onChange={(value) => props.onPatchScene({ overlayStrength: value }, "overlayStrength")} />
        </CollapsibleSection>

        <CollapsibleSection icon={MagicWand} resetLabel="Reset background effects" title="Effects" onReset={() => props.onPatchScene({ effects: defaultEffectSettings })}>
          <ControlLabel hint="Applied to the stage only" label="Texture & light" />
          <EffectSliders effects={scene.effects} scope="background" onChange={(patch, mergeKey) => props.onPatchScene({ effects: { ...scene.effects, ...patch } }, mergeKey)} />
        </CollapsibleSection>

        <CollapsibleSection
          icon={Image}
          resetLabel="Reset padding"
          title="Padding & radius"
          onReset={() => props.onPatchScene({ paddingTop: 56, paddingRight: 56, paddingBottom: 56, paddingLeft: 56, paddingLinked: true, cornerRadius: 20 })}
        >
          <div className="flex items-center justify-between gap-2">
            <ControlLabel label="Padding" />
            <button
              aria-label={scene.paddingLinked ? "Unlink padding sides" : "Link padding sides"}
              aria-pressed={scene.paddingLinked}
              className={actionClass}
              type="button"
              onClick={() => props.onPatchScene({ paddingLinked: !scene.paddingLinked })}
            >
              {scene.paddingLinked ? "Linked" : "Independent"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            <Slider label="Top" max={200} min={0} suffix="px" value={scene.paddingTop} onChange={(value) => props.onPaddingChange("top", value)} />
            <Slider label="Right" max={200} min={0} suffix="px" value={scene.paddingRight} onChange={(value) => props.onPaddingChange("right", value)} />
            <Slider label="Bottom" max={200} min={0} suffix="px" value={scene.paddingBottom} onChange={(value) => props.onPaddingChange("bottom", value)} />
            <Slider label="Left" max={200} min={0} suffix="px" value={scene.paddingLeft} onChange={(value) => props.onPaddingChange("left", value)} />
          </div>
          <Slider label="Corner radius" max={64} min={0} suffix="px" value={scene.cornerRadius} onChange={(value) => props.onPatchScene({ cornerRadius: value }, "cornerRadius")} />
        </CollapsibleSection>

        <div className="space-y-2 pt-1">
          <ControlLabel hint="From this PC" label="Your library" />
          <div className="grid grid-cols-2 gap-2">
            <button aria-label="Add a background image from this computer" className={actionClass} disabled={busy} type="button" onClick={props.onAddImage}>
              <ImageAdd aria-hidden="true" size={13} />
              Add image
            </button>
            <button aria-label="Add a background folder from this computer" className={actionClass} disabled={busy} type="button" onClick={props.onAddFolder}>
              <FolderAdd aria-hidden="true" size={13} />
              Add folder
            </button>
          </div>

          {libraryImages.length === 0 && folders.length === 0 ? (
            <p className="rounded-md border border-dashed border-stone-300 px-2.5 py-3 text-center text-[12px] leading-5 text-stone-400 dark:border-white/12 dark:text-stone-500">
              Attach a wallpaper folder once and every image inside becomes a background.
            </p>
          ) : (
            /* A folder can hold hundreds of files; without a filter only the
               first screenful is ever reachable. */
            <TextField label="Filter by name" placeholder="dunes, gradient, dark…" value={search} onChange={props.onSearchChange} />
          )}

          {matchedLibrary.length > 0 ? (
            <CollapsibleSection count={matchedLibrary.length} defaultOpen icon={Image} title="Imported images">
              <BackgroundGrid activePath={activeImagePath} images={matchedLibrary} onSelect={props.onPatchScene} />
            </CollapsibleSection>
          ) : null}

          {matchedFolders.map((folder) => (
            <CollapsibleSection
              action={
                <button
                  aria-label={`Remove the ${folder.name} folder`}
                  className="mr-1 grid size-7 place-items-center rounded text-stone-400 outline-none transition hover:bg-stone-200/70 hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:hover:bg-white/10 dark:hover:text-white"
                  type="button"
                  onClick={() => props.onRemoveFolder(folder.path)}
                >
                  <Delete aria-hidden="true" size={12} />
                </button>
              }
              count={folder.images.length}
              icon={FolderAdd}
              key={folder.path}
              title={folder.name}
            >
              {folder.images.length === 0 ? (
                <p className="text-[12px] leading-5 text-stone-400">No supported images in this folder.</p>
              ) : (
                <BackgroundGrid activePath={activeImagePath} images={folder.images} onSelect={props.onPatchScene} />
              )}
            </CollapsibleSection>
          ))}
        </div>
      </div>
    </div>
  );
}

function BackgroundGrid({
  images,
  activePath,
  onSelect,
}: {
  images: readonly MediaItem[];
  activePath: string | null;
  onSelect: (patch: Partial<SceneSettings>) => void;
}): React.JSX.Element {
  return (
    <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto pr-0.5">
      {images.map((item) => (
        <button
          aria-label={`Use ${item.fileName} as the background`}
          aria-pressed={activePath === item.path}
          className="aspect-[1.3] overflow-hidden rounded border border-stone-200 outline-none transition hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-pressed:border-stone-900 aria-pressed:ring-1 aria-pressed:ring-stone-900 dark:border-white/10 dark:aria-pressed:border-white"
          key={item.path}
          title={item.fileName}
          type="button"
          onClick={() => onSelect({ background: { kind: "image", path: item.path, url: item.url }, backgroundEnabled: true })}
        >
          <img alt="" className="size-full object-cover" loading="lazy" src={item.url} />
        </button>
      ))}
    </div>
  );
}

function FrameControls(props: BackgroundPanelProps): React.JSX.Element {
  const { frame, scene, image } = props;
  return (
    <div className="space-y-3">
      <PanelHeading eyebrow="Frame & presentation" resetLabel="Reset the frame panel" title="Choose a vessel" onReset={props.onResetFrame} />
      <Toggle checked={frame.frameEnabled} label="Show frame" onChange={(value) => props.onPatchFrame({ frameEnabled: value })} />
      <div className={frame.frameEnabled ? "grid grid-cols-2 gap-2" : "pointer-events-none grid grid-cols-2 gap-2 opacity-40"}>
        {frameOptions.map((option) => {
          const Icon = option.icon;
          return (
            <button
              aria-label={`Use ${option.label} frame`}
              aria-pressed={frame.frameId === option.id}
              className="flex items-center gap-2 rounded-md border border-stone-200 bg-white/65 px-2.5 py-2 text-left text-[12px] font-semibold text-stone-600 outline-none transition hover:border-stone-400 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-pressed:border-stone-900 aria-pressed:bg-stone-900 aria-pressed:text-white dark:border-white/8 dark:bg-white/5 dark:text-stone-300 dark:hover:border-white/20 dark:aria-pressed:border-white dark:aria-pressed:bg-white dark:aria-pressed:text-stone-900"
              key={option.id}
              type="button"
              onClick={() => props.onPatchFrame({ frameId: option.id })}
            >
              <Icon aria-hidden="true" size={15} />
              {option.label}
            </button>
          );
        })}
      </div>

      <CollapsibleSection defaultOpen icon={Frame} resetLabel="Reset the border" title="Border" onReset={() => props.onPatchFrame({ borderWidth: 0, borderColor: "#ffffff" })}>
        <Slider label="Border width" max={24} min={0} suffix="px" value={frame.borderWidth} onChange={(value) => props.onPatchFrame({ borderWidth: value }, "borderWidth")} />
        <ColorField label="Border colour" value={frame.borderColor} onChange={(value) => props.onPatchFrame({ borderColor: value }, "borderColor")} />
        <Slider label="Corner radius" max={64} min={0} suffix="px" value={scene.cornerRadius} onChange={(value) => props.onPatchScene({ cornerRadius: value }, "cornerRadius")} />
      </CollapsibleSection>

      <CollapsibleSection defaultOpen icon={Layers} resetLabel="Reset the shadow" title="Shadow" onReset={() => props.onPatchFrame({ shadow: 48, shadowColor: "#000000", shadowSpread: 40 })}>
        <Slider label="Shadow strength" max={100} min={0} suffix="%" value={frame.shadow} onChange={(value) => props.onPatchFrame({ shadow: value }, "shadow")} />
        <Slider label="Shadow spread" max={100} min={0} suffix="%" value={frame.shadowSpread} onChange={(value) => props.onPatchFrame({ shadowSpread: value }, "shadowSpread")} />
        <ColorField label="Shadow colour" value={frame.shadowColor} onChange={(value) => props.onPatchFrame({ shadowColor: value }, "shadowColor")} />
      </CollapsibleSection>

      <CollapsibleSection icon={Sparkles} resetLabel="Reset the tilt" title="Presentation" onReset={() => props.onPatchImage({ tiltX: 0, tiltY: 0 })}>
        <ControlLabel hint="How the mockup faces the viewer" label="3D tilt" />
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <Slider label="Tilt X" max={30} min={-30} suffix="°" value={image.tiltX} onChange={(value) => props.onPatchImage({ tiltX: value }, "tiltX")} />
          <Slider label="Tilt Y" max={30} min={-30} suffix="°" value={image.tiltY} onChange={(value) => props.onPatchImage({ tiltY: value }, "tiltY")} />
        </div>
      </CollapsibleSection>
    </div>
  );
}

function TextControls(props: BackgroundPanelProps): React.JSX.Element {
  const { text } = props;
  return (
    <div className="space-y-3">
      <PanelHeading eyebrow="Text" resetLabel="Reset the text panel" title="Add the last signal" onReset={props.onResetText} />
      <Toggle checked={text.showTitle} label="Add title" onChange={(value) => props.onPatchText({ showTitle: value })} />
      {text.showTitle ? <TextField label="Title" value={text.title} onChange={(value) => props.onPatchText({ title: value }, "title")} /> : null}
      <Toggle checked={text.showNote} label="Add note" onChange={(value) => props.onPatchText({ showNote: value })} />
      {text.showNote ? <TextField label="Note" value={text.note} onChange={(value) => props.onPatchText({ note: value }, "note")} /> : null}
      <div className="rounded-md border border-stone-200 bg-white/60 px-3 py-2.5 dark:border-white/8 dark:bg-white/5">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-stone-700 dark:text-stone-200">
          <Tick aria-hidden="true" size={14} />
          Typography &amp; annotations
        </div>
        <p className="mt-1 text-[12px] leading-5 text-stone-500 dark:text-stone-400">
          Callouts, arrows, and redaction layers will share the same non-destructive scene model as capture editing.
        </p>
      </div>
    </div>
  );
}
