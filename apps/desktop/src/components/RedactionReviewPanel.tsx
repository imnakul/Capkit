import { useEffect, useRef } from "react";
import {
  SENSITIVE_KIND_LABELS,
  type RedactionSuggestion,
} from "../lib/redactionPatterns";
import { Refresh } from "./icons";

export type RedactionReview =
  | { phase: "reading" }
  | {
    phase: "ready";
    suggestions: readonly RedactionSuggestion[];
    selectedIds: ReadonlySet<string>;
  }
  | { phase: "error"; message: string };

type RedactionReviewPanelProps = {
  review: RedactionReview;
  side: "left" | "right";
  onToggle: (suggestionId: string) => void;
  onApply: () => void;
  onClose: () => void;
};

const BUTTON_BASE =
  "rounded-lg px-3 py-2 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-white active:scale-96 motion-reduce:transition-none motion-reduce:active:scale-100";

/** Lists detected sensitive text; nothing is redacted until the user applies it. */
export function RedactionReviewPanel({
  review,
  side,
  onToggle,
  onApply,
  onClose,
}: RedactionReviewPanelProps): React.JSX.Element {
  const firstControlRef = useRef<HTMLInputElement | HTMLButtonElement>(null);
  const position = side === "left" ? "right-full top-0 mr-2" : "left-full top-0 ml-2";

  useEffect(() => {
    if (review.phase !== "reading") firstControlRef.current?.focus();
  }, [review.phase]);

  const selectedCount = review.phase === "ready" ? review.selectedIds.size : 0;

  return (
    <section
      aria-busy={review.phase === "reading"}
      aria-labelledby="redaction-review-title"
      className={`absolute z-40 w-72 rounded-xl border border-white/12 bg-[#1c1e1a]/98 p-3 text-stone-100 shadow-[0_18px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl ${position}`}
      data-capture-interactive="true"
      data-placement={side}
    >
      <h2 className="text-xs font-semibold" id="redaction-review-title">
        Sensitive text
      </h2>

      {review.phase === "reading" ? (
        <p aria-live="polite" className="mt-2 flex items-center gap-2 text-xs text-stone-300">
          <Refresh aria-hidden="true" className="animate-spin text-lime-300 motion-reduce:animate-none" size={14} />
          Reading the selection…
        </p>
      ) : null}

      {review.phase === "error" ? (
        <>
          <p className="mt-2 break-words text-xs leading-4 text-red-100" role="alert">
            {review.message}
          </p>
          <button
            className={`${BUTTON_BASE} mt-3 w-full bg-white/9 text-stone-100 hover:bg-white/14`}
            ref={(element): void => {
              firstControlRef.current = element;
            }}
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </>
      ) : null}

      {review.phase === "ready" && review.suggestions.length === 0 ? (
        <>
          <p className="mt-2 text-xs leading-4 text-stone-300">
            No emails, phone numbers, card numbers or keys were found.
          </p>
          <button
            className={`${BUTTON_BASE} mt-3 w-full bg-white/9 text-stone-100 hover:bg-white/14`}
            ref={(element): void => {
              firstControlRef.current = element;
            }}
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </>
      ) : null}

      {review.phase === "ready" && review.suggestions.length > 0 ? (
        <>
          <p className="mt-1 text-[11px] leading-4 text-stone-400">
            Check what to black out. Review the result before sharing.
          </p>
          <fieldset className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            <legend className="sr-only">Suggestions to black out</legend>
            {review.suggestions.map((suggestion, index) => (
              <label
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/6 has-focus-visible:ring-2 has-focus-visible:ring-lime-300 motion-reduce:transition-none"
                key={suggestion.id}
              >
                <input
                  checked={review.selectedIds.has(suggestion.id)}
                  className="size-3.5 shrink-0 accent-lime-300 outline-none"
                  ref={index === 0
                    ? (element): void => {
                      firstControlRef.current = element;
                    }
                    : undefined}
                  type="checkbox"
                  onChange={() => onToggle(suggestion.id)}
                />
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold text-stone-100">
                    {SENSITIVE_KIND_LABELS[suggestion.kind]}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-stone-400">
                    {suggestion.preview}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="mt-3 flex gap-2">
            <button
              className={`${BUTTON_BASE} flex-1 bg-white/9 text-stone-100 hover:bg-white/14`}
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className={`${BUTTON_BASE} flex-1 bg-lime-300 text-stone-950 hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-40`}
              disabled={selectedCount === 0}
              type="button"
              onClick={onApply}
            >
              Black out {selectedCount}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

/** Dashed previews of the checked suggestions, drawn over the selection. */
export function RedactionPreview({ review }: { review: RedactionReview }): React.JSX.Element | null {
  if (review.phase !== "ready") return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
      {review.suggestions
        .filter((suggestion) => review.selectedIds.has(suggestion.id))
        .map((suggestion) => (
          <div
            className="absolute rounded-sm border border-dashed border-lime-300 bg-stone-950/55"
            key={suggestion.id}
            style={{
              left: suggestion.bounds.x,
              top: suggestion.bounds.y,
              width: suggestion.bounds.width,
              height: suggestion.bounds.height,
            }}
          />
        ))}
    </div>
  );
}
