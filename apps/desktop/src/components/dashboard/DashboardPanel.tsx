import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useSnaphubSettings } from "../../domain/settings";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
  NotePin,
  Presentation,
  Record,
  Scan as ScanLine,
  Settings,
  Sun,
} from "../icons";

type DashboardTab = "screenshots" | "notes" | "showcase" | "record" | "settings";

const navigation = [
  { id: "screenshots", label: "Screenshots", icon: Image },
  { id: "notes", label: "Notes", icon: NotePin },
  { id: "showcase", label: "Showcase", icon: Presentation },
  { id: "record", label: "Record", icon: Record },
  { id: "settings", label: "Settings", icon: Settings },
] as const satisfies readonly { id: DashboardTab; label: string; icon: typeof Settings }[];

export function DashboardPanel(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<DashboardTab>("screenshots");
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

  // The native window theme drives Mica's light/dark variant.
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

  const visibleNavigation = navigation.filter((item) => item.id !== "notes" || developerTools);
  const activeIndex = Math.max(0, visibleNavigation.findIndex((item) => item.id === activeTab));
  const nextAppearance = settings.appearance === "dark" ? "light" : "dark";
  const ThemeIcon = settings.appearance === "dark" ? Sun : Moon;

  return (
    <div className="flex h-screen min-h-[640px] min-w-[900px] text-content">
      <aside className="flex w-48 shrink-0 flex-col border-r border-content/10 bg-background-base/40 px-2.5 py-3.5 text-content/60">
        <div className="flex items-center gap-2.5 px-2 pb-6 pt-1">
          <div className="grid size-7 place-items-center rounded-md bg-accent text-accent-ink">
            <ScanLine aria-hidden="true" size={15} strokeWidth={2} />
          </div>
          <p className="text-[13px] font-semibold text-content">CapKit</p>
        </div>

        <nav aria-label="Capkit sections" className="relative flex flex-col gap-1">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-8 rounded-md bg-content/8 transition-transform duration-200 ease-track motion-reduce:transition-none"
            style={{ transform: `translateY(${String(activeIndex * 36)}px)` }}
          />
          {visibleNavigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeTab;
            return (
              <button
                aria-label={`Open ${item.label}`}
                aria-current={isActive ? "page" : undefined}
                className="relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] outline-none transition-colors duration-120 hover:bg-content/6 hover:text-content focus-visible:ring-2 focus-visible:ring-accent/50 aria-[current=page]:font-medium aria-[current=page]:text-content aria-[current=page]:hover:bg-transparent motion-reduce:transition-none"
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
              >
                <Icon aria-hidden="true" className={isActive ? "text-accent" : "text-content/45"} size={14} strokeWidth={1.75} />
                {item.label}
              </button>
            );
          })}
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

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div
          className="transition-[opacity,transform] duration-[180ms] ease-arrive starting:translate-y-1.5 starting:opacity-0 motion-reduce:transition-none"
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
  );
}
