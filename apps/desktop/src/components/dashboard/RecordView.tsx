import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatBytes,
  formatDuration,
  recordingLibrarySchema,
  recordingLibraryStorageKey,
  type RecordingArtifacts,
} from "../../domain/recording";
import { openRecorder, recordingSupported } from "../../lib/recordingTauri";
import { describeInvokeError } from "../../lib/tauri";
import { ChevronDown, Delete, Film, Record } from "../icons";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";
import { RecordingPreview } from "./RecordingPreview";
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

  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);

  const start = useCallback(async (): Promise<void> => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setError(null);
    try {
      await openRecorder();
    } catch (cause: unknown) {
      setError(describeInvokeError(cause, "The recorder could not be opened"));
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  }, []);

  function remove(id: string): void {
    const next = library.filter((item) => item.id !== id);
    setLibrary(next);
    window.localStorage.setItem(recordingLibraryStorageKey, JSON.stringify(next));
  }

  if (editing !== null) {
    return (
      <section aria-label="Edit recording" className="flex h-full min-h-full flex-col px-6 py-4">
        <div className="flex shrink-0 items-center gap-3 border-b border-content/10 pb-3">
          <Button aria-label="Back to recordings" variant="ghost" onClick={() => setEditing(null)}>
            <ChevronDown aria-hidden="true" className="-rotate-90" size={14} />
            Recordings
          </Button>
          <p className="text-[12px] tabular-nums text-content/60">{formatDuration(editing.durationSeconds)}</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col pt-3">
          <StudioView initialRecording={editing} />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Record" className="flex min-h-full flex-col px-6 py-4">
      <PageHeader
        title="Record"
        trailing={
          <Button aria-label="Start recording" disabled={supported === false || opening} variant="primary" onClick={() => void start()}>
            <Record aria-hidden="true" size={13} />
            Start recording
          </Button>
        }
      />

      {supported === false ? (
        <p className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] text-warning" role="status">
          Screen recording needs Windows 10 version 2004 or newer.
        </p>
      ) : null}
      {error === null ? null : (
        <p className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[13px] text-warning" role="status">
          {error}
        </p>
      )}

      <div className="mt-5 min-h-0 flex-1">
        {library.length === 0 ? (
          <div className="grid h-full place-items-center rounded-lg border border-dashed border-content/15 px-6 py-10 text-center">
            <div className="max-w-sm">
              <Film aria-hidden="true" className="mx-auto text-content/30" size={28} />
              <p className="mt-3 text-[13px] font-semibold text-content">No recordings yet</p>
              <p className="mt-1 text-[12px] leading-5 text-content/60">
                Recordings stay on this device until you export them.
              </p>
            </div>
          </div>
        ) : (
          <ul aria-label="Recordings" className="grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] gap-3">
            {library.map((item) => (
              <li
                className="overflow-hidden rounded-lg border border-content/10 bg-content/4"
                key={item.id}
              >
                <RecordingPreview item={item} />
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium tabular-nums text-content">
                      {formatDuration(item.durationSeconds)}, {String(item.width)}×{String(item.height)}
                    </p>
                    <p className="truncate text-[12px] tabular-nums text-content/60">
                      {String(item.fps)} fps, {formatBytes(item.stats.bytesWritten)}
                      {item.cursorPath === null ? "" : ", cursor track"}
                    </p>
                  </div>
                  <Button aria-label="Edit this recording" onClick={() => setEditing(item)}>
                    Edit
                  </Button>
                  <button
                    aria-label="Remove this recording from the list"
                    className="grid size-7 shrink-0 place-items-center rounded text-content/45 outline-none transition-colors duration-120 hover:bg-content/6 hover:text-content focus-visible:ring-2 focus-visible:ring-accent/50 motion-reduce:transition-none"
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
