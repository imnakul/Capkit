import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Point } from "../domain/capture";

export const notePopoverWidth = 280;
const popoverHeight = 156;
const pinGap = 16;
const maxCommentLength = 2000;

type NotePopoverProps = {
  number: number;
  /** The pin, in selection-local pixels. */
  anchor: Point;
  /** The selection size; the popover flips to stay inside it. */
  container: { width: number; height: number };
  comment: string;
  /** One line under the textarea, e.g. "Reading element…". */
  summary: string;
  onChange: (comment: string) => void;
  /** Enter or a click outside: keep the comment, even if empty. */
  onClose: () => void;
  /** Esc on an empty comment: the new note is removed. */
  onDiscard: () => void;
};

/** Places the popover beside the pin, flipping when it would leave the selection. */
export function popoverPosition(
  anchor: Point,
  container: { width: number; height: number },
): { left: number; top: number } {
  const fitsRight = anchor.x + pinGap + notePopoverWidth <= container.width;
  const fitsBelow = anchor.y + pinGap + popoverHeight <= container.height;
  const left = fitsRight ? anchor.x + pinGap : anchor.x - pinGap - notePopoverWidth;
  const top = fitsBelow ? anchor.y + pinGap : anchor.y - pinGap - popoverHeight;
  return {
    left: Math.max(0, Math.min(left, container.width - notePopoverWidth)),
    top: Math.max(0, Math.min(top, container.height - popoverHeight)),
  };
}

export function NotePopover({
  number,
  anchor,
  container,
  comment,
  summary,
  onChange,
  onClose,
  onDiscard,
}: NotePopoverProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [entered, setEntered] = useState(false);
  const position = popoverPosition(anchor, container);

  useLayoutEffect(() => {
    textareaRef.current?.focus();
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return (): void => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function onPointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && rootRef.current?.contains(event.target) === true) return;
      onClose();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return (): void => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onClose]);

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (comment.trim() === "") onDiscard();
      else onClose();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <div
      aria-label={`Note ${String(number)}`}
      className={`absolute z-30 rounded-xl border border-white/12 bg-[#20211f] p-2.5 text-white shadow-[0_18px_44px_rgba(0,0,0,0.5)] transition-[opacity,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${entered ? "scale-100 opacity-100" : "scale-[0.97] opacity-0"}`}
      data-capture-interactive="true"
      ref={rootRef}
      role="dialog"
      style={{
        left: position.left,
        top: position.top,
        width: notePopoverWidth,
        transformOrigin: `${String(anchor.x - position.left)}px ${String(anchor.y - position.top)}px`,
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <label className="sr-only" htmlFor={`note-comment-${String(number)}`}>
        Comment for this spot
      </label>
      <textarea
        className="block w-full resize-none rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-[13px] leading-5 text-white outline-none placeholder:text-stone-500 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)]"
        id={`note-comment-${String(number)}`}
        maxLength={maxCommentLength}
        placeholder="Comment for this spot"
        ref={textareaRef}
        rows={3}
        value={comment}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      <p aria-live="polite" className="mt-1.5 truncate px-0.5 text-[11px] leading-4 text-stone-400">
        {summary}
      </p>
    </div>
  );
}
