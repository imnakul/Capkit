import {
  backgroundPresets,
  defaultEffectSettings,
  looks,
  overlayTones,
  type BackgroundPresetId,
  type Look,
} from "../../../domain/showcase";
import {
  cameraCorners,
  cameraShapes,
  type AudioMix,
  type CameraLayout,
  type CursorStyle,
  type VideoScene,
  type ZoomSettings,
} from "../../../domain/videoScene";
import { keystrokeModes, keystrokePositions, type KeystrokeMode, type KeystrokeSettings } from "../../../domain/keystrokes";
import { SelectPointer, Frame, Image, Keyboard, Layers, MagicWand, Mic, Palette, Speaker, Sparkles, Video } from "../../icons";
import { Chip, CollapsibleSection, ColorField, ControlLabel, Slider, Toggle } from "../showcase/primitives";

export type ScenePatch = (patch: Partial<VideoScene>) => void;

const keystrokeModeLabels: Record<KeystrokeMode, { label: string; description: string }> = {
  shortcuts: { label: "Shortcuts", description: "Show only Ctrl, Alt, and Win shortcuts" },
  all: { label: "All keys", description: "Show shortcuts and named keys such as Enter and Tab" },
};

/** Background, padding, and effects — the Showcase treatment applied to video. */
export function StagePanel({ scene, onPatch, onApplyLook }: { scene: VideoScene; onPatch: ScenePatch; onApplyLook: (look: Look) => void }): React.JSX.Element {
  const activePreset: BackgroundPresetId | null = scene.scene.background.kind === "preset" ? scene.scene.background.id : null;
  return (
    <div className="space-y-2.5">
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
              onClick={() => onApplyLook(look)}
            >
              <span
                className="grid aspect-[1.3] place-items-center rounded-md border border-content/10 shadow-sm transition-colors duration-120 motion-reduce:transition-none group-hover:scale-[1.04] group-focus-visible:ring-2 group-focus-visible:ring-accent/50"
                style={{ background: look.swatch }}
              >
                <span className="block h-1/2 w-3/5 rounded-[2px] bg-content/4 shadow-[0_2px_6px_rgb(0_0_0/45%)]" />
              </span>
              <span className="mt-1 block truncate text-[12px] font-medium text-content/80">{look.label}</span>
            </button>
          ))}
        </div>
      </div>

      <Toggle
        checked={scene.scene.backgroundEnabled}
        label="Background"
        onChange={(value) => onPatch({ scene: { ...scene.scene, backgroundEnabled: value } })}
      />

      <div className={scene.scene.backgroundEnabled ? "space-y-2.5" : "pointer-events-none space-y-2.5 opacity-40"}>
        <CollapsibleSection defaultOpen icon={Palette} title="Backdrop">
          <div className="grid grid-cols-3 gap-2">
            {backgroundPresets.map((preset) => (
              <button
                aria-label={`Use ${preset.label} background`}
                aria-pressed={activePreset === preset.id}
                className="group outline-none"
                key={preset.id}
                type="button"
                onClick={() => onPatch({ scene: { ...scene.scene, background: { kind: "preset", id: preset.id } } })}
              >
                <span
                  className="block aspect-[1.3] rounded-md border border-content/10 shadow-sm transition-colors duration-120 motion-reduce:transition-none group-hover:scale-[1.04] group-focus-visible:ring-2 group-focus-visible:ring-accent/50 group-aria-pressed:border-accent group-aria-pressed:ring-1 group-aria-pressed:ring-accent"
                  style={{ background: preset.swatch }}
                />
                <span className="mt-1 block truncate text-[12px] font-medium text-content/60">{preset.label}</span>
              </button>
            ))}
          </div>
          <ColorField
            label="Custom colour"
            value={scene.scene.customColor}
            onChange={(value) => onPatch({ scene: { ...scene.scene, customColor: value, background: { kind: "color", value } } })}
          />
        </CollapsibleSection>

        <CollapsibleSection defaultOpen icon={Image} title="Padding & radius">
          <Slider
            label="Padding"
            max={200}
            min={0}
            suffix="px"
            value={scene.scene.paddingTop}
            onChange={(value) =>
              onPatch({
                scene: { ...scene.scene, paddingTop: value, paddingRight: value, paddingBottom: value, paddingLeft: value },
              })
            }
          />
          <Slider
            label="Corner radius"
            max={64}
            min={0}
            suffix="px"
            value={scene.scene.cornerRadius}
            onChange={(value) => onPatch({ scene: { ...scene.scene, cornerRadius: value } })}
          />
          <Slider
            label="Shadow"
            max={100}
            min={0}
            suffix="%"
            value={scene.frame.shadow}
            onChange={(value) => onPatch({ frame: { ...scene.frame, shadow: value } })}
          />
        </CollapsibleSection>

        <CollapsibleSection icon={Layers} title="Overlay">
          <div className="grid grid-cols-3 gap-1.5">
            {overlayTones.map((tone) => (
              <Chip
                active={scene.scene.overlayTone === tone.id}
                key={tone.id}
                label={`Use the ${tone.label} overlay`}
                onClick={() => onPatch({ scene: { ...scene.scene, overlayTone: tone.id } })}
              >
                {tone.label}
              </Chip>
            ))}
          </div>
          <Slider
            label="Overlay strength"
            max={90}
            min={0}
            suffix="%"
            value={scene.scene.overlayStrength}
            onChange={(value) => onPatch({ scene: { ...scene.scene, overlayStrength: value } })}
          />
        </CollapsibleSection>

        <CollapsibleSection
          icon={MagicWand}
          resetLabel="Reset background effects"
          title="Effects"
          onReset={() => onPatch({ scene: { ...scene.scene, effects: defaultEffectSettings } })}
        >
          <Slider label="Noise" max={100} min={0} suffix="%" value={scene.scene.effects.noise} onChange={(value) => onPatch({ scene: { ...scene.scene, effects: { ...scene.scene.effects, noise: value } } })} />
          <Slider label="Vignette" max={100} min={0} suffix="%" value={scene.scene.effects.vignette} onChange={(value) => onPatch({ scene: { ...scene.scene, effects: { ...scene.scene.effects, vignette: value } } })} />
          <Slider label="Spotlight" max={100} min={0} suffix="%" value={scene.scene.effects.spotlight} onChange={(value) => onPatch({ scene: { ...scene.scene, effects: { ...scene.scene.effects, spotlight: value } } })} />
        </CollapsibleSection>
      </div>
    </div>
  );
}

/** Cursor smoothing, zoom on click, and the camera. */
export function MotionPanel({
  scene,
  cursorInVideo,
  hasCursorTrack,
  hasCameraTrack,
  clickCount,
  onPatchCursor,
  onPatchZoom,
  onPatchCamera,
  keysRecorded,
  onPatchKeystrokes,
}: {
  scene: VideoScene;
  cursorInVideo: boolean;
  hasCursorTrack: boolean;
  keysRecorded: boolean;
  hasCameraTrack: boolean;
  clickCount: number;
  onPatchCursor: (patch: Partial<CursorStyle>) => void;
  onPatchZoom: (patch: Partial<ZoomSettings>) => void;
  onPatchCamera: (patch: Partial<CameraLayout>) => void;
  onPatchKeystrokes: (patch: Partial<KeystrokeSettings>) => void;
}): React.JSX.Element {
  return (
    <div className="space-y-2.5">
      {hasCursorTrack ? null : (
        <p className="rounded-md border border-dashed border-content/10 px-2.5 py-2 text-[12px] leading-5 text-content/60">
          This recording has no cursor track, so smoothing and zoom on click are unavailable. Recordings made from now on always include one.
        </p>
      )}

      <div className={hasCursorTrack ? "space-y-2.5" : "pointer-events-none space-y-2.5 opacity-40"}>
        <CollapsibleSection defaultOpen icon={SelectPointer} title="Cursor">
          <Toggle checked={scene.cursor.show} label="Show cursor" onChange={(value) => onPatchCursor({ show: value })} />
          {cursorInVideo ? (
            <p className="text-[12px] leading-5 text-content/55">
              The pointer is already in this video. Turning this on draws a smoothed one on top.
            </p>
          ) : null}
          <Slider
            hint="Higher removes more jitter"
            label="Smoothing"
            max={95}
            min={0}
            suffix="%"
            value={scene.cursor.smoothing}
            onChange={(value) => onPatchCursor({ smoothing: value })}
          />
          <Slider label="Size" max={220} min={60} suffix="%" value={scene.cursor.size} onChange={(value) => onPatchCursor({ size: value })} />
          <Toggle checked={scene.cursor.clickHighlight} label="Ring on click" onChange={(value) => onPatchCursor({ clickHighlight: value })} />
        </CollapsibleSection>

        <CollapsibleSection defaultOpen icon={Sparkles} title="Zoom on click">
          <Toggle checked={scene.zoom.enabled} label="Automatic zoom" onChange={(value) => onPatchZoom({ enabled: value })} />
          <Toggle
            checked={keysRecorded && scene.zoom.followTyping}
            disabled={!keysRecorded}
            label="Follow typing"
            onChange={(value) => onPatchZoom({ followTyping: value })}
          />
          <ControlLabel hint={`${String(clickCount)} clicks found`} label="Detected" />
          <Slider label="Zoom level" max={300} min={110} suffix="%" value={Math.round(scene.zoom.scale * 100)} onChange={(value) => onPatchZoom({ scale: value / 100 })} />
          <Slider
            hint="How early the zoom starts moving"
            label="Lead-in"
            max={100}
            min={0}
            suffix="cs"
            value={Math.round(scene.zoom.leadSeconds * 100)}
            onChange={(value) => onPatchZoom({ leadSeconds: value / 100 })}
          />
          <Slider
            hint="How long it stays in after the last click"
            label="Hold"
            max={300}
            min={0}
            suffix="cs"
            value={Math.round(scene.zoom.holdSeconds * 100)}
            onChange={(value) => onPatchZoom({ holdSeconds: value / 100 })}
          />
        </CollapsibleSection>

        <CollapsibleSection icon={Keyboard} title="Keystrokes">
          {keysRecorded ? null : (
            <p className="mb-2.5 rounded-md border border-dashed border-content/10 px-2.5 py-2 text-[12px] leading-5 text-content/60">
              Keys were not recorded for this clip. Turn on Keystrokes in the recorder to show shortcuts next time.
            </p>
          )}
          <Toggle checked={scene.keystrokes.show} label="Show labels" onChange={(value) => onPatchKeystrokes({ show: value })} />
          <div className={scene.keystrokes.show ? "space-y-2.5" : "pointer-events-none space-y-2.5 opacity-40"}>
            <ControlLabel hint="Typed text is never recorded" label="Keys" />
            <div className="grid grid-cols-2 gap-1.5">
              {keystrokeModes.map((mode) => (
                <Chip active={scene.keystrokes.mode === mode} key={mode} label={keystrokeModeLabels[mode].description} onClick={() => onPatchKeystrokes({ mode })}>
                  {keystrokeModeLabels[mode].label}
                </Chip>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {keystrokePositions.map((position) => (
                <Chip active={scene.keystrokes.position === position} key={position} label={`Place labels at the ${position}`} onClick={() => onPatchKeystrokes({ position })}>
                  {position}
                </Chip>
              ))}
            </div>
            <Slider label="Label size" max={200} min={60} suffix="%" value={scene.keystrokes.size} onChange={(value) => onPatchKeystrokes({ size: value })} />
            <Toggle checked={scene.keystrokes.clickLabels} label="Label clicks" onChange={(value) => onPatchKeystrokes({ clickLabels: value })} />
          </div>
        </CollapsibleSection>
      </div>

      <CollapsibleSection icon={Video} title="Camera">
        {hasCameraTrack ? null : (
          <p className="mb-2.5 rounded-md border border-dashed border-content/10 px-2.5 py-2 text-[12px] leading-5 text-content/60">
            This recording has no camera
          </p>
        )}
        <Toggle checked={scene.camera.show} label="Show camera" onChange={(value) => onPatchCamera({ show: value })} disabled={!hasCameraTrack} />
        <div className={scene.camera.show ? "space-y-3.5" : "pointer-events-none space-y-3.5 opacity-40"}>
          <div className="grid grid-cols-3 gap-1.5">
            {cameraShapes.map((shape) => (
              <Chip active={scene.camera.shape === shape} key={shape} label={`Use a ${shape} camera`} onClick={() => onPatchCamera({ shape })}>
                {shape}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {cameraCorners.map((corner) => (
              <Chip active={scene.camera.corner === corner && scene.camera.position === null} key={corner} label={`Place the camera ${corner.replace("-", " ")}`} onClick={() => onPatchCamera({ corner, position: null })}>
                {corner.replace("-", " ")}
              </Chip>
            ))}
          </div>
          <Slider label="Camera size" max={45} min={10} suffix="%" value={scene.camera.size} onChange={(value) => onPatchCamera({ size: value })} />
          <Toggle checked={scene.camera.mirrored} label="Mirror" onChange={(value) => onPatchCamera({ mirrored: value })} />
        </div>
      </CollapsibleSection>
    </div>
  );
}

/** Track balance for the two audio sidecars. */
export function AudioPanel({
  mix,
  hasSystem,
  hasMicrophone,
  onPatch,
}: {
  mix: AudioMix;
  hasSystem: boolean;
  hasMicrophone: boolean;
  onPatch: (patch: Partial<AudioMix>) => void;
}): React.JSX.Element {
  return (
    <div className="space-y-2.5">
      {!hasSystem && !hasMicrophone ? (
        <p className="rounded-md border border-dashed border-content/10 px-2.5 py-2 text-[12px] leading-5 text-content/60">
          This recording has no audio tracks. Turn on system audio or the microphone in the recorder before recording.
        </p>
      ) : null}

      {hasSystem ? (
        <CollapsibleSection defaultOpen icon={Speaker} title="System audio">
          <Toggle checked={!mix.systemMuted} label="Enabled" onChange={(value) => onPatch({ systemMuted: !value })} />
          <Slider label="Volume" max={150} min={0} suffix="%" value={mix.systemVolume} onChange={(value) => onPatch({ systemVolume: value })} />
        </CollapsibleSection>
      ) : null}

      {hasMicrophone ? (
        <CollapsibleSection defaultOpen icon={Mic} title="Microphone">
          <Toggle checked={!mix.microphoneMuted} label="Enabled" onChange={(value) => onPatch({ microphoneMuted: !value })} />
          <Slider label="Volume" max={150} min={0} suffix="%" value={mix.microphoneVolume} onChange={(value) => onPatch({ microphoneVolume: value })} />
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection icon={Frame} title="About the tracks">
        <p className="text-[12px] leading-5 text-content/60">
          System audio and the microphone are recorded separately so they can be balanced here. They are mixed together when you export.
        </p>
      </CollapsibleSection>
    </div>
  );
}
