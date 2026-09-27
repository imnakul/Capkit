import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** The four groups Settings is split into, by the task someone is doing. */
export type SettingsTabId = "general" | "screenshots" | "screen-draw" | "shortcuts";

export type SettingsTabDefinition = {
  id: SettingsTabId;
  label: string;
};

type PillPosition = {
  left: number;
  width: number;
};

type SettingsTabsProps = {
  tabs: readonly SettingsTabDefinition[];
  active: SettingsTabId;
  onSelect: (id: SettingsTabId) => void;
  children: React.ReactNode;
};

/**
 * The Settings tab bar and the single panel it controls.
 *
 * The bar is sticky because a tab such as Screenshots scrolls far past the
 * header, and the two pills are measured from the tabs themselves rather than
 * animated with a shared layout library, because the desktop app ships no
 * animation runtime: the only motion here is a CSS transition on `transform`
 * and `width`, which the browser can interrupt when a tab changes mid-glide.
 */
export function SettingsTabs({ tabs, active, onSelect, children }: SettingsTabsProps): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<SettingsTabId, HTMLButtonElement>());
  const [hovered, setHovered] = useState<SettingsTabId | null>(null);
  const [activePill, setActivePill] = useState<PillPosition>({ left: 0, width: 0 });
  const [hoverPill, setHoverPill] = useState<PillPosition>({ left: 0, width: 0 });

  useLayoutEffect(() => {
    function place(
      set: (updater: (current: PillPosition) => PillPosition) => void,
      id: SettingsTabId,
    ): void {
      const tab = tabRefs.current.get(id);
      if (tab === undefined) return;
      set((current) =>
        current.left === tab.offsetLeft && current.width === tab.offsetWidth
          ? current
          : { left: tab.offsetLeft, width: tab.offsetWidth },
      );
    }

    function measure(): void {
      place(setActivePill, active);
      if (hovered !== null) place(setHoverPill, hovered);
    }

    measure();
    const list = listRef.current;
    // jsdom has neither layout nor a ResizeObserver; the bar still measures
    // itself once per change, which is all a single-window panel needs.
    if (list === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return (): void => observer.disconnect();
  }, [active, hovered]);

  const selectBy = useCallback(
    (from: number, offset: number): void => {
      const next = tabs[(((from + offset) % tabs.length) + tabs.length) % tabs.length];
      if (next === undefined) return;
      onSelect(next.id);
      tabRefs.current.get(next.id)?.focus();
    },
    [onSelect, tabs],
  );

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const index = tabs.findIndex((tab) => tab.id === active);
    if (index === -1) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectBy(index, 1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectBy(index, -1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      selectBy(index, -index);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      selectBy(index, tabs.length - 1 - index);
    }
  }

  function handleBlur(event: React.FocusEvent<HTMLDivElement>): void {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setHovered(null);
  }

  return (
    <>
      <div className="sticky top-0 z-10 -mx-7 bg-[#f4f4f1] px-7 py-2 dark:bg-[#242523]">
        <div
          aria-label="Settings sections"
          className="relative flex w-fit gap-1"
          ref={listRef}
          role="tablist"
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onMouseLeave={() => setHovered(null)}
        >
          {/* The hover pill fades rather than travels away, so the glide stays on
              the active pill where the eye is already looking. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 transition-opacity duration-150 motion-reduce:transition-none"
            data-indicator="hover"
            style={{ opacity: hovered === null ? 0 : 1 }}
          >
            <span
              className="absolute inset-y-0 left-0 rounded-md bg-black/5 transition-[transform,width] duration-[220ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none dark:bg-white/5"
              style={{
                transform: `translateX(${String(hoverPill.left)}px)`,
                width: `${String(hoverPill.width)}px`,
              }}
            />
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 rounded-md bg-white shadow-sm transition-[transform,width] duration-[220ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none dark:bg-white/9"
            data-indicator="active"
            style={{
              transform: `translateX(${String(activePill.left)}px)`,
              width: `${String(activePill.width)}px`,
            }}
          />

          {tabs.map((tab) => {
            const isActive = tab.id === active;
            return (
              <button
                aria-controls={`settings-panel-${tab.id}`}
                aria-selected={isActive}
                className="relative z-10 rounded-md px-3 py-1.5 text-[13px] font-semibold text-stone-500 outline-none transition-colors duration-150 hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 aria-selected:text-stone-950 dark:text-stone-400 dark:hover:text-stone-200 dark:aria-selected:text-white"
                id={`settings-tab-${tab.id}`}
                key={tab.id}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
                onClick={() => onSelect(tab.id)}
                onFocus={() => setHovered(tab.id)}
                onMouseEnter={() => setHovered(tab.id)}
                ref={(node: HTMLButtonElement | null): void => {
                  if (node === null) tabRefs.current.delete(tab.id);
                  else tabRefs.current.set(tab.id, node);
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        aria-labelledby={`settings-tab-${active}`}
        className="pt-6"
        id={`settings-panel-${active}`}
        role="tabpanel"
      >
        {children}
      </div>
    </>
  );
}
