import { Crop, FlipHorizontal, FlipVertical, Image, MagicWand, RotateClockwise, RotateCounterClockwise, Sliders, Sparkles } from "../../icons";
import {
  cropRatios,
  croppedPixelSize,
  defaultEffectSettings,
  defaultImageSettings,
  effectControls,
  imageFilters,
  maxCropInset,
  rotateQuarterTurns,
  type CropEdge,
  type EffectSettings,
  type ImageSettings,
  type Size,
} from "../../../domain/showcase";
import { Chip, CollapsibleSection, ControlLabel, IconButton, PanelHeading, Slider, ToggleButton } from "./primitives";

/** The effect sliders, scoped so both rails can expose the same four controls. */
export function EffectSliders({
  effects,
  scope,
  onChange,
}: {
  effects: EffectSettings;
  scope: "image" | "background";
  onChange: (patch: Partial<EffectSettings>, mergeKey: string) => void;
}): React.JSX.Element {
  return (
    <>
      {effectControls.map((control) => (
        <Slider
          ariaLabel={`${scope === "image" ? "Image" : "Background"} ${control.label.toLowerCase()}`}
          hint={control.hint}
          key={control.id}
          label={control.label}
          max={100}
          min={0}
          suffix="%"
          value={effects[control.id]}
          onChange={(value) => onChange({ [control.id]: value }, `${scope}-${control.id}`)}
        />
      ))}
    </>
  );
}

/** Everything that happens *to* the image itself. */
export function ImagePanel({
  image,
  natural,
  cropMode,
  onPatch,
  onCropChange,
  onApplyRatio,
  onCropModeChange,
}: {
  image: ImageSettings;
  natural: Size;
  cropMode: boolean;
  onPatch: (patch: Partial<ImageSettings>, mergeKey?: string) => void;
  onCropChange: (edge: CropEdge, value: number) => void;
  onApplyRatio: (id: (typeof cropRatios)[number]["id"]) => void;
  onCropModeChange: (value: boolean) => void;
}): React.JSX.Element {
  const croppedSize = croppedPixelSize(natural, image.crop);
  return (
    <aside
      aria-label="Image panel"
      className="flex min-h-0 flex-col rounded-lg border border-stone-300/80 bg-white/55 dark:border-white/10 dark:bg-white/[0.025]"
    >
      <div className="shrink-0 border-b border-stone-200 px-3 py-2.5 dark:border-white/8">
        <PanelHeading eyebrow="Image panel" resetLabel="Reset the image panel" title="Shape the image" onReset={() => onPatch(defaultImageSettings)} />
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5">
        <CollapsibleSection
          defaultOpen
          icon={Image}
          resetLabel="Reset position"
          title="Position"
          onReset={() => onPatch({ zoom: 100, offsetX: 0, offsetY: 0 })}
        >
          <Slider label="Zoom" max={220} min={40} suffix="%" value={image.zoom} onChange={(value) => onPatch({ zoom: value }, "zoom")} />
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            <Slider label="Horizontal" max={200} min={-200} suffix="px" value={image.offsetX} onChange={(value) => onPatch({ offsetX: value }, "offsetX")} />
            <Slider label="Vertical" max={200} min={-200} suffix="px" value={image.offsetY} onChange={(value) => onPatch({ offsetY: value }, "offsetY")} />
          </div>
          <p className="text-[12px] leading-4 text-stone-400 dark:text-stone-500">Drag directly on the preview to pan.</p>
        </CollapsibleSection>

        <CollapsibleSection
          defaultOpen
          icon={RotateClockwise}
          resetLabel="Reset rotation and flip"
          title="Rotate & flip"
          onReset={() => onPatch({ quarterTurns: 0, straighten: 0, flipHorizontal: false, flipVertical: false })}
        >
          <div className="flex items-center gap-2">
            <IconButton label="Rotate 90° left" onClick={() => onPatch({ quarterTurns: rotateQuarterTurns(image.quarterTurns, -1) })}>
              <RotateCounterClockwise aria-hidden="true" size={14} />
            </IconButton>
            <IconButton label="Rotate 90° right" onClick={() => onPatch({ quarterTurns: rotateQuarterTurns(image.quarterTurns, 1) })}>
              <RotateClockwise aria-hidden="true" size={14} />
            </IconButton>
            <span className="ml-auto font-mono text-[12px] text-stone-400">{`${String(image.quarterTurns * 90)}°`}</span>
          </div>
          <div className="flex items-center gap-2">
            <ToggleButton active={image.flipHorizontal} label="Flip horizontally" onClick={() => onPatch({ flipHorizontal: !image.flipHorizontal })}>
              <FlipHorizontal aria-hidden="true" size={14} />
              Flip X
            </ToggleButton>
            <ToggleButton active={image.flipVertical} label="Flip vertically" onClick={() => onPatch({ flipVertical: !image.flipVertical })}>
              <FlipVertical aria-hidden="true" size={14} />
              Flip Y
            </ToggleButton>
          </div>
          <Slider label="Straighten" max={15} min={-15} suffix="°" value={image.straighten} onChange={(value) => onPatch({ straighten: value }, "straighten")} />
        </CollapsibleSection>

        <CollapsibleSection
          defaultOpen
          icon={Crop}
          resetLabel="Reset crop"
          title="Crop"
          onReset={() => onPatch({ crop: defaultImageSettings.crop, cropRatio: "free" })}
        >
          <ToggleButton active={cropMode} label="Crop on the canvas" onClick={() => onCropModeChange(!cropMode)}>
            <Crop aria-hidden="true" size={14} />
            {cropMode ? "Done cropping" : "Crop on canvas"}
          </ToggleButton>
          <div className="flex flex-wrap gap-1.5">
            {cropRatios.map((cropRatio) => (
              <Chip active={image.cropRatio === cropRatio.id} key={cropRatio.id} label={`Crop to ${cropRatio.label}`} onClick={() => onApplyRatio(cropRatio.id)}>
                {cropRatio.label}
              </Chip>
            ))}
          </div>
          <p className="font-mono text-[12px] text-stone-400">{`${String(croppedSize.width)} × ${String(croppedSize.height)} px`}</p>
          <details className="group">
            <summary className="cursor-pointer list-none text-[12px] font-semibold text-stone-500 outline-none transition hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:text-stone-400 dark:hover:text-white">
              Numeric insets
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4">
              <Slider label="Crop top" max={maxCropInset * 100} min={0} suffix="%" value={Math.round(image.crop.top * 100)} onChange={(value) => onCropChange("top", value)} />
              <Slider label="Crop right" max={maxCropInset * 100} min={0} suffix="%" value={Math.round(image.crop.right * 100)} onChange={(value) => onCropChange("right", value)} />
              <Slider label="Crop bottom" max={maxCropInset * 100} min={0} suffix="%" value={Math.round(image.crop.bottom * 100)} onChange={(value) => onCropChange("bottom", value)} />
              <Slider label="Crop left" max={maxCropInset * 100} min={0} suffix="%" value={Math.round(image.crop.left * 100)} onChange={(value) => onCropChange("left", value)} />
            </div>
          </details>
        </CollapsibleSection>

        <CollapsibleSection
          icon={Sliders}
          resetLabel="Reset adjustments"
          title="Adjust"
          onReset={() => onPatch({ filter: "clean", brightness: 100, contrast: 100, saturation: 100 })}
        >
          <div className="grid grid-cols-3 gap-1.5">
            {imageFilters.map((preset) => (
              <Chip active={image.filter === preset.id} key={preset.id} label={`Apply the ${preset.label} look`} onClick={() => onPatch({ filter: preset.id })}>
                {preset.label}
              </Chip>
            ))}
          </div>
          <Slider label="Brightness" max={160} min={50} suffix="%" value={image.brightness} onChange={(value) => onPatch({ brightness: value }, "brightness")} />
          <Slider label="Contrast" max={160} min={50} suffix="%" value={image.contrast} onChange={(value) => onPatch({ contrast: value }, "contrast")} />
          <Slider label="Saturation" max={200} min={0} suffix="%" value={image.saturation} onChange={(value) => onPatch({ saturation: value }, "saturation")} />
        </CollapsibleSection>

        <CollapsibleSection icon={MagicWand} resetLabel="Reset image effects" title="Effects" onReset={() => onPatch({ effects: defaultEffectSettings })}>
          <ControlLabel hint="Applied to the image only" label="Texture & light" />
          <EffectSliders effects={image.effects} scope="image" onChange={(patch, mergeKey) => onPatch({ effects: { ...image.effects, ...patch } }, mergeKey)} />
        </CollapsibleSection>

        <p className="flex items-center gap-1.5 px-1 text-[12px] text-stone-400 dark:text-stone-500">
          <Sparkles aria-hidden="true" size={12} />
          Every edit is non-destructive — Ctrl+Z steps back.
        </p>
      </div>
    </aside>
  );
}
