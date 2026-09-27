import { useCallback, useEffect, useState } from "react";
import {
  formatBytes,
  formatDuration,
  recordingLibrarySchema,
  recordingLibraryStorageKey,
  type RecordingArtifacts,
} from "../../domain/recording";
import { openRecorder, recordingSrc, recordingSupported } from "../../lib/recordingTauri";
import { describeInvokeError } from "../../lib/tauri";
import { ChevronDown, Delete, Film, Record } from "../icons";
import { StudioView } from "./StudioView";

/** Reads the recordings the user has made but not yet discarded. */
function readLibrary(): readonly RecordingArtifacts[] {
  const raw = window.localStorage.getItem(recordingLibraryStorageKey);
  if (raw === null) return [];
  const parsed = recordingLibrarySchema.safeParse(JSON.parse(raw) as unknown);
  return parsed.success ? parsed.data : [];
}

/**
 * The Record section, which also owns editing.
 *
 * Starting a recording hands off to a separate always-on-top window, because
 * the dock has to sit over the screen being recorded while staying out of the
 * video itself. Editing stays inline here, so a recording and its editor are
 * one step apart instead of two sections.
 */
export function RecordView(): React.JSX.Element {
  const [library, setLibrary] = useState<readonly RecordingArtifacts[]>([]);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecordingArtifacts | null>(null);

  useEffect(() => {
    setLibrary(readLibrary());
    void recordingSupported()
      .then(setSupported)
      .catch(() => setSupported(false));
  }, []);

  // The dock writes into the same key when it finishes, and it lives in another
  // window, so the storage event is what tells this view a recording landed.
  useEffect(() => {
    function onStorage(event: StorageEvent): void {
      if (event.key !== null && event.key !== recordingLibraryStorageKey) return;
      setLibrary(readLibrary());
    }
    window.addEventListener("storage", onStorage);
    return (): void => window.removeEventListener("storage", onStorage);
  }, []);

  const start = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      await openRecorder();
    } catch (cause: unknown) {
      setError(describeInvokeError(cause, "The recorder could not be opened"));
    }
  }, []);

  function remove(id: string): void {
    const next = library.filter((item) => item.id !== id);
    setLibrary(next);
    window.localStorage.setItem(recordingLibraryStorageKey, JSON.stringify(next));
  }

  if (editing !== null) {
    return (
      <section aria-label="Edit recording" className="flex h-full min-h-full flex-col px-6 py-5">
        <div className="flex shrink-0 items-center gap-3 border-b border-stone-300/80 pb-3 dark:border-white/10">
          <button
            aria-label="Back to recordings"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-semibold text-stone-600 outline-none transition hover:bg-black/5 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:text-stone-300 dark:hover:bg-white/7 dark:hover:text-white"
            type="button"
            onClick={() => setEditing(null)}
          >
            <ChevronDown aria-hidden="true" className="-rotate-90" size={14} />
            Recordings
          </button>
          <p className="font-mono text-[12px] text-stone-500 dark:text-stone-400">{formatDuration(editing.durationSeconds)}</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col pt-3">
          <StudioView initialRecording={editing} />
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="record-title" className="flex min-h-full flex-col px-6 py-5">
      <header className="flex shrink-0 items-start justify-between gap-5 border-b border-stone-300/80 pb-4 dark:border-white/10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">Record</p>
          <h1 className="mt-1 text-[20px] font-semibold tracking-[-0.03em] text-stone-900 dark:text-stone-100" id="record-title">
            Capture your screen.
          </h1>
          <p className="mt-1 text-[13px] text-stone-500 dark:text-stone-400">
            The dock stays out of the video, and the cursor is recorded as its own track so Studio can smooth it later.
          </p>
        </div>
        <button
          aria-label="Start recording"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#ff5b4d] px-3.5 py-2 text-[13px] font-semibold text-white outline-none transition hover:bg-[#ff7468] focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={supported === false}
          type="button"
          onClick={() => void start()}
        >
          <Record aria-hidden="true" size={15} />
          Start recording
        </button>
      </header>

      {supported === false ? (
        <p className="mt-4 rounded-md border border-amber-300/40 bg-amber-100/40 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-200/20 dark:bg-amber-200/8 dark:text-amber-100" role="status">
          Screen recording needs Windows 10 version 2004 or newer.
        </p>
      ) : null}
      {error === null ? null : (
        <p className="mt-4 rounded-md border border-amber-300/40 bg-amber-100/40 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-200/20 dark:bg-amber-200/8 dark:text-amber-100" role="status">
          {error}
        </p>
      )}

      <div className="mt-5 min-h-0 flex-1">
        {library.length === 0 ? (
          <div className="grid h-full place-items-center rounded-lg border border-dashed border-stone-300 px-6 py-10 text-center dark:border-white/12">
            <div className="max-w-sm">
              <Film aria-hidden="true" className="mx-auto text-stone-300 dark:text-stone-600" size={28} />
              <p className="mt-3 text-[14px] font-semibold text-stone-700 dark:text-stone-200">No recordings yet</p>
              <p className="mt-1 text-[13px] leading-5 text-stone-500 dark:text-stone-400">
                Recordings stay on this device until you export them.
              </p>
            </div>
          </div>
        ) : (
          <ul aria-label="Recordings" className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {library.map((item) => (
              <li
                className="overflow-hidden rounded-lg border border-stone-300/80 bg-white/60 dark:border-white/10 dark:bg-white/5"
                key={item.id}
              >
                <video
                  aria-label={`Recording ${formatDuration(item.durationSeconds)}`}
                  className="aspect-video w-full bg-black object-contain"
                  controls
                  preload="metadata"
                  src={recordingSrc(item.videoPath)}
                />
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-stone-800 dark:text-stone-100">
                      {formatDuration(item.durationSeconds)} · {String(item.width)}×{String(item.height)}
                    </p>
                    <p className="truncate text-[12px] text-stone-500 dark:text-stone-400">
                      {String(item.fps)} fps · {formatBytes(item.stats.bytesWritten)}
                      {item.cursorPath === null ? "" : " · cursor track"}
                    </p>
                  </div>
                  <button
                    aria-label="Edit this recording"
                    className="rounded-md border border-stone-300 px-2 py-1.5 text-[12px] font-semibold text-stone-600 outline-none transition hover:border-stone-500 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:border-white/12 dark:text-stone-300 dark:hover:text-white"
                    type="button"
                    onClick={() => setEditing(item)}
                  >
                    Edit
                  </button>
                  <button
                    aria-label="Remove this recording from the list"
                    className="grid size-7 shrink-0 place-items-center rounded text-stone-400 outline-none transition hover:bg-stone-200/70 hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:hover:bg-white/10 dark:hover:text-white"
                    type="button"
                    onClick={() => remove(item.id)}
                  >
                    <Delete aria-hidden="true" size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
