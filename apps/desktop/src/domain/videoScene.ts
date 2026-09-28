import { z } from "zod";
import { cursorTrackSchema } from "./cursorTrack";
import {
  defaultEffectSettings,
  defaultFrameSettings,
  defaultSceneSettings,
  effectSettingsSchema,
  frameSettingsSchema,
  sceneSettingsSchema,
  type Size,
} from "./showcase";
import { defaultZoomOptions, zoomKeyframeSchema } from "./zoomKeyframes";

/* -------------------------------------------------------------------------- */
/* Cursor presentation                                                         */
/* -------------------------------------------------------------------------- */

export const cursorStyleSchema = z.object({
  show: z.boolean(),
  /** Percent of the natural cursor size. */
  size: z.number(),
  smoothing: z.number(),
  /** Ring drawn where the pointer was pressed. */
  clickHighlight: z.boolean(),
  tint: z.string(),
});

export type CursorStyle = z.infer<typeof cursorStyleSchema>;

export const defaultCursorStyle: CursorStyle = {
  show: true,
  size: 120,
  smoothing: 45,
  clickHighlight: true,
  tint: "#ffffff",
};

/* -------------------------------------------------------------------------- */
/* Webcam                                                                      */
/* -------------------------------------------------------------------------- */

export const cameraShapes = ["circle", "rounded", "square"] as const;
export type CameraShape = (typeof cameraShapes)[number];

export const cameraCorners = ["bottom-right", "bottom-left", "top-right", "top-left"] as const;
export type CameraCorner = (typeof cameraCorners)[number];

export const cameraLayoutSchema = z.object({
  show: z.boolean(),
  shape: z.enum(cameraShapes),
  corner: z.enum(cameraCorners),
  /** Diameter as a percentage of the shorter stage edge. */
  size: z.number(),
  margin: z.number(),
  mirrored: z.boolean(),
  /** Free bubble position: top-left corner as fractions of the stage (0-1).
   * Choosing a corner resets it to null. */
  position: z.object({ x: z.number(), y: z.number() }).nullable().default(null),
});

export type CameraLayout = z.infer<typeof cameraLayoutSchema>;

export const defaultCameraLayout: CameraLayout = {
  show: true,
  shape: "circle",
  corner: "bottom-right",
  size: 24,
  margin: 32,
  mirrored: true,
  position: null,
};

/* -------------------------------------------------------------------------- */
/* Trim and audio                                                              */
/* -------------------------------------------------------------------------- */

export const trimSchema = z.object({ start: z.number(), end: z.number() });
export type Trim = z.infer<typeof trimSchema>;

export const audioMixSchema = z.object({
  systemVolume: z.number(),
  microphoneVolume: z.number(),
  systemMuted: z.boolean(),
  microphoneMuted: z.boolean(),
});

export type AudioMix = z.infer<typeof audioMixSchema>;

export const defaultAudioMix: AudioMix = {
  systemVolume: 100,
  microphoneVolume: 100,
  systemMuted: false,
  microphoneMuted: false,
};

/* -------------------------------------------------------------------------- */
/* The whole composition                                                       */
/* -------------------------------------------------------------------------- */

export const zoomSettingsSchema = z.object({
  enabled: z.boolean(),
  scale: z.number(),
  leadSeconds: z.number(),
  holdSeconds: z.number(),
  bridgeSeconds: z.number(),
  transitionSeconds: z.number(),
  manual: z.array(zoomKeyframeSchema),
});

export type ZoomSettings = z.infer<typeof zoomSettingsSchema>;

export const defaultZoomSettings: ZoomSettings = {
  enabled: true,
  ...defaultZoomOptions,
  manual: [],
};

export const videoSceneSchema = z.object({
  version: z.literal(1),
  scene: sceneSettingsSchema,
  frame: frameSettingsSchema,
  effects: effectSettingsSchema,
  cursor: cursorStyleSchema,
  camera: cameraLayoutSchema,
  zoom: zoomSettingsSchema,
  trim: trimSchema,
  audio: audioMixSchema,
});

export type VideoScene = z.infer<typeof videoSceneSchema>;

export function defaultVideoScene(durationSeconds: number): VideoScene {
  return {
    version: 1,
    // Video reads best with less padding than a still: the motion carries the
    // eye, so a wide margin just shrinks the thing people are watching.
    scene: { ...defaultSceneSettings, paddingTop: 40, paddingRight: 40, paddingBottom: 40, paddingLeft: 40 },
    frame: { ...defaultFrameSettings, frameId: "clean", shadow: 55 },
    effects: defaultEffectSettings,
    cursor: defaultCursorStyle,
    camera: { ...defaultCameraLayout, show: false },
    zoom: defaultZoomSettings,
    trim: { start: 0, end: Math.max(0.1, durationSeconds) },
    audio: defaultAudioMix,
  };
}

/** localStorage key holding the last Studio composition per recording. */
export const videoSceneStorageKey = "capkit.studio.scene.v1";

export const storedVideoScenesSchema = z.record(z.string(), videoSceneSchema);

/** Everything the compositor needs that is not part of the scene itself. */
export type VideoSources = {
  readonly media: CanvasImageSource | null;
  readonly mediaSize: Size;
  readonly background: CanvasImageSource | null;
  readonly camera: CanvasImageSource | null;
  readonly cursor: { readonly x: number; readonly y: number } | null;
  /** 0 to 1, ramping down after a click for the highlight ring. */
  readonly clickPulse: number;
};

export const emptyCursorTrack = cursorTrackSchema.parse({
  version: 1,
  times: [],
  xs: [],
  ys: [],
  events: [],
  shapes: [],
  displayBounds: { x: 0, y: 0, width: 0, height: 0 },
  scaleFactor: 1,
});

/** Seconds of usable footage after trimming. */
export function trimmedDuration(trim: Trim): number {
  return Math.max(0, trim.end - trim.start);
}

/** Where the camera sits inside the stage, in pixels. A free `position` wins;
 * otherwise the corner is used, as before. */
export function cameraRect(
  layout: CameraLayout,
  stage: Size,
): { x: number; y: number; width: number; height: number } {
  const diameter = (Math.min(stage.width, stage.height) * layout.size) / 100;
  if (layout.position !== null) {
    const x = Math.min(
      Math.max(0, layout.position.x * stage.width),
      Math.max(0, stage.width - diameter),
    );
    const y = Math.min(
      Math.max(0, layout.position.y * stage.height),
      Math.max(0, stage.height - diameter),
    );
    return { x, y, width: diameter, height: diameter };
  }
  const margin = layout.margin;
  const right = stage.width - diameter - margin;
  const bottom = stage.height - diameter - margin;
  const x = layout.corner === "bottom-left" || layout.corner === "top-left" ? margin : right;
  const y = layout.corner === "top-left" || layout.corner === "top-right" ? margin : bottom;
  return { x, y, width: diameter, height: diameter };
}
