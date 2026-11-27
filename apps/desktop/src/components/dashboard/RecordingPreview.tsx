import { formatDuration, type RecordingArtifacts } from "../../domain/recording";
import { recordingSrc } from "../../lib/recordingTauri";
import { Play } from "../icons";

/**
 * A recording's first frame as a button that opens it in the default video player.
 *
 * The card never plays the video itself: the webview's own player and its
 * full-screen mode fight the frameless dashboard window, and a desktop player
 * gives seeking, speed and full screen for free. Like screenshot cards, the
 * whole thumbnail is the open action.
 */
export function RecordingPreview({
  item,
  onOpen,
}: {
  item: RecordingArtifacts;
  onOpen: (item: RecordingArtifacts) => void;
}): React.JSX.Element {
  return (
    <button
      aria-label={`Play recording ${formatDuration(item.durationSeconds)} in your video player`}
      className="group relative block aspect-[16/10] w-full cursor-pointer overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50"
      title="Open in your video player"
      type="button"
      onClick={() => onOpen(item)}
    >
      <video
        aria-hidden="true"
        className="pointer-events-none h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.015] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        muted
        preload="metadata"
        // The fragment makes the webview decode and show the first frame as the poster.
        src={`${recordingSrc(item.videoPath)}#t=0.001`}
        tabIndex={-1}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 grid place-items-center bg-black/0 transition-colors duration-150 group-hover:bg-black/25 motion-reduce:transition-none"
      >
        <span className="grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-transform duration-150 ease-out group-hover:scale-105 group-active:scale-95 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
          <Play className="translate-x-px" size={16} />
        </span>
      </span>
    </button>
  );
}
