import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "@fontsource-variable/jetbrains-mono/index.css";
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "./styles.css";

const CaptureApp = lazy(async () => {
  const module = await import("./App");
  return { default: module.App };
});

const PinnedCapture = lazy(async () => {
  const module = await import("./components/PinnedView");
  return { default: module.PinnedView };
});

const PinnedCaptureEntry = lazy(async () => {
  const module = await import("./components/PinnedView");
  return { default: module.PinnedCaptureEntry };
});

const DashboardPanel = lazy(async () => {
  const module = await import("./components/dashboard/DashboardPanel");
  return { default: module.DashboardPanel };
});

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("ShotHub root element was not found.");
}

const pinPath = new URLSearchParams(window.location.search).get("pin");
const currentWindowLabel = isTauri()
  ? getCurrentWindow().label
  : new URLSearchParams(window.location.search).has("dashboard")
    ? "dashboard"
    : "capture";

createRoot(rootElement).render(
  <StrictMode>
    <Suspense fallback={<div className="h-screen w-screen bg-transparent" role="status" aria-label="Preparing ShotHub" />}>
      {pinPath !== null ? (
        <PinnedCapture path={pinPath} />
      ) : currentWindowLabel.startsWith("pin-") ? (
        <PinnedCaptureEntry windowLabel={currentWindowLabel} />
      ) : currentWindowLabel === "dashboard" ? (
        <DashboardPanel />
      ) : (
        <CaptureApp />
      )}
    </Suspense>
  </StrictMode>,
);
