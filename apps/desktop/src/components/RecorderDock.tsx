import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  countdownSeconds,
  defaultRecorderSettings,
  formatBytes,
  formatDuration,
  frameRates,
  readRecorderSettings,
  recorderSettingsStorageKey,
  recordingLibrarySchema,
  recordingLibraryStorageKey,
  type AudioDevice,
  type CaptureMode,
  type CountdownSeconds,
  type FrameRate,
  type RecorderSettings,
  type RecordingSource,
  type RecordingStats,
  type RecordRegionSelection,
} from "../domain/recording";
import {
  cancelRecording,
  closeCamera,
  closeRecorder,
  finishCameraTrack,
  hideRecordingBorder,
  listenForAudioFailure,
  listenForRecordRegion,
  openCamera,
  openRecordRegion,
  fitRecorder,
  listAudioDevices,
  listRecordingSources,
  recorderReady,
  recordingSrc,
  recordingStatus,
  setRecordingPaused,
  showRecordingBorder,
  startRecording,
  stopRecording,
} from "../lib/recordingTauri";
import { describeInvokeError } from "../lib/tauri";
import { Cancel, ChevronDown, Computer, Crop, Delete, Mic, Pause, Play, Record, Speaker, Stop, Video } from "./icons";

type Phase = "setup" | "counting" | "recording" | "saving";

const modes: readonly { id: CaptureMode; label: string; icon: typeof Computer }[] = [
  { id: "display", label: "Screen", icon: Computer },
  { id: "window", label: "Window", icon: Crop },
  { id: "region", label: "Region", icon: Crop },
];

const controlClass =
  "inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-white/6 px-2.5 py-1.5 text-[12px] font-semibold text-stone-200 outline-none transition hover:border-white/25 hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:border-white aria-pressed:bg-white aria-pressed:text-stone-900";

const selectClass =
  "h-7 rounded-md border border-white/12 bg-[#22231f] px-1.5 text-[12px] font-semibold text-stone-200 outline-none focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)]";

/**
 * The recorder's floating dock.
 *
 * One window carries both phases so the chosen source and devices never have to
 * cross a window boundary. The window itself is excluded from screen capture,
 * which is why the dock can sit over the very screen it is recording.
 */
export function RecorderDock(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>("setup");
  const [settings, setSettings] = useState<RecorderSettings>(defaultRecorderSettings);
  const [sources, setSources] = useState<readonly RecordingSource[]>([]);
  const [audioDevices, setAudioDevices] = useState<readonly AudioDevice[]>([]);
  const [stats, setStats] = useState<RecordingStats | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [excluded, setExcluded] = useState(true);
  const [paused, setPaused] = useState(false);
  const [camera, setCamera] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [region, setRegion] = useState<RecordRegionSelection | null>(null);
  const [drawingRegion, setDrawingRegion] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const dockSizeRef = useRef<HTMLDivElement | null>(null);
  const sourceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pendingDisplayRef = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("on-screen-surface");
    return (): void => document.documentElement.classList.remove("on-screen-surface");
  }, []);

  useEffect(() => {
    setSettings(readRecorderSettings(window.localStorage.getItem(recorderSettingsStorageKey)));
  }, []);

  // Measures the dock and fits the window to it. Skips zero sizes, which only
  // happen where there is no layout (jsdom).
  const fitDock = useCallback(async (): Promise<void> => {
    const node = dockSizeRef.current;
    if (node === null) return;
    const rect = node.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    if (width <= 0 || height <= 0) return;
    await fitRecorder(width, height);
  }, []);

  // Reveal ordering: the window is built hidden, the first fit runs, then the
  // rAF fires and only then is the window revealed. A rejected fit still
  // reveals, because a visible dock at the wrong size beats an invisible one.
  useEffect(() => {
    // The flag lives on an object because TypeScript narrows a plain `let` to
    // its initial value inside the async closure below.
    const lifetime = { active: true };
    let frame: number | null = null;
    void (async (): Promise<void> => {
      try {
        await fitDock();
      } catch (cause: unknown) {
        if (lifetime.active) {
          setError(describeInvokeError(cause, "The recorder could not be resized."));
        }
      }
      if (!lifetime.active) return;
      frame = window.requestAnimationFrame(() => {
        void recorderReady().catch((cause: unknown) => {
          setError(describeInvokeError(cause, "The recorder could not be shown"));
        });
      });
    })();
    return (): void => {
      lifetime.active = false;
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [fitDock]);

  // Later fits (picker open or close, phase change, error line appearing) run
  // without waiting for anything. Each sets absolute geometry, so the last
  // call wins and no ordering guard is needed.
  useLayoutEffect(() => {
    const node = dockSizeRef.current;
    if (node === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      void fitDock().catch(() => undefined);
    });
    observer.observe(node);
    return (): void => observer.disconnect();
  }, [fitDock]);

  useEffect(() => {
    const unlisten = (): void => undefined;
    void (async (): Promise<void> => {
      const available = await listRecordingSources().catch(() => []);
      setSources(available);
      setSettings((current) => {
        if (current.sourceId !== "" && available.some((item) => item.id === current.sourceId)) return current;
        const primary = available.find((item) => item.kind === "display" && item.isPrimary) ?? available.at(0);
        return primary === undefined ? current : { ...current, sourceId: primary.id };
      });
    })();
    return unlisten;
  }, []);

  const patch = useCallback((next: Partial<RecorderSettings>): void => {
    setSettings((current) => {
      const merged = { ...current, ...next };
      window.localStorage.setItem(recorderSettingsStorageKey, JSON.stringify(merged));
      return merged;
    });
  }, []);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Devices refresh on mount and whenever the dock regains focus, so a device
  // plugged in while the dock is open appears without reopening it.
  const refreshDevices = useCallback(async (): Promise<void> => {
    const devices = await listAudioDevices().catch(() => []);
    setAudioDevices(devices);
    const current = settingsRef.current;
    if (
      current.microphoneDeviceId !== "" &&
      !devices.some((device) => device.kind === "microphone" && device.id === current.microphoneDeviceId)
    ) {
      patch({ microphoneDeviceId: "" });
      setNotice("Your chosen microphone is not connected, so the default will be used.");
    }
    if (
      current.systemAudioDeviceId !== "" &&
      !devices.some((device) => device.kind === "system" && device.id === current.systemAudioDeviceId)
    ) {
      patch({ systemAudioDeviceId: "" });
      setNotice("Your chosen speaker is not connected, so the default will be used.");
    }
  }, [patch]);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    function onFocus(): void {
      void refreshDevices();
    }
    window.addEventListener("focus", onFocus);
    return (): void => window.removeEventListener("focus", onFocus);
  }, [refreshDevices]);

  const handleAudioFailure = useCallback((kind: string): void => {
    setNotice(
      kind === "microphone"
        ? "The microphone could not be recorded. The video is still recording."
        : "System audio could not be recorded. The video is still recording.",
    );
  }, []);

  // The backend emits this at recording start when a requested track cannot be
  // opened. No isTauri guard: the dock only renders inside the Tauri recorder
  // window, and the subscription must stay testable through the mocked module.
  useEffect(() => {
    let stop: (() => void) | undefined;
    void listenForAudioFailure(handleAudioFailure)
      .then((stopListening) => {
        stop = stopListening;
      })
      .catch(() => undefined);
    return (): void => {
      stop?.();
    };
  }, [handleAudioFailure]);

  const microphones = audioDevices.filter((device) => device.kind === "microphone");
  const speakers = audioDevices.filter((device) => device.kind === "system");

  const visibleSources = sources.filter((source) =>
    settings.mode === "window" ? source.kind === "window" : source.kind === "display",
  );
  // Constrained to visibleSources, not the full list: a stored sourceId from
  // a different mode (e.g. a window id while "Screen" is selected) must not
  // silently stay active once its mode is no longer the one shown.
  const active =
    visibleSources.find((source) => source.id === settings.sourceId) ?? visibleSources.at(0) ?? null;

  // Closes the source picker on a pointer down outside the dock card. The
  // picker lives inside the card now, so the card is the boundary.
  useEffect(() => {
    if (!sourcePickerOpen) return;
    function onPointerDown(event: PointerEvent): void {
      if (pickerRef.current?.contains(event.target as Node) === false) setSourcePickerOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return (): void => document.removeEventListener("pointerdown", onPointerDown);
  }, [sourcePickerOpen]);

  const closePickerFocusTrigger = useCallback((): void => {
    setSourcePickerOpen(false);
    sourceTriggerRef.current?.focus();
  }, []);

  // Region overlay results. A selection for a display that is no longer
  // current is ignored, but drawing always ends. No isTauri guard: the dock
  // only renders inside the Tauri recorder window, and the subscription must
  // stay testable through the mocked recordingTauri module.
  useEffect(() => {
    let stop: (() => void) | undefined;
    void listenForRecordRegion(
      (selection) => {
        if (selection.displayId !== pendingDisplayRef.current) {
          setDrawingRegion(false);
          return;
        }
        setRegion(selection);
        setDrawingRegion(false);
      },
      () => setDrawingRegion(false),
    )
      .then((stopListening) => {
        stop = stopListening;
      })
      .catch(() => undefined);
    return (): void => {
      stop?.();
    };
  }, []);

  // Choosing a different display clears the drawn area; switching mode away
  // and back keeps it.
  const regionDisplayId = region?.displayId ?? null;
  const activeDisplayId = active?.displayId ?? null;
  useEffect(() => {
    if (settings.mode !== "region" || regionDisplayId === null) return;
    if (activeDisplayId !== regionDisplayId) setRegion(null);
  }, [settings.mode, regionDisplayId, activeDisplayId]);

  const drawArea = useCallback((): void => {
    if (active === null || drawingRegion) return;
    pendingDisplayRef.current = active.displayId;
    setDrawingRegion(true);
    void openRecordRegion(active.displayId).catch((cause: unknown) => {
      setDrawingRegion(false);
      setError(describeInvokeError(cause, "The area picker could not be opened"));
    });
  }, [active, drawingRegion]);

  const begin = useCallback(async (): Promise<void> => {
    const target =
      settings.mode === "region" && region !== null
        ? (sources.find(
            (source) => source.kind === "display" && source.displayId === region.displayId,
          ) ?? active)
        : active;
    if (target === null) {
      setError("Choose something to record first");
      return;
    }
    setSourcePickerOpen(false);
    setError(null);
    try {
      // A window records as the crop of its display it currently occupies, so
      // the region is derived rather than asked for again. A drawn area is
      // used directly; `toRecordingRequest` keeps the window behaviour.
      await startRecording(
        settings,
        target,
        settings.mode === "region" && region !== null ? region.bounds : null,
      );
      setPhase("recording");
    } catch (cause: unknown) {
      setPhase("setup");
      setError(describeInvokeError(cause, "That recording could not be started"));
      void hideRecordingBorder();
    }
  }, [active, region, settings, sources]);

  function requestStart(): void {
    const target =
      settings.mode === "region" && region !== null
        ? (sources.find(
            (source) => source.kind === "display" && source.displayId === region.displayId,
          ) ?? active)
        : active;
    if (target === null) {
      setError("Choose something to record first");
      return;
    }
    setSourcePickerOpen(false);
    // Shown for the whole countdown, not just once recording starts, so the
    // target is visible before a single frame is captured.
    const bounds =
      settings.mode === "region" && region !== null ? region.bounds : target.bounds;
    void showRecordingBorder(bounds).catch(() => undefined);
    if (settings.countdown <= 0) {
      void begin();
      return;
    }
    setCountdown(settings.countdown);
    setPhase("counting");
  }

  useEffect(() => {
    if (phase !== "counting") return;
    if (countdown <= 0) {
      void begin();
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return (): void => window.clearTimeout(timer);
  }, [phase, countdown, begin]);

  // Counters refresh once a second; the backend never emits per frame.
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(() => {
      void recordingStatus()
        .then((next) => setStats(next))
        .catch(() => undefined);
    }, 1000);
    return (): void => window.clearInterval(timer);
  }, [phase]);

  async function finish(): Promise<void> {
    setPhase("saving");
    await hideRecordingBorder();
    try {
      if (camera) {
        await finishCameraTrack();
      }
      const artifacts = await stopRecording();
      const raw = window.localStorage.getItem(recordingLibraryStorageKey);
      const parsed = raw === null ? null : recordingLibrarySchema.safeParse(JSON.parse(raw) as unknown);
      const existing = parsed?.success === true ? parsed.data : [];
      window.localStorage.setItem(
        recordingLibraryStorageKey,
        JSON.stringify([artifacts, ...existing].slice(0, 50)),
      );
      await closeRecorder();
    } catch (cause: unknown) {
      setPhase("recording");
      setError(describeInvokeError(cause, "That recording could not be saved"));
    }
  }

  async function discard(): Promise<void> {
    await hideRecordingBorder();
    await cancelRecording().catch(() => undefined);
    await closeRecorder().catch(() => undefined);
  }

  function handleCardKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape" && sourcePickerOpen) {
      event.preventDefault();
      closePickerFocusTrigger();
    }
  }

  if (phase === "counting") {
    return (
      <div className="w-[724px] bg-transparent p-3" ref={dockSizeRef}>
        <div className="flex justify-center">
          <div
            aria-live="assertive"
            className="grid size-28 place-items-center rounded-full border border-white/12 bg-[#171815]/95 text-[44px] font-semibold text-white shadow-[0_22px_72px_rgba(0,0,0,0.5)]"
            role="status"
          >
            {countdown}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[724px] bg-transparent p-3" ref={dockSizeRef}>
      <div
        aria-label="Recorder"
        className="mx-auto flex w-full max-w-[700px] flex-col gap-2 rounded-2xl border border-white/12 bg-[#171815]/98 p-2.5 shadow-[0_22px_72px_rgba(0,0,0,0.48)]"
        ref={pickerRef}
        role="toolbar"
        onKeyDown={handleCardKeyDown}
      >
        {sourcePickerOpen ? (
          <div
            aria-label="Available sources"
            className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto"
            role="listbox"
          >
            {visibleSources.length === 0 ? (
              <p className="col-span-3 px-2 py-3 text-center text-[12px] text-stone-400">Nothing available to record</p>
            ) : (
              visibleSources.map((source) => (
                <button
                  aria-label={`Record ${source.title}`}
                  aria-selected={source.id === active?.id}
                  className="flex flex-col gap-1 rounded-md border border-transparent p-1 text-left outline-none transition hover:border-white/15 hover:bg-white/6 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-selected:border-[var(--snaphub-accent)] aria-selected:bg-white/8"
                  key={source.id}
                  role="option"
                  type="button"
                  onClick={() => {
                    patch({ sourceId: source.id });
                    setSourcePickerOpen(false);
                  }}
                >
                  <SourceThumbnail className="aspect-video w-full rounded bg-black/40" source={source} iconSize={18} />
                  <span className="truncate text-[11px] font-medium text-stone-200">{source.title}</span>
                </button>
              ))
            )}
          </div>
        ) : null}
        {phase === "recording" || phase === "saving" ? (
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className={`size-2.5 shrink-0 rounded-full ${paused ? "bg-amber-300" : "animate-pulse bg-[#ff5b4d]"}`}
            />
            <span className="font-mono text-[15px] font-semibold text-white" aria-live="off">
              {formatDuration(stats?.elapsedSeconds ?? 0)}
            </span>
            <span className="text-[12px] text-stone-400">
              {paused
                ? "Paused — nothing is being recorded"
                : stats === null
                  ? "Starting…"
                  : `${String(stats.encodedFrames)} frames · ${formatBytes(stats.bytesWritten)}`}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                aria-label={paused ? "Resume recording" : "Pause recording"}
                className={controlClass}
                disabled={phase === "saving"}
                type="button"
                onClick={() => {
                  void setRecordingPaused(!paused)
                    .then(setPaused)
                    .catch(() => undefined);
                }}
              >
                {paused ? <Play aria-hidden="true" size={14} /> : <Pause aria-hidden="true" size={14} />}
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                aria-label="Discard this recording"
                className={controlClass}
                disabled={phase === "saving"}
                type="button"
                onClick={() => void discard()}
              >
                <Delete aria-hidden="true" size={14} />
                Discard
              </button>
              <button
                aria-label="Stop and save this recording"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#ff5b4d] px-3 py-1.5 text-[12px] font-bold text-white outline-none transition hover:bg-[#ff7468] focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
                disabled={phase === "saving"}
                type="button"
                onClick={() => void finish()}
              >
                <Stop aria-hidden="true" size={14} />
                {phase === "saving" ? "Saving…" : "Stop"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <div aria-label="What to record" className="flex items-center gap-1" role="group">
                {modes.map((mode) => {
                  const Icon = mode.icon;
                  return (
                    <button
                      aria-label={`Record a ${mode.label.toLowerCase()}`}
                      aria-pressed={settings.mode === mode.id}
                      className={controlClass}
                      key={mode.id}
                      type="button"
                      onClick={() => patch({ mode: mode.id })}
                    >
                      <Icon aria-hidden="true" size={14} />
                      {mode.label}
                    </button>
                  );
                })}
              </div>

              <div>
                <button
                  aria-expanded={sourcePickerOpen}
                  aria-haspopup="listbox"
                  aria-label="Choose what to record"
                  className={`${controlClass} max-w-[220px]`}
                  ref={sourceTriggerRef}
                  type="button"
                  onClick={() => setSourcePickerOpen((value) => !value)}
                >
                  {active === null ? (
                    <span className="text-stone-400">Nothing available</span>
                  ) : (
                    <>
                      <SourceThumbnail className="size-5 shrink-0 rounded" source={active} />
                      <span className="min-w-0 flex-1 truncate text-left">{active.title}</span>
                    </>
                  )}
                  <ChevronDown aria-hidden="true" className={sourcePickerOpen ? "rotate-180" : ""} size={12} />
                </button>
              </div>

              {settings.mode === "region" ? (
                region === null ? (
                  <button
                    aria-label="Draw area to record"
                    className={controlClass}
                    disabled={active === null || drawingRegion}
                    type="button"
                    onClick={drawArea}
                  >
                    <Crop aria-hidden="true" size={14} />
                    {drawingRegion ? "Drawing…" : "Draw area"}
                  </button>
                ) : (
                  <button
                    aria-label="Redraw area to record"
                    className={controlClass}
                    disabled={drawingRegion}
                    type="button"
                    onClick={drawArea}
                  >
                    <Crop aria-hidden="true" size={14} />
                    {`${String(Math.round(region.bounds.width))} × ${String(Math.round(region.bounds.height))} · Redraw`}
                  </button>
                )
              ) : null}

              <div className="ml-auto flex items-center gap-1.5">
                <button
                  aria-label="Close the recorder"
                  className={controlClass}
                  type="button"
                  onClick={() => void closeRecorder()}
                >
                  <Cancel aria-hidden="true" size={14} />
                </button>
                <button
                  aria-label="Start recording"
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--snaphub-accent)] px-3.5 py-1.5 text-[12px] font-bold text-[#171815] outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
                  disabled={active === null || (settings.mode === "region" && region === null)}
                  type="button"
                  onClick={requestStart}
                >
                  <Record aria-hidden="true" size={14} />
                  Record
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-t border-white/8 pt-2">
              <button
                aria-label="Record system audio"
                aria-pressed={settings.systemAudio}
                className={controlClass}
                type="button"
                onClick={() => patch({ systemAudio: !settings.systemAudio })}
              >
                <Speaker aria-hidden="true" size={14} />
                System
              </button>
              <DeviceSelect
                devices={speakers}
                disabled={!settings.systemAudio}
                emptyLabel="No speakers found"
                label="Speaker device"
                value={settings.systemAudioDeviceId}
                onChange={(systemAudioDeviceId) => patch({ systemAudioDeviceId })}
              />
              <button
                aria-label="Record the microphone"
                aria-pressed={settings.microphone}
                className={controlClass}
                type="button"
                onClick={() => patch({ microphone: !settings.microphone })}
              >
                <Mic aria-hidden="true" size={14} />
                Mic
              </button>
              <DeviceSelect
                devices={microphones}
                disabled={!settings.microphone}
                emptyLabel="No microphones found"
                label="Microphone device"
                value={settings.microphoneDeviceId}
                onChange={(microphoneDeviceId) => patch({ microphoneDeviceId })}
              />
              <button
                aria-label="Show the camera"
                aria-pressed={camera}
                className={controlClass}
                type="button"
                onClick={() => {
                  const next = !camera;
                  setCamera(next);
                  void (next ? openCamera() : closeCamera()).catch(() => setCamera(!next));
                }}
              >
                <Video aria-hidden="true" size={14} />
                Camera
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-t border-white/8 pt-2">
              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-stone-400">
                Quality
                <select
                  aria-label="Frame rate"
                  className={selectClass}
                  value={String(settings.fps)}
                  onChange={(event) => patch({ fps: Number(event.currentTarget.value) as FrameRate })}
                >
                  {frameRates.map((rate) => (
                    <option key={rate} value={String(rate)}>{`${String(rate)} fps`}</option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-stone-400">
                Countdown
                <select
                  aria-label="Countdown before recording"
                  className={selectClass}
                  value={String(settings.countdown)}
                  onChange={(event) =>
                    patch({ countdown: Number(event.currentTarget.value) as CountdownSeconds })
                  }
                >
                  {countdownSeconds.map((value) => (
                    <option key={value} value={String(value)}>
                      {value === 0 ? "None" : `${String(value)}s`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}

        {error === null ? null : (
          <p className="rounded-md border border-amber-200/20 bg-amber-200/8 px-2.5 py-1.5 text-[12px] text-amber-100" role="status">
            {error}
          </p>
        )}
        {notice === null ? null : (
          <p className="rounded-md border border-amber-200/20 bg-amber-200/8 px-2.5 py-1.5 text-[12px] text-amber-100" role="status">
            {notice}
          </p>
        )}
        {excluded ? null : (
          <p className="rounded-md border border-amber-200/20 bg-amber-200/8 px-2.5 py-1.5 text-[12px] text-amber-100" role="status">
            This dock could not be hidden from the recording, so it will appear in the video.
          </p>
        )}
        <ExclusionWatcher onFailed={() => setExcluded(false)} />
      </div>
    </div>
  );
}

/**
 * An audio device choice. The first option always follows the OS default; a
 * missing device list leaves a single disabled option and the toggle usable.
 */
function DeviceSelect({
  devices,
  disabled,
  emptyLabel,
  label,
  value,
  onChange,
}: {
  devices: readonly AudioDevice[];
  disabled: boolean;
  emptyLabel: string;
  label: string;
  value: string;
  onChange: (id: string) => void;
}): React.JSX.Element {
  const fallback = devices.find((device) => device.isDefault) ?? null;
  if (devices.length === 0) {
    return (
      <select aria-label={label} className={`${selectClass} max-w-[180px] truncate`} disabled value="">
        <option value="">{emptyLabel}</option>
      </select>
    );
  }
  return (
    <select
      aria-label={label}
      className={`${selectClass} max-w-[180px] truncate`}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    >
      <option value="">{fallback === null ? "Default" : `Default (${fallback.name})`}</option>
      {devices.map((device) => (
        <option key={device.id} value={device.id}>
          {device.name}
        </option>
      ))}
    </select>
  );
}

/**
 * A source's preview, or a neutral placeholder when capturing one failed
 * (a protected window, for instance) — the source stays choosable either way.
 */
function SourceThumbnail({
  source,
  className,
  iconSize = 12,
}: {
  source: RecordingSource;
  className: string;
  iconSize?: number;
}): React.JSX.Element {
  if (source.thumbnailPath === null) {
    const Icon = source.kind === "window" ? Crop : Computer;
    return (
      <span className={`grid shrink-0 place-items-center bg-white/8 ${className}`}>
        <Icon aria-hidden="true" className="text-stone-500" size={iconSize} />
      </span>
    );
  }
  return <img alt="" className={`shrink-0 object-cover ${className}`} src={recordingSrc(source.thumbnailPath)} />;
}

/**
 * Listens for the backend reporting that the dock could not be hidden.
 *
 * Silently recording your own toolbar is worse than showing a warning, so the
 * failure is surfaced rather than swallowed.
 */
function ExclusionWatcher({ onFailed }: { onFailed: () => void }): null {
  useEffect(() => {
    if (!isTauri()) return;
    // The flag lives on an object because TypeScript narrows a plain `let` to
    // its initial value inside the async closure below.
    const lifetime = { active: true };
    void (async (): Promise<void> => {
      const { listen } = await import("@tauri-apps/api/event");
      const stop = await listen("snaphub://recorder-exclusion-failed", () => {
        if (lifetime.active) onFailed();
      });
      if (!lifetime.active) stop();
    })();
    return (): void => {
      lifetime.active = false;
    };
  }, [onFailed]);
  return null;
}
