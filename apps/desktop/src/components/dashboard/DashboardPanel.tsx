import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useSnaphubSettings } from "../../domain/settings";
import { getBrowserLinkStatus, listSavedCaptures, listenForBrowserLinkStatus, listenForShowcaseRequest, takePendingShowcase, updateGlobalShortcuts } from "../../lib/tauri";
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

  return (
    <div className="flex h-screen min-h-[640px] min-w-[900px] bg-[#f4f4f1] text-[#1c1d1a] transition-colors dark:bg-[#242523] dark:text-stone-100">
      <aside className="flex w-48 shrink-0 flex-col border-r border-stone-300/80 bg-[#ebecea] px-2.5 py-3.5 text-stone-600 transition-colors dark:border-white/8 dark:bg-[#20211f] dark:text-stone-300">
        <div className="flex items-center gap-2.5 px-2 pb-6 pt-1">
          <div className="grid size-8 place-items-center rounded-lg bg-[var(--snaphub-accent)] text-[#12130f]">
            <ScanLine aria-hidden="true" size={16} strokeWidth={2.1} />
          </div>
          <div>
            <p className="text-[13px] font-semibold tracking-tight text-stone-900 dark:text-white">Capkit</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-stone-500 dark:text-stone-500">Desktop utility</p>
          </div>
        </div>

        <nav aria-label="Capkit sections" className="space-y-1">
          {navigation.filter((item) => item.id !== "notes" || developerTools).map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeTab;
            return (
              <button
                aria-label={`Open ${item.label}`}
                aria-current={isActive ? "page" : undefined}
                className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium outline-none transition-colors hover:bg-black/5 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-[current=page]:bg-black/7 aria-[current=page]:text-stone-950 dark:hover:bg-white/6 dark:hover:text-white dark:aria-[current=page]:bg-white/9 dark:aria-[current=page]:text-white"
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
              >
                <Icon
                  aria-hidden="true"
                  className={isActive ? "text-[var(--snaphub-accent)]" : "text-stone-500 group-hover:text-stone-700 dark:group-hover:text-stone-300"}
                  size={15}
                  strokeWidth={1.9}
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-stone-300/80 px-2 pt-3 dark:border-white/8">
          <div aria-label="Dashboard appearance" className="mb-3 grid grid-cols-2 gap-1 rounded-md border border-stone-300 bg-white/45 p-1 dark:border-white/8 dark:bg-black/10" role="group">
            {(["light", "dark"] as const).map((appearance) => {
              const Icon = appearance === "light" ? Sun : Moon;
              return (
                <button
                  aria-label={`Use ${appearance} mode`}
                  aria-pressed={settings.appearance === appearance}
                  className="flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[12px] font-medium capitalize text-stone-500 outline-none transition-colors hover:text-stone-900 focus-visible:ring-1 focus-visible:ring-[var(--snaphub-accent)] aria-pressed:bg-white aria-pressed:text-stone-950 dark:hover:text-stone-200 dark:aria-pressed:bg-white/9 dark:aria-pressed:text-white"
                  key={appearance}
                  type="button"
                  onClick={() => updateSettings({ ...settings, appearance })}
                >
                  <Icon aria-hidden="true" size={12} />
                  {appearance}
                </button>
              );
            })}
          </div>
          <UpdateNotice controller={updates} />
          <div className="flex items-center gap-2 text-[12px] text-stone-500">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Ready in the system tray
          </div>
          <p className="mt-1 text-[11px] leading-4 text-stone-600">v{version ?? "—"} · {__CAPKIT_COMMIT__} · Preferences stay on this device</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
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
      </main>
    </div>
  );
}
