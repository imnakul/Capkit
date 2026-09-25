import { useEffect } from "react";

/**
 * A click-through outline drawn around exactly what is being recorded.
 *
 * Its own window is sized and positioned by the Rust side to match the
 * chosen source's bounds exactly, so this component only has to fill that
 * window — the outline's shape and position come for free from the window
 * geometry, not from anything computed here.
 */
export function RecordingBorder(): React.JSX.Element {
  useEffect(() => {
    document.documentElement.classList.add("on-screen-surface");
    return (): void => document.documentElement.classList.remove("on-screen-surface");
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-transparent">
      <div className="absolute inset-0 shadow-[inset_0_0_0_3px_var(--snaphub-accent)]" />
      <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-[#171815]/92 px-2.5 py-1 shadow-lg">
        <span className="size-1.5 animate-pulse rounded-full bg-[#ff5b4d]" />
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-white">Recording</span>
      </div>
    </div>
  );
}
