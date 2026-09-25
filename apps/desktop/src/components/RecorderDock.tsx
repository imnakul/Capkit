import { useCallback, useEffect, useRef, useState } from "react";
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
  type CaptureMode,
  type CountdownSeconds,
  type FrameRate,
  type RecorderSettings,
  type RecordingSource,
  type RecordingStats,
} from "../domain/recording";
import {
  cancelRecording,
  closeCamera,
  closeRecorder,
  hideRecordingBorder,
  openCamera,
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
  const [microphones, setMicrophones] = useState<readonly { id: string; name: string }[]>([]);
  const [stats, setStats] = useState<RecordingStats | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState(true);
  const [paused, setPaused] = useState(false);
  const [camera, setCamera] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const readyRef = useRef(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("on-screen-surface");
    return (): void => document.documentElement.classList.remove("on-screen-surface");
  }, []);

  useEffect(() => {
    setSettings(readRecorderSettings(window.localStorage.getItem(recorderSettingsStorageKey)));
  }, []);

  // The dock is revealed only once its first styled frame exists, matching the
  // capture overlay's prepare-then-reveal lifecycle.
  useEffect(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      void recorderReady().catch((cause: unknown) => {
        setError(describeInvokeError(cause, "The recorder could not be shown"));
      });
    });
    return (): void => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const unlisten = (): void => undefined;
    void (async (): Promise<void> => {
      const [available, devices] = await Promise.all([
        listRecordingSources().catch(() => []),
        listAudioDevices().catch(() => []),
      ]);
      setSources(available);
      setMicrophones(devices.filter((device) => device.kind === "microphone"));
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

  const visibleSources = sources.filter((source) =>
    settings.mode === "window" ? source.kind === "window" : source.kind === "display",
  );
  // Constrained to visibleSources, not the full list: a stored sourceId from
  // a different mode (e.g. a window id while "Screen" is selected) must not
  // silently stay active once its mode is no longer the one shown.
  const active =
    visibleSources.find((source) => source.id === settings.sourceId) ?? visibleSources.at(0) ?? null;

  // Closes the source picker on an outside click, since it floats over a
  // window with almost no other chrome to click instead.
  useEffect(() => {
    if (!sourcePickerOpen) return;
    function onPointerDown(event: PointerEvent): void {
      if (pickerRef.current?.contains(event.target as Node) === false) setSourcePickerOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return (): void => document.removeEventListener("pointerdown", onPointerDown);
  }, [sourcePickerOpen]);

  const begin = useCallback(async (): Promise<void> => {
    if (active === null) {
      setError("Choose something to record first");
      return;
    }
    setError(null);
    try {
      // A window records as the crop of its display it currently occupies, so
      // the region is derived rather than asked for again.
      await startRecording(settings, active, settings.mode === "region" ? active.bounds : null);
      setPhase("recording");
    } catch (cause: unknown) {
      setPhase("setup");
      setError(describeInvokeError(cause, "That recording could not be started"));
      void hideRecordingBorder();
    }
  }, [active, settings]);

  function requestStart(): void {
    if (active === null) {
      setError("Choose something to record first");
      return;
    }
    // Shown for the whole countdown, not just once recording starts, so the
    // target is visible before a single frame is captured.
    void showRecordingBorder(active.bounds).catch(() => undefined);
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

  if (phase === "counting") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-transparent">
        <div
          aria-live="assertive"
          className="grid size-28 place-items-center rounded-full border border-white/12 bg-[#171815]/95 text-[44px] font-semibold text-white shadow-[0_22px_72px_rgba(0,0,0,0.5)]"
          role="status"
        >
          {countdown}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-end justify-center bg-transparent p-3">
      <div
        aria-label="Recorder"
        className="flex w-full max-w-[700px] flex-col gap-2 rounded-2xl border border-white/12 bg-[#171815]/98 p-2.5 shadow-[0_22px_72px_rgba(0,0,0,0.48)]"
        role="toolbar"
      >
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

              <div className="relative" ref={pickerRef}>
                <button
                  aria-expanded={sourcePickerOpen}
                  aria-haspopup="listbox"
                  aria-label="Choose what to record"
                  className={`${controlClass} max-w-[220px]`}
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

                {sourcePickerOpen ? (
                  <div
                    aria-label="Available sources"
                    className="absolute left-0 top-full z-10 mt-1.5 grid max-h-64 w-72 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-white/12 bg-[#171815]/98 p-1.5 shadow-[0_22px_72px_rgba(0,0,0,0.5)]"
                    role="listbox"
                  >
                    {visibleSources.length === 0 ? (
                      <p className="col-span-2 px-2 py-3 text-center text-[12px] text-stone-400">Nothing available to record</p>
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
              </div>

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
                  disabled={active === null}
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
              {settings.microphone && microphones.length > 0 ? (
                <select
                  aria-label="Microphone device"
                  className={`${selectClass} max-w-[180px]`}
                  value={settings.microphoneDeviceId}
                  onChange={(event) => patch({ microphoneDeviceId: event.currentTarget.value })}
                >
                  <option value="">Default microphone</option>
                  {microphones.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name}
                    </option>
                  ))}
                </select>
              ) : null}

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
