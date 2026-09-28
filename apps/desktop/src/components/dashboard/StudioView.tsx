import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CursorTrack } from "../../domain/cursorTrack";
import { cursorAt } from "../../domain/cursorTrack";
import {
  formatDuration,
  recordingLibrarySchema,
  recordingLibraryStorageKey,
  type RecordingArtifacts,
} from "../../domain/recording";
import { fitRatioBox, stageAspectRatio, type Look, type Size } from "../../domain/showcase";
import {
  cameraRect,
  defaultVideoScene,
  storedVideoScenesSchema,
  trimmedDuration,
  videoSceneStorageKey,
  type AudioMix,
  type CameraLayout,
  type CursorStyle,
  type VideoScene,
  type ZoomSettings,
} from "../../domain/videoScene";
import { loadCursorTrack, recordingSrc } from "../../lib/recordingTauri";
import { describeInvokeError } from "../../lib/tauri";
import { clickPulseAt, paintFrame } from "../../lib/videoCompositor";
import { canEncodeVideo, downloadExport, exportVideo, keyframesFor, smoothedCursor } from "../../lib/videoExport";
import { SelectPointer, Download, Film, Palette, Pause, Play, Speaker } from "../icons";
import { AudioPanel, MotionPanel, StagePanel } from "./studio/StudioPanels";
import { Timeline } from "./studio/Timeline";

type PanelTab = "stage" | "motion" | "audio";

const panelTabs: readonly { id: PanelTab; label: string; icon: typeof Palette }[] = [
  { id: "stage", label: "Stage", icon: Palette },
  { id: "motion", label: "Motion", icon: SelectPointer },
  { id: "audio", label: "Audio", icon: Speaker },
];

const previewFps = 30;

function readLibrary(): readonly RecordingArtifacts[] {
  const raw = window.localStorage.getItem(recordingLibraryStorageKey);
  if (raw === null) return [];
  const parsed = recordingLibrarySchema.safeParse(JSON.parse(raw) as unknown);
  return parsed.success ? parsed.data : [];
}

/**
 * The video editor.
 *
 * Everything here is non-destructive: trim bounds, the stage treatment, cursor
 * smoothing, and zoom keyframes are all stored against the recording and only
 * applied when it is exported. The preview draws through the same `paintFrame`
 * the exporter uses, so the two cannot drift apart.
 */
export function StudioView({ initialRecording = null }: { initialRecording?: RecordingArtifacts | null }): React.JSX.Element {
  const [library, setLibrary] = useState<readonly RecordingArtifacts[]>([]);
  const [selected, setSelected] = useState<RecordingArtifacts | null>(initialRecording);
  const [scene, setScene] = useState<VideoScene>(defaultVideoScene(1));
  const [track, setTrack] = useState<CursorTrack | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<PanelTab>("stage");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [encodeReady, setEncodeReady] = useState<boolean | null>(null);
  const [areaSize, setAreaSize] = useState<Size>({ width: 960, height: 540 });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef(0);
  const cameraDragRef = useRef<{ dx: number; dy: number } | null>(null);
  const [cameraHover, setCameraHover] = useState(false);

  useEffect(() => {
    const entries = readLibrary();
    setLibrary(entries);
    setSelected((current) => current ?? entries.at(0) ?? null);
    void canEncodeVideo().then(setEncodeReady);
  }, []);

  useEffect(() => {
    const element = areaRef.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries.at(0);
      if (entry === undefined) return;
      setAreaSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return (): void => observer.disconnect();
  }, []);

  // Each recording keeps its own composition, so switching between them does
  // not silently carry one clip's trim onto another.
  useEffect(() => {
    if (selected === null) return;
    setTime(0);
    setPlaying(false);
    const raw = window.localStorage.getItem(videoSceneStorageKey);
    const parsed = raw === null ? null : storedVideoScenesSchema.safeParse(JSON.parse(raw) as unknown);
    const stored = parsed?.success === true ? parsed.data[selected.id] : undefined;
    setScene(stored ?? defaultVideoScene(selected.durationSeconds));
    setTrack(null);
    if (selected.cursorPath !== null) void loadCursorTrack(selected.cursorPath).then(setTrack);
  }, [selected]);

  useEffect(() => {
    if (selected === null) return;
    const timer = window.setTimeout(() => {
      const raw = window.localStorage.getItem(videoSceneStorageKey);
      const parsed = raw === null ? null : storedVideoScenesSchema.safeParse(JSON.parse(raw) as unknown);
      const all = parsed?.success === true ? parsed.data : {};
      window.localStorage.setItem(videoSceneStorageKey, JSON.stringify({ ...all, [selected.id]: scene }));
    }, 500);
    return (): void => window.clearTimeout(timer);
  }, [scene, selected]);

  const mediaSize: Size = useMemo(
    () => ({ width: selected?.width ?? 1920, height: selected?.height ?? 1080 }),
    [selected],
  );

  const stageBox: Size = useMemo(() => {
    const ratio = stageAspectRatio(scene.scene) ?? mediaSize.width / Math.max(1, mediaSize.height);
    const box = fitRatioBox(ratio, { width: Math.max(320, areaSize.width), height: Math.max(200, areaSize.height) });
    return { width: Math.max(2, Math.round(box.width)), height: Math.max(2, Math.round(box.height)) };
  }, [scene.scene, mediaSize, areaSize]);

  const keyframes = useMemo(() => keyframesFor(scene, track, mediaSize), [scene, track, mediaSize]);
  const cursorPath = useMemo(() => smoothedCursor(track, scene, previewFps), [track, scene]);
  const clickTimes = useMemo(
    () => (track?.events ?? []).filter((event) => event.kind === "down").map((event) => event.time),
    [track],
  );

  const hasCameraTrack = selected?.cameraPath != null;

  // One renderer for preview and export, driven here at animation rate.
  const draw = useCallback(
    (at: number) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas === null) return;
      const context = canvas.getContext("2d");
      if (context === null) return;
      if (canvas.width !== stageBox.width || canvas.height !== stageBox.height) {
        canvas.width = stageBox.width;
        canvas.height = stageBox.height;
      }
      paintFrame(
        context,
        scene,
        {
          media: video,
          mediaSize,
          background: null,
          camera: hasCameraTrack ? cameraRef.current : null,
          cursor: cursorPath.length === 0 ? null : cursorAt(cursorPath, at),
          clickPulse: clickPulseAt(track?.events ?? [], at),
        },
        stageBox,
        keyframes,
        at,
      );
    },
    [scene, mediaSize, stageBox, keyframes, cursorPath, track, hasCameraTrack],
  );

  useEffect(() => {
    draw(time);
  }, [draw, time]);

  const syncCamera = useCallback((to: number, play: boolean): void => {
    const camera = cameraRef.current;
    if (camera === null) return;
    if (Math.abs(camera.currentTime - to) > 0.05 || camera.paused === play) {
      camera.currentTime = to;
    }
    if (play) void camera.play().catch(() => undefined);
    else camera.pause();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const video = videoRef.current;
    if (video === null) return;
    syncCamera(video.currentTime, true);
    void video.play().catch(() => setPlaying(false));

    const tick = (): void => {
      const current = video.currentTime;
      if (current >= scene.trim.end) {
        video.pause();
        syncCamera(current, false);
        setPlaying(false);
        setTime(scene.trim.end);
        return;
      }
      const camera = cameraRef.current;
      if (camera !== null && Math.abs(camera.currentTime - current) > 0.15) {
        camera.currentTime = current;
      }
      setTime(current);
      draw(current);
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return (): void => {
      window.cancelAnimationFrame(frameRef.current);
      video.pause();
      syncCamera(video.currentTime, false);
    };
  }, [playing, scene.trim.end, draw, syncCamera]);

  function seek(next: number): void {
    const video = videoRef.current;
    setTime(next);
    if (video !== null) video.currentTime = next;
    syncCamera(next, false);
  }

  function togglePlay(): void {
    const video = videoRef.current;
    if (video === null) return;
    if (playing) {
      video.pause();
      syncCamera(video.currentTime, false);
      setPlaying(false);
      return;
    }
    if (time >= scene.trim.end - 0.05) seek(scene.trim.start);
    setPlaying(true);
  }

  function stagePoint(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (canvas === null) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * stageBox.width,
      y: ((event.clientY - rect.top) / rect.height) * stageBox.height,
    };
  }

  function inCameraBubble(point: { x: number; y: number }): { x: number; y: number; width: number; height: number } | null {
    if (!hasCameraTrack || !scene.camera.show) return null;
    const bubble = cameraRect(scene.camera, stageBox);
    if (point.x < bubble.x || point.x > bubble.x + bubble.width) return null;
    if (point.y < bubble.y || point.y > bubble.y + bubble.height) return null;
    return bubble;
  }

  function handlePreviewPointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (event.button !== 0) return;
    const point = stagePoint(event);
    if (point === null) return;
    const bubble = inCameraBubble(point);
    if (bubble === null) return;
    cameraDragRef.current = { dx: point.x - bubble.x, dy: point.y - bubble.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePreviewPointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    const point = stagePoint(event);
    if (point === null) return;
    const drag = cameraDragRef.current;
    if (drag !== null) {
      patch({
        camera: {
          ...scene.camera,
          position: {
            x: (point.x - drag.dx) / stageBox.width,
            y: (point.y - drag.dy) / stageBox.height,
          },
        },
      });
      return;
    }
    setCameraHover(inCameraBubble(point) !== null);
  }

  function handlePreviewPointerUp(): void {
    cameraDragRef.current = null;
    setCameraHover(false);
  }

  const patch = useCallback((next: Partial<VideoScene>): void => {
    setScene((current) => ({ ...current, ...next }));
  }, []);

  function applyLook(look: Look): void {
    setScene((current) => ({
      ...current,
      scene: { ...current.scene, backgroundEnabled: true, ...look.scene },
      frame: { ...current.frame, ...look.frame },
    }));
  }

  async function runExport(format: "mp4" | "gif"): Promise<void> {
    const video = videoRef.current;
    if (video === null || selected === null) return;
    setExporting(true);
    setProgress(0);
    setStatus(null);
    const wasPlaying = playing;
    setPlaying(false);
    try {
      const blob = await exportVideo({
        video,
        camera: cameraRef.current,
        background: null,
        scene,
        track,
        stage: stageBox,
        fps: format === "gif" ? 12 : selected.fps,
        format,
        onProgress: setProgress,
      });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadExport(blob, `capkit-studio-${stamp}.${format}`);
      setStatus(`Exported ${String(stageBox.width)} × ${String(stageBox.height)}`);
    } catch (error: unknown) {
      setStatus(describeInvokeError(error, "That export could not be produced"));
    } finally {
      setExporting(false);
      if (wasPlaying) setPlaying(false);
    }
  }

  if (selected === null) {
    return (
      <section aria-labelledby="studio-title" className="grid min-h-full place-items-center px-8 py-7 text-center">
        <div className="max-w-sm">
          <Film aria-hidden="true" className="mx-auto text-stone-300 dark:text-stone-600" size={30} />
          <h1 className="mt-3 text-[17px] font-semibold text-stone-800 dark:text-stone-100" id="studio-title">
            Nothing to edit yet
          </h1>
          <p className="mt-1.5 text-[13px] leading-5 text-stone-500 dark:text-stone-400">
            Make a recording from the Record section and it will appear here, ready to trim, style, and export.
          </p>
        </div>
      </section>
    );
  }

  const duration = selected.durationSeconds;

  return (
    <section aria-labelledby="studio-title" className="flex h-full flex-col overflow-hidden p-2.5 xl:p-3">
      <h1 className="sr-only" id="studio-title">
        Studio
      </h1>
      {/* The source element is never shown; the canvas is the preview. */}
      <video
        aria-hidden="true"
        className="hidden"
        muted
        playsInline
        preload="auto"
        ref={videoRef}
        src={recordingSrc(selected.videoPath)}
        onLoadedMetadata={() => draw(time)}
      />
      {selected.cameraPath === null ? null : (
        <video
          aria-hidden="true"
          className="hidden"
          muted
          playsInline
          preload="auto"
          ref={cameraRef}
          src={recordingSrc(selected.cameraPath)}
        />
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] gap-3">
        <main aria-label="Studio preview" className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-stone-300/80 bg-[#dfe0da] dark:border-white/10 dark:bg-[#191b19]">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-black/8 px-2.5 py-2 dark:border-white/8">
            <button
              aria-label={playing ? "Pause the preview" : "Play the preview"}
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-400/70 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-stone-900 outline-none transition hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:border-white/25 dark:bg-white/12 dark:text-stone-50"
              type="button"
              onClick={togglePlay}
            >
              {playing ? <Pause aria-hidden="true" size={13} /> : <Play aria-hidden="true" size={13} />}
              {playing ? "Pause" : "Play"}
            </button>

            <select
              aria-label="Recording to edit"
              className="h-7 max-w-[220px] rounded-md border border-stone-400/70 bg-white px-1.5 text-[12px] font-semibold text-stone-800 outline-none dark:border-white/25 dark:bg-white/12 dark:text-stone-50"
              value={selected.id}
              onChange={(event) => setSelected(library.find((item) => item.id === event.currentTarget.value) ?? null)}
            >
              {library.map((item) => (
                <option key={item.id} value={item.id}>
                  {`${formatDuration(item.durationSeconds)} · ${String(item.width)}×${String(item.height)}`}
                </option>
              ))}
            </select>

            <p aria-live="polite" className="min-w-0 flex-1 truncate text-[12px] text-stone-500 dark:text-stone-400">
              {exporting ? `Rendering ${String(Math.round(progress * 100))}%` : (status ?? `${formatDuration(trimmedDuration(scene.trim))} after trim`)}
            </p>

            {encodeReady === false ? (
              <span className="text-[12px] text-amber-700 dark:text-amber-200">Video export unavailable in this build</span>
            ) : null}
            <button
              aria-label="Export as GIF"
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-400/70 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-stone-900 outline-none transition hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:opacity-50 dark:border-white/25 dark:bg-white/12 dark:text-stone-50"
              disabled={exporting}
              type="button"
              onClick={() => void runExport("gif")}
            >
              GIF
            </button>
            <button
              aria-label="Export as MP4"
              className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-[12px] font-semibold text-white outline-none transition hover:bg-stone-700 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
              disabled={exporting || encodeReady === false}
              type="button"
              onClick={() => void runExport("mp4")}
            >
              <Download aria-hidden="true" size={13} />
              {exporting ? "Rendering…" : "Export"}
            </button>
          </div>

          <div className="grid min-h-0 flex-1 place-items-center overflow-hidden p-3" ref={areaRef}>
            <canvas
              aria-label="Composed preview"
              className="max-h-full max-w-full rounded-md shadow-lg"
              ref={canvasRef}
              role="img"
              style={{
                cursor: cameraDragRef.current !== null
                  ? "grabbing"
                  : cameraHover && hasCameraTrack && scene.camera.show
                    ? "grab"
                    : undefined,
              }}
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
            />
          </div>

          <div className="shrink-0 border-t border-black/8 px-2.5 py-2 dark:border-white/8">
            <Timeline
              clickTimes={clickTimes}
              duration={duration}
              keyframes={keyframes}
              time={time}
              trim={scene.trim}
              onSeek={seek}
              onTrimChange={(trim) => patch({ trim })}
            />
          </div>
        </main>

        <aside aria-label="Studio panel" className="flex min-h-0 flex-col rounded-lg border border-stone-300/80 bg-white/55 dark:border-white/10 dark:bg-white/[0.025]">
          <div className="grid shrink-0 grid-cols-3 border-b border-stone-200 px-1 pt-1 dark:border-white/8" role="tablist">
            {panelTabs.map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  aria-label={`Show ${entry.label} controls`}
                  aria-selected={tab === entry.id}
                  className="relative flex flex-col items-center gap-1 rounded-t-md px-1 py-2 text-[12px] font-semibold text-stone-400 outline-none transition hover:text-stone-700 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-selected:text-stone-900 dark:hover:text-stone-200 dark:aria-selected:text-white"
                  key={entry.id}
                  role="tab"
                  type="button"
                  onClick={() => setTab(entry.id)}
                >
                  <Icon aria-hidden="true" size={15} />
                  {entry.label}
                  {tab === entry.id ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--snaphub-accent)]" /> : null}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2.5" role="tabpanel">
            {tab === "stage" ? <StagePanel scene={scene} onApplyLook={applyLook} onPatch={patch} /> : null}
            {tab === "motion" ? (
              <MotionPanel
                clickCount={clickTimes.length}
                hasCameraTrack={hasCameraTrack}
                hasCursorTrack={track !== null}
                scene={scene}
                onPatchCamera={(next: Partial<CameraLayout>) => patch({ camera: { ...scene.camera, ...next } })}
                onPatchCursor={(next: Partial<CursorStyle>) => patch({ cursor: { ...scene.cursor, ...next } })}
                onPatchZoom={(next: Partial<ZoomSettings>) => patch({ zoom: { ...scene.zoom, ...next } })}
              />
            ) : null}
            {tab === "audio" ? (
              <AudioPanel
                hasMicrophone={selected.microphonePath !== null}
                hasSystem={selected.systemAudioPath !== null}
                mix={scene.audio}
                onPatch={(next: Partial<AudioMix>) => patch({ audio: { ...scene.audio, ...next } })}
              />
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
