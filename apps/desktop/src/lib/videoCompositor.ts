import { backgroundPaint, fillBackground, paintEffects } from "../domain/scene";
import { containScale, overlayValue, shadowOffset, type Size } from "../domain/showcase";
import { cameraRect, type VideoScene, type VideoSources } from "../domain/videoScene";
import { zoomAt, type ZoomKeyframe } from "../domain/zoomKeyframes";

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Paints one composed frame.
 *
 * This is the only renderer: the live preview draws through it at animation
 * rate and the exporter draws through it per encoded frame. Having a second
 * implementation for export is how "the export doesn't match the preview" bugs
 * happen, so there deliberately isn't one.
 */
export function paintFrame(
  context: Canvas2D,
  scene: VideoScene,
  sources: VideoSources,
  stage: Size,
  keyframes: readonly ZoomKeyframe[],
  time: number,
): void {
  context.save();
  context.clearRect(0, 0, stage.width, stage.height);

  if (scene.scene.backgroundEnabled) {
    fillBackground(context, backgroundPaint(scene.scene.background), stage, sources.background);
    const overlay = overlayValue(scene.scene);
    if (overlay !== null) {
      context.fillStyle = overlay;
      context.fillRect(0, 0, stage.width, stage.height);
    }
    paintEffects(context, scene.scene.effects, stage);
  }

  const padding = scene.scene.backgroundEnabled
    ? {
        top: scene.scene.paddingTop,
        right: scene.scene.paddingRight,
        bottom: scene.scene.paddingBottom,
        left: scene.scene.paddingLeft,
      }
    : { top: 0, right: 0, bottom: 0, left: 0 };

  const bounds: Size = {
    width: Math.max(2, stage.width - padding.left - padding.right),
    height: Math.max(2, stage.height - padding.top - padding.bottom),
  };
  const fit = containScale(sources.mediaSize, bounds);
  const width = Math.round(sources.mediaSize.width * fit);
  const height = Math.round(sources.mediaSize.height * fit);
  const x = padding.left + Math.round((bounds.width - width) / 2);
  const y = padding.top + Math.round((bounds.height - height) / 2);
  const radius = Math.max(0, scene.scene.cornerRadius);

  // Shadow is painted as its own rounded rect, because a shadow set while
  // drawing the video would also be applied to every later layer.
  if (scene.frame.shadow > 0) {
    const offset = shadowOffset(scene.frame.shadow, 0, 0);
    context.save();
    context.shadowColor = `rgb(0 0 0 / ${String(Math.round(scene.frame.shadow * 0.65))}%)`;
    context.shadowBlur = 22 + scene.frame.shadow / 2 + scene.frame.shadowSpread * 0.9;
    context.shadowOffsetX = offset.x;
    context.shadowOffsetY = offset.y;
    context.fillStyle = "#000000";
    roundedRect(context, x, y, width, height, radius);
    context.fill();
    context.restore();
  }

  context.save();
  roundedRect(context, x, y, width, height, radius);
  context.clip();

  const zoom = scene.zoom.enabled ? zoomAt(keyframes, time) : { scale: 1, cx: 0.5, cy: 0.5 };
  if (sources.media !== null) {
    // Zooming means drawing a larger image and letting the clip crop it, with
    // the focal point held under the same place on screen.
    const drawWidth = width * zoom.scale;
    const drawHeight = height * zoom.scale;
    const drawX = x + width / 2 - drawWidth * zoom.cx;
    const drawY = y + height / 2 - drawHeight * zoom.cy;
    context.drawImage(sources.media, drawX, drawY, drawWidth, drawHeight);

    if (scene.effects.noise > 0 || scene.effects.vignette > 0 || scene.effects.texture > 0 || scene.effects.spotlight > 0) {
      context.save();
      context.translate(x, y);
      paintEffects(context, scene.effects, { width, height });
      context.restore();
    }

    if (scene.cursor.show && sources.cursor !== null) {
      paintCursor(context, scene, sources, { x, y, width, height }, zoom);
    }
  } else {
    context.fillStyle = "#101210";
    context.fillRect(x, y, width, height);
  }
  context.restore();

  if (scene.frame.borderWidth > 0) {
    context.save();
    context.strokeStyle = scene.frame.borderColor;
    context.lineWidth = scene.frame.borderWidth;
    roundedRect(context, x, y, width, height, radius);
    context.stroke();
    context.restore();
  }

  if (scene.camera.show && sources.camera !== null) {
    paintCamera(context, scene, sources.camera, stage);
  }

  context.restore();
}

/** Draws the smoothed pointer, in stage coordinates, following the zoom. */
function paintCursor(
  context: Canvas2D,
  scene: VideoScene,
  sources: VideoSources,
  media: { x: number; y: number; width: number; height: number },
  zoom: { scale: number; cx: number; cy: number },
): void {
  const cursor = sources.cursor;
  if (cursor === null || sources.mediaSize.width <= 0 || sources.mediaSize.height <= 0) return;

  const fx = cursor.x / sources.mediaSize.width;
  const fy = cursor.y / sources.mediaSize.height;
  const drawWidth = media.width * zoom.scale;
  const drawHeight = media.height * zoom.scale;
  const px = media.x + media.width / 2 - drawWidth * zoom.cx + fx * drawWidth;
  const py = media.y + media.height / 2 - drawHeight * zoom.cy + fy * drawHeight;

  const size = (scene.cursor.size / 100) * 22 * Math.max(1, zoom.scale * 0.6);

  if (scene.cursor.clickHighlight && sources.clickPulse > 0) {
    context.save();
    context.globalAlpha = sources.clickPulse * 0.5;
    context.strokeStyle = scene.cursor.tint;
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(px, py, size * (1.2 + (1 - sources.clickPulse) * 2.2), 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  drawPointerGlyph(context, px, py, size, scene.cursor.tint);
}

/**
 * The standard arrow silhouette, drawn rather than blitted so it stays crisp
 * at any scale. Shared with the recordings list, which overlays the same
 * cursor Studio paints.
 */
export function drawPointerGlyph(
  context: Canvas2D,
  x: number,
  y: number,
  size: number,
  tint: string,
): void {
  context.save();
  context.translate(x, y);
  context.scale(size / 22, size / 22);
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, 20);
  context.lineTo(4.8, 15.4);
  context.lineTo(8.1, 22.4);
  context.lineTo(11.6, 20.8);
  context.lineTo(8.4, 13.9);
  context.lineTo(14.6, 13.4);
  context.closePath();
  context.fillStyle = tint;
  context.strokeStyle = "rgb(0 0 0 / 55%)";
  context.lineWidth = 1.4;
  context.shadowColor = "rgb(0 0 0 / 35%)";
  context.shadowBlur = 6;
  context.fill();
  context.shadowBlur = 0;
  context.stroke();
  context.restore();
}

function paintCamera(context: Canvas2D, scene: VideoScene, camera: CanvasImageSource, stage: Size): void {
  const rect = cameraRect(scene.camera, stage);
  context.save();
  context.shadowColor = "rgb(0 0 0 / 45%)";
  context.shadowBlur = 28;
  context.shadowOffsetY = 10;

  if (scene.camera.shape === "circle") {
    context.beginPath();
    context.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, 0, Math.PI * 2);
  } else {
    roundedRect(context, rect.x, rect.y, rect.width, rect.height, scene.camera.shape === "rounded" ? rect.width * 0.18 : 0);
  }
  context.fillStyle = "#000000";
  context.fill();
  context.shadowBlur = 0;
  context.clip();

  if (scene.camera.mirrored) {
    context.translate(rect.x + rect.width, rect.y);
    context.scale(-1, 1);
    context.translate(-rect.x, -rect.y);
  }
  // The camera feed is cropped to fill its shape rather than letterboxed.
  drawCoverInto(context, camera, rect);
  context.restore();

  context.save();
  context.strokeStyle = "rgb(255 255 255 / 35%)";
  context.lineWidth = 2;
  if (scene.camera.shape === "circle") {
    context.beginPath();
    context.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, 0, Math.PI * 2);
  } else {
    roundedRect(context, rect.x, rect.y, rect.width, rect.height, scene.camera.shape === "rounded" ? rect.width * 0.18 : 0);
  }
  context.stroke();
  context.restore();
}

function drawCoverInto(
  context: Canvas2D,
  image: CanvasImageSource,
  rect: { x: number; y: number; width: number; height: number },
): void {
  const source = sourceSize(image);
  if (source.width <= 0 || source.height <= 0) return;
  const scale = Math.max(rect.width / source.width, rect.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  context.drawImage(image, rect.x + (rect.width - width) / 2, rect.y + (rect.height - height) / 2, width, height);
}

function sourceSize(image: CanvasImageSource): Size {
  if (typeof HTMLVideoElement !== "undefined" && image instanceof HTMLVideoElement) {
    return { width: image.videoWidth, height: image.videoHeight };
  }
  if (typeof VideoFrame !== "undefined" && image instanceof VideoFrame) {
    return { width: image.displayWidth, height: image.displayHeight };
  }
  const candidate = image as { width?: number; height?: number };
  return { width: candidate.width ?? 0, height: candidate.height ?? 0 };
}

function roundedRect(
  context: Canvas2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const limit = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + limit, y);
  context.lineTo(x + width - limit, y);
  context.quadraticCurveTo(x + width, y, x + width, y + limit);
  context.lineTo(x + width, y + height - limit);
  context.quadraticCurveTo(x + width, y + height, x + width - limit, y + height);
  context.lineTo(x + limit, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - limit);
  context.lineTo(x, y + limit);
  context.quadraticCurveTo(x, y, x + limit, y);
  context.closePath();
}

/** Strength of the click ring at `time`, fading over 450 ms. */
export function clickPulseAt(events: readonly { time: number; kind: string }[], time: number): number {
  const window = 0.45;
  let pulse = 0;
  for (const event of events) {
    if (event.kind !== "down") continue;
    const age = time - event.time;
    if (age < 0 || age > window) continue;
    pulse = Math.max(pulse, 1 - age / window);
  }
  return pulse;
}
