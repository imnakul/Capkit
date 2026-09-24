import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "@fontsource-variable/caveat/wght.css";
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

const OnScreenOverlay = lazy(async () => {
  const module = await import("./components/OnScreenOverlay");
  return { default: module.OnScreenOverlay };
});

const RecorderDock = lazy(async () => {
  const module = await import("./components/RecorderDock");
  return { default: module.RecorderDock };
});

const RecordRegion = lazy(async () => {
  const module = await import("./components/RecordRegion");
  return { default: module.RecordRegion };
});

const CameraPreview = lazy(async () => {
  const module = await import("./components/CameraPreview");
  return { default: module.CameraPreview };
});

const RecordingBorder = lazy(async () => {
  const module = await import("./components/RecordingBorder");
  return { default: module.RecordingBorder };
});

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Capkit root element was not found.");
}

const searchParams = new URLSearchParams(window.location.search);
const pinPath = searchParams.get("pin");
const pinWindowLabel = searchParams.get("pinWindow");
const currentWindowLabel = isTauri()
  ? getCurrentWindow().label
  : new URLSearchParams(window.location.search).has("dashboard")
    ? "dashboard"
    : "capture";

createRoot(rootElement).render(
  <StrictMode>
    <Suspense fallback={<div className="h-screen w-screen bg-transparent" role="status" aria-label="Preparing Capkit" />}>
      {pinPath !== null ? (
        <PinnedCapture path={pinPath} />
      ) : pinWindowLabel !== null ? (
        <PinnedCaptureEntry windowLabel={pinWindowLabel} />
      ) : currentWindowLabel.startsWith("pin-") ? (
        <PinnedCaptureEntry windowLabel={currentWindowLabel} />
      ) : currentWindowLabel === "dashboard" ? (
        <DashboardPanel />
      ) : currentWindowLabel === "onscreen" ? (
        <OnScreenOverlay />
      ) : currentWindowLabel === "recorder" ? (
        <RecorderDock />
      ) : currentWindowLabel === "record-region" ? (
        <RecordRegion />
      ) : currentWindowLabel === "camera" ? (
        <CameraPreview />
      ) : currentWindowLabel === "recording-border" ? (
        <RecordingBorder />
      ) : (
        <CaptureApp />
      )}
    </Suspense>
  </StrictMode>,
);
