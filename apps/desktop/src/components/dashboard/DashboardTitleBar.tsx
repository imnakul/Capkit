import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

const glyphClass = "size-[10px] fill-none stroke-current";
const buttonClass =
  "grid h-full w-[46px] place-items-center text-content/70 outline-none transition-colors duration-120 hover:bg-content/8 hover:text-content focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 motion-reduce:transition-none";

/**
 * Window chrome drawn by the page, so the title bar shares the glass and theme
 * with the rest of the dashboard. The native bar is painted by Windows and
 * ignores both: it stayed solid while the page blurred, and its buttons
 * vanished against a light window.
 *
 * Renders nothing outside Tauri (browser preview, tests).
 */
export function DashboardTitleBar(): React.JSX.Element | null {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const appWindow = getCurrentWindow();
    let cancelled = false;
    const sync = (): void => {
      void appWindow
        .isMaximized()
        .then((value) => {
          if (!cancelled) setIsMaximized(value);
        })
        .catch(() => undefined);
    };
    sync();
    const unlisten = appWindow.onResized(sync);
    return (): void => {
      cancelled = true;
      void unlisten.then((stop) => stop()).catch(() => undefined);
    };
  }, []);

  if (!isTauri()) return null;
  const appWindow = getCurrentWindow();
  const report = (error: unknown): void => console.error("CK-WINDOW-CHROME-001", error);

  return (
    <header className="flex h-8 shrink-0 items-stretch justify-end border-b border-content/10" data-tauri-drag-region>
      <button aria-label="Minimize" className={buttonClass} type="button" onClick={() => void appWindow.minimize().catch(report)}>
        <svg aria-hidden="true" className={glyphClass} viewBox="0 0 10 10">
          <path d="M0 5.5h10" />
        </svg>
      </button>
      <button
        aria-label={isMaximized ? "Restore" : "Maximize"}
        className={buttonClass}
        type="button"
        onClick={() => void appWindow.toggleMaximize().catch(report)}
      >
        <svg aria-hidden="true" className={glyphClass} viewBox="0 0 10 10">
          {isMaximized ? <path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" /> : <rect height="9" width="9" x=".5" y=".5" />}
        </svg>
      </button>
      <button
        aria-label="Close"
        className={`${buttonClass} hover:bg-danger hover:text-white`}
        type="button"
        onClick={() => void appWindow.close().catch(report)}
      >
        <svg aria-hidden="true" className={glyphClass} viewBox="0 0 10 10">
          <path d="M.5.5l9 9M9.5.5l-9 9" />
        </svg>
      </button>
    </header>
  );
}
