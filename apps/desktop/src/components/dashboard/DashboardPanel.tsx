import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSnaphubSettings } from "../../domain/settings";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CapKitLogo } from "./CapKitLogo";
import { DashboardTitleBar } from "./DashboardTitleBar";
import { dashboardSupportsGlass, getBrowserLinkStatus, listSavedCaptures, setBrowserLinkAccent, listenForBrowserLinkStatus, listenForShowcaseRequest, takePendingShowcase, updateGlobalShortcuts } from "../../lib/tauri";
import { NotesView } from "./NotesView";
import { SettingsView } from "./SettingsView";
import { UpdateNotice } from "./UpdateNotice";
import { useUpdateStatus } from "./useUpdateStatus";
import { SavedCapturesView } from "./SavedCapturesView";
import { ShowcaseView } from "./ShowcaseView";
import { RecordView } from "./RecordView";
import { findSavedCapture, type SavedCapture } from "../../domain/capture";
import {
  Image,
  Moon,
  Presentation,
  Record,
  Settings,
  StickyNote,
  Sun,
} from "../icons";

type DashboardTab = "screenshots" | "notes" | "showcase" | "record" | "settings";

type NavigationItem = { id: DashboardTab; label: string; icon: typeof Settings };
type NavigationGroup = { heading?: string; hasDivider?: boolean; items: readonly NavigationItem[] };

/** Capture things first, then the studio that edits them, then settings apart at the end. */
const navigationGroups: readonly NavigationGroup[] = [
  {
    items: [
      { id: "screenshots", label: "Screenshots", icon: Image },
      { id: "record", label: "Screen record", icon: Record },
      { id: "notes", label: "Page notes", icon: StickyNote },
    ],
  },
  { heading: "Studio", items: [{ id: "showcase", label: "Showcase", icon: Presentation }] },
  { hasDivider: true, items: [{ id: "settings", label: "Settings", icon: Settings }] },
];

function navPillStyle(position: { top: number; height: number } | undefined): React.CSSProperties {
  return position === undefined
    ? { height: 0 }
    : { height: `${String(position.height)}px`, transform: `translateY(${String(position.top)}px)` };
}

export function DashboardPanel(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<DashboardTab>("screenshots");
  const [hoveredTab, setHoveredTab] = useState<DashboardTab | null>(null);
  const [navPositions, setNavPositions] = useState<Partial<Record<DashboardTab, { top: number; height: number }>>>({});
  const navButtons = useRef(new Map<DashboardTab, HTMLButtonElement>());
  const [showcaseCapture, setShowcaseCapture] = useState<SavedCapture | null>(null);
  const [isShowcaseStylePending, setIsShowcaseStylePending] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [developerTools, setDeveloperTools] = useState(false);
  const { settings, updateSettings } = useSnaphubSettings();
  const updates = useUpdateStatus(settings.updates.autoCheck);
  const clearShowcaseStylePending = useCallback((): void => {
    setIsShowcaseStylePending(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getVersion()
      .then((appVersion) => {
        if (!cancelled) setVersion(appVersion);
      })
      .catch(() => {
        if (!cancelled) setVersion(null);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  // The dashboard window lives for the whole session, so it keeps the extension's colour in sync.
  useEffect(() => {
    void setBrowserLinkAccent(settings.accentColor).catch(() => undefined);
  }, [settings.accentColor]);

  // Notes belong to Developer tools, so the tab follows the browser-link switch.
  useEffect(() => {
    let cancelled = false;
    void getBrowserLinkStatus().then((status) => {
      if (!cancelled) setDeveloperTools(status.enabled);
    }).catch(() => undefined);
    const unlisten = listenForBrowserLinkStatus((status) => setDeveloperTools(status.enabled));
    return (): void => {
      cancelled = true;
      void unlisten.then((stop) => stop());
    };
  }, []);

  useEffect(() => {
    if (activeTab === "notes" && !developerTools) setActiveTab("screenshots");
  }, [activeTab, developerTools]);

  useEffect(() => {
    if (!isTauri()) return;
    const frame = window.requestAnimationFrame(() => {
      void invoke("dashboard_ready").catch((error: unknown) => {
        console.error("SH-DASHBOARD-READY-001", error);
      });
    });
    return (): void => window.cancelAnimationFrame(frame);
  }, []);

  // A capture sent from the completion rail. Pulled on mount, because a freshly
  // built dashboard missed the event, and again whenever an open one is asked.
  // The take is one-shot, so the result is applied even after a cleanup:
  // StrictMode's rehearsal unmount would otherwise discard the only copy.
  useEffect(() => {
    if (!isTauri()) return;
    const openPending = async (): Promise<void> => {
      const path = await takePendingShowcase();
      if (path === null) return;
      const captures = await listSavedCaptures();
      setShowcaseCapture(findSavedCapture(captures, path));
      setIsShowcaseStylePending(true);
      setActiveTab("showcase");
    };
    const report = (error: unknown): void => {
      console.error("SH-SHOWCASE-PENDING-001", error);
    };
    void openPending().catch(report);
    const unlisten = listenForShowcaseRequest(() => {
      void openPending().catch(report);
    });
    return (): void => {
      void unlisten.then((stop) => {
        stop();
      });
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void updateGlobalShortcuts(settings.shortcuts).catch((error: unknown) => {
      console.error("SH-SHORTCUT-SYNC-001", error);
    });
  }, [
    settings.shortcuts.capture,
    settings.shortcuts.captureAndCopy,
    settings.shortcuts.captureAndSave,
    settings.shortcuts.onScreenToggle,
  ]);

  // Glass needs the Windows compositor blur; elsewhere the page keeps its opaque base colour.
  useEffect(() => {
    document.body.classList.add("dashboard-surface");
    let cancelled = false;
    void dashboardSupportsGlass()
      .then((supported) => {
        if (!cancelled) document.documentElement.classList.toggle("glass", supported);
      })
      .catch(() => undefined);
    return (): void => {
      cancelled = true;
      document.body.classList.remove("dashboard-surface");
      document.documentElement.classList.remove("glass");
    };
  }, []);

  // Keeps the native theme in step (webview colour scheme, system menus).
  useEffect(() => {
    if (!isTauri()) return;
    void getCurrentWindow().setTheme(settings.appearance).catch((error: unknown) => {
      console.error("CK-WINDOW-THEME-001", error);
    });
  }, [settings.appearance]);

  /** Snaps the page for one frame so the theme swap never smears through transitions. */
  function changeAppearance(appearance: "light" | "dark"): void {
    const root = document.documentElement;
    root.classList.add("dark-dashboard-swap");
    updateSettings({ ...settings, appearance });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => root.classList.remove("dark-dashboard-swap"));
    });
  }

  const visibleGroups = navigationGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.id !== "notes" || developerTools) }))
    .filter((group) => group.items.length > 0);
  useLayoutEffect(() => {
    const next: Partial<Record<DashboardTab, { top: number; height: number }>> = {};
    for (const [id, button] of navButtons.current) next[id] = { top: button.offsetTop, height: button.offsetHeight };
    setNavPositions(next);
  }, [developerTools]);

  const nextAppearance = settings.appearance === "dark" ? "light" : "dark";
  const ThemeIcon = settings.appearance === "dark" ? Sun : Moon;

  return (
    <div className="flex h-screen min-h-[640px] min-w-[900px] flex-col text-content">
      <DashboardTitleBar />
      <div className="flex min-h-0 flex-1">
      <aside className="flex w-56 shrink-0 flex-col border-r border-content/10 px-2.5 py-3.5 text-content/60">
        <div className="px-1 pb-5 pt-1">
          <div className="flex items-center gap-2.5">
            <CapKitLogo size={28} />
            <p className="text-[14px] font-semibold text-content">CapKit</p>
          </div>
          <p className="mt-2.5 text-balance text-[12px] leading-snug text-content/60">
            The lightweight desktop toolkit to capture, record, and showcase.
          </p>
        </div>

        <nav aria-label="Capkit sections" className="relative flex flex-col" onMouseLeave={() => setHoveredTab(null)}>
          {/* Hover pill glides between items like the settings tabs; the active pill sits above it. */}
          {hoveredTab === null && navPositions[activeTab] === undefined ? null : (
            <>
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-0 top-0 rounded-md bg-content/6 transition-[transform,opacity,height] duration-200 ease-track motion-reduce:transition-none ${hoveredTab === null ? "opacity-0" : "opacity-100"}`}
                style={navPillStyle(navPositions[hoveredTab ?? activeTab])}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 rounded-md bg-content/8 transition-[transform,height] duration-200 ease-track motion-reduce:transition-none"
                style={navPillStyle(navPositions[activeTab])}
              />
            </>
          )}
          {visibleGroups.map((group, groupIndex) => (
            <div
              className={`flex flex-col gap-1 ${groupIndex === 0 ? "" : group.hasDivider ? "mt-3 border-t border-content/10 pt-3" : "mt-4"}`}
              key={group.heading ?? group.items[0]?.id}
              role="group"
              aria-label={group.heading}
            >
              {group.heading === undefined ? null : (
                <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-content/45">{group.heading}</p>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activeTab;
                return (
                  <button
                    aria-label={`Open ${item.label}`}
                    aria-current={isActive ? "page" : undefined}
                    className="relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] outline-none transition-colors duration-120 hover:text-content focus-visible:ring-2 focus-visible:ring-accent/50 aria-[current=page]:font-medium aria-[current=page]:text-content motion-reduce:transition-none"
                    key={item.id}
                    ref={(node: HTMLButtonElement | null): void => {
                      if (node === null) navButtons.current.delete(item.id);
                      else navButtons.current.set(item.id, node);
                    }}
                    type="button"
                    onBlur={() => setHoveredTab(null)}
                    onClick={() => setActiveTab(item.id)}
                    onFocus={() => setHoveredTab(item.id)}
                    onMouseEnter={() => setHoveredTab(item.id)}
                  >
                    <Icon aria-hidden="true" className={isActive ? "text-accent" : "text-content/45"} size={14} strokeWidth={1.75} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>


        <div className="mt-auto space-y-3 px-1">
          <UpdateNotice controller={updates} />
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] tabular-nums text-content/45" title={__CAPKIT_COMMIT__}>
              v{version ?? "—"}
            </span>
            <button
              aria-label={`Switch to ${nextAppearance} mode`}
              className="grid size-7 place-items-center rounded-md text-content/60 outline-none transition-colors duration-120 hover:bg-content/6 hover:text-content focus-visible:ring-2 focus-visible:ring-accent/50 motion-reduce:transition-none"
              type="button"
              onClick={() => changeAppearance(nextAppearance)}
            >
              <ThemeIcon aria-hidden="true" size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </aside>

      <main className={`min-w-0 flex-1 ${activeTab === "settings" ? "overflow-hidden" : "overflow-y-scroll"}`}>
        <div
          className={`transition-[opacity,transform] duration-[180ms] ease-arrive starting:translate-y-1.5 starting:opacity-0 motion-reduce:transition-none ${activeTab === "settings" ? "h-full" : ""}`}
          key={activeTab}
        >
          {activeTab === "screenshots" ? (
            <SavedCapturesView
              onShowcase={(capture) => {
                setShowcaseCapture(capture ?? null);
                setIsShowcaseStylePending(true);
                setActiveTab("showcase");
              }}
            />
          ) : activeTab === "notes" ? (
            <NotesView />
          ) : activeTab === "showcase" ? (
            <ShowcaseView
              applyDefaultStyle={isShowcaseStylePending}
              initialCapture={showcaseCapture}
              onDefaultStyleApplied={clearShowcaseStylePending}
            />
          ) : activeTab === "settings" ? (
            <SettingsView />
          ) : (
            <RecordView />
          )}
        </div>
      </main>
      </div>
    </div>
  );
}
