import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  Clock,
  FolderSettings as FolderCog,
  VerticalScroll as GalleryVerticalEnd,
  Keyboard,
  SelectPointer as MousePointer2,
  PaintBrush as Paintbrush,
  Palette,
  Add as Plus,
  Presentation,
  RotateCounterClockwise as RotateCcw,
  SearchArea as ScanSearch,
  Sliders as SlidersHorizontal,
  Tick as Check,
} from "../icons";
import { useEffect, useId, useRef, useState } from "react";
import {
  captureModeShortcutConflict,
  defaultOnScreenSettings,
  defaultSnaphubSettings,
  onScreenToolIds,
  type OnScreenDrawingToolId,
  type OnScreenToolId,
  type SnaphubSettings,
  useSnaphubSettings,
} from "../../domain/settings";
import {
  type BrowserLinkStatus,
  describeInvokeError,
  getBrowserLinkStatus,
  listenForBrowserLinkStatus,
  getRecordingDirectory,
  getSaveDirectory,
  openRecordingDirectory,
  resetRecordingDirectory,
  resetSaveDirectory,
  setRecordingDirectory,
  setSaveDirectory,
  updateGlobalShortcuts,
} from "../../lib/tauri";
import { captureCursor, onScreenCursor } from "../../lib/cursor";
import { LAYER } from "../layers";
import { Button } from "../ui/Button";
import { Keycap } from "../ui/Keycap";
import { PageHeader } from "../ui/PageHeader";
import { Segmented } from "../ui/Segmented";
import { SettingRow } from "../ui/SettingRow";
import { SettingsCard } from "../ui/SettingsCard";
import { Switch } from "../ui/Switch";
import {
  getStartupState,
  openStartupSettings,
  presentStartupState,
  setStartupEnabled,
  type StartupState,
} from "../../lib/startup";
import { BrowserExtensionSettings } from "./BrowserExtensionSettings";
import { SettingsTabs, type SettingsTabId } from "./SettingsTabs";
import { ToolbarConfiguration } from "./ToolbarConfiguration";
import { useUpdateStatus } from "./useUpdateStatus";

const neonColors = ["#d9ff43", "#39ff88", "#39e7ff", "#7c5cff", "#ff4fd8", "#ff5b4d", "#ffb547", "#ffffff", "#171717"] as const;
const accentColors = ["#d9ff43", "#39ff88", "#39e7ff", "#7c5cff", "#ff4fd8", "#ffb547"] as const;
const onScreenToolLabels: Record<OnScreenToolId, string> = {
  select: "Select",
  pencil: "Pencil",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  arrow: "Arrow",
  text: "Text",
  spotlight: "Spotlight",
  magnifier: "Magnifier",
  pointer: "Presentation pointer",
  eraser: "Eraser",
  blur: "Blur",
};

const configurableOnScreenToolIds: readonly OnScreenDrawingToolId[] = onScreenToolIds.filter(
  (tool): tool is OnScreenDrawingToolId => tool !== "select",
);

type ShortcutField = keyof SnaphubSettings["shortcuts"];

/**
 * Settings are grouped by the task someone is doing when they look for them,
 * so anything added later goes into one of these tabs rather than growing a new
 * column. Colors and the pointer live under Screenshots because Screen Draw
 * owns its own versions of both.
 */
const settingsTabs = [
  { id: "general", label: "General" },
  { id: "screenshots", label: "Screenshots" },
  { id: "screen-draw", label: "Screen Draw" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "developer", label: "Developer" },
] as const satisfies readonly { id: SettingsTabId; label: string }[];

type SettingsSectionId =
  | "updates"
  | "save-location"
  | "save-recordings"
  | "theme-accent"
  | "capture-toolbar"
  | "colors"
  | "detection"
  | "capture-cursor"
  | "scrolling"
  | "on-screen-toolbar"
  | "shortcuts"
  | "browser-extension";

const settingsSections: Record<SettingsTabId, readonly SettingsSectionId[]> = {
  general: ["updates", "save-location", "save-recordings", "theme-accent"],
  screenshots: ["capture-toolbar", "colors", "detection", "capture-cursor", "scrolling"],
  "screen-draw": ["on-screen-toolbar"],
  shortcuts: ["shortcuts"],
  developer: ["browser-extension"],
};

/** Sections whose body holds a shortcut row that can be mid-recording. */
const shortcutSections: ReadonlySet<SettingsSectionId> = new Set<SettingsSectionId>([
  "shortcuts",
  "on-screen-toolbar",
]);

/** One section per tab starts open, so a tab always shows what it is for. */
function defaultOpenSections(): Record<SettingsSectionId, boolean> {
  const open: Record<SettingsSectionId, boolean> = {
    updates: false,
    "save-location": false,
    "save-recordings": false,
    "theme-accent": false,
    "capture-toolbar": false,
    colors: false,
    detection: false,
    "capture-cursor": false,
    scrolling: false,
    "on-screen-toolbar": false,
    shortcuts: false,
    "browser-extension": false,
  };
  for (const sections of Object.values(settingsSections)) {
    const first = sections[0];
    if (first !== undefined) open[first] = true;
  }
  return open;
}

export function SettingsView(): React.JSX.Element {
  const { settings, updateSettings } = useSnaphubSettings();
  const [customColor, setCustomColor] = useState("#8b5cf6");
  const [recordingShortcut, setRecordingShortcut] = useState<ShortcutField | null>(null);
  const [shortcutMessage, setShortcutMessage] = useState<string | null>(null);
  const [saveDirectory, setSaveDirectoryState] = useState("Pictures\\Capkit");
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [choosingDirectory, setChoosingDirectory] = useState(false);
  const [recordingDirectory, setRecordingDirectoryState] = useState("Videos\\Capkit");
  const [recordingMessage, setRecordingMessage] = useState<string | null>(null);
  const [choosingRecordingDirectory, setChoosingRecordingDirectory] = useState(false);
  // Null until the native state loads; the saved preference stands in.
  const [startupState, setStartupState] = useState<StartupState | null>(null);
  const [changingStartup, setChangingStartup] = useState(false);
  const [startupMessage, setStartupMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");
  const updates = useUpdateStatus(false);
  const [openSections, setOpenSections] = useState<Record<SettingsSectionId, boolean>>(defaultOpenSections);

  useEffect(() => {
    void getSaveDirectory()
      .then(setSaveDirectoryState)
      .catch((error: unknown) => setStorageMessage(describeInvokeError(error, "Save location could not be loaded")));
    void getRecordingDirectory()
      .then(setRecordingDirectoryState)
      .catch((error: unknown) =>
        setRecordingMessage(describeInvokeError(error, "Recordings location could not be loaded")),
      );
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void loadStartupState();
  }, []);

  // Turning CapKit back on happens in Windows Settings, so re-read the state
  // when the user returns. Only while that is the pending fix; no polling.
  useEffect(() => {
    if (startupState?.status !== "disabled-by-user") return;
    function refresh(): void {
      void loadStartupState();
    }
    window.addEventListener("focus", refresh);
    return (): void => window.removeEventListener("focus", refresh);
  }, [startupState?.status]);

  useEffect(() => {
    if (!isTauri()) return;
    void registerShortcuts(settings.shortcuts).catch((error: unknown) => {
      setShortcutMessage(String(error));
    });
  }, [settings.shortcuts.capture, settings.shortcuts.captureAndCopy, settings.shortcuts.captureAndSave, settings.shortcuts.onScreenToggle, settings.shortcuts.recordToggle]);

  useEffect(() => {
    if (recordingShortcut === null) return;
    const activeShortcut = recordingShortcut;
    function record(event: KeyboardEvent): void {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecordingShortcut(null);
        return;
      }
      if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
      if (isCaptureModeShortcutField(activeShortcut)) {
        if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
        const value = event.key.length === 1 ? event.key.toUpperCase() : "";
        setRecordingShortcut(null);
        if (!/^[A-Z0-9]$/.test(value)) {
          setShortcutMessage("Use one letter or number without modifiers.");
          return;
        }
        const conflict = captureModeShortcutConflict(
          activeShortcut,
          value,
          settings,
        );
        if (conflict !== null) {
          setShortcutMessage(conflict);
          return;
        }
        updateSettings({
          ...settings,
          shortcuts: {
            ...settings.shortcuts,
            [activeShortcut]: value,
          },
        });
        setShortcutMessage("Shortcut saved");
        return;
      }
      const value = formatShortcut(event);
      setRecordingShortcut(null);
      setShortcutMessage(null);
      const nextShortcuts = { ...settings.shortcuts, [activeShortcut]: value };
      if (isTauri()) {
        void registerShortcuts(nextShortcuts)
          .then((registered) => {
            updateSettings({ ...settings, shortcuts: registered });
            setShortcutMessage("Shortcuts updated");
          })
          .catch((error: unknown) => setShortcutMessage(String(error)));
        return;
      }
      updateSettings({ ...settings, shortcuts: nextShortcuts });
      setShortcutMessage("Shortcut saved");
    }
    window.addEventListener("keydown", record, true);
    return (): void => window.removeEventListener("keydown", record, true);
  }, [recordingShortcut, settings, updateSettings]);

  function update(next: SnaphubSettings): void {
    updateSettings(next);
  }

  function togglePalette(color: string): void {
    const selected = settings.palette.includes(color);
    if (selected && settings.palette.length === 1) return;
    if (!selected && settings.palette.length === 5) return;
    const palette = selected ? settings.palette.filter((item) => item !== color) : [...settings.palette, color];
    const defaultColor = palette.includes(settings.annotation.defaultColor) ? settings.annotation.defaultColor : (palette[0] ?? defaultSnaphubSettings.annotation.defaultColor);
    update({ ...settings, palette, annotation: { ...settings.annotation, defaultColor } });
  }

  function addCustomColor(): void {
    const normalized = customColor.toLowerCase();
    const customColors = settings.customColors.includes(normalized) ? settings.customColors : [...settings.customColors, normalized];
    const palette = settings.palette.includes(normalized) || settings.palette.length === 5 ? settings.palette : [...settings.palette, normalized];
    update({ ...settings, customColors, palette });
  }

  function applyStartupState(state: StartupState): void {
    setStartupState(state);
    const isOn = presentStartupState(state).isOn;
    if (isOn !== settings.openAtStartup) updateSettings({ ...settings, openAtStartup: isOn });
  }

  async function loadStartupState(): Promise<void> {
    try {
      applyStartupState(await getStartupState());
      setStartupMessage(null);
    } catch (error: unknown) {
      setStartupMessage(describeInvokeError(error, "Startup setting could not be loaded"));
    }
  }

  async function changeStartup(enabled: boolean): Promise<void> {
    if (!isTauri()) {
      update({ ...settings, openAtStartup: enabled });
      return;
    }
    setChangingStartup(true);
    setStartupMessage(null);
    try {
      applyStartupState(await setStartupEnabled(enabled));
    } catch (error: unknown) {
      setStartupMessage(describeInvokeError(error, "Startup setting could not be changed"));
    } finally {
      setChangingStartup(false);
    }
  }

  async function showStartupSettings(): Promise<void> {
    try {
      await openStartupSettings();
    } catch (error: unknown) {
      setStartupMessage(describeInvokeError(error, "Windows Settings could not be opened"));
    }
  }

  async function resetShortcuts(): Promise<void> {
    setRecordingShortcut(null);
    if (!isTauri()) {
      update({ ...settings, shortcuts: defaultSnaphubSettings.shortcuts });
      setShortcutMessage("Shortcuts reset");
      return;
    }
    try {
      const registered = await registerShortcuts(defaultSnaphubSettings.shortcuts);
      update({
        ...settings,
        shortcuts: registered,
      });
      setShortcutMessage("Shortcuts reset");
    } catch (error: unknown) {
      setShortcutMessage(String(error));
    }
  }

  async function resetShortcut(field: ShortcutField): Promise<void> {
    setRecordingShortcut(null);
    const defaultValue = defaultSnaphubSettings.shortcuts[field];
    if (isCaptureModeShortcutField(field)) {
      const conflict = captureModeShortcutConflict(field, defaultValue, settings);
      if (conflict !== null) {
        setShortcutMessage(conflict);
        return;
      }
    }
    if (isTauri()) {
      try {
        const registered = await registerShortcuts({
          ...settings.shortcuts,
          [field]: defaultValue,
        });
        update({
          ...settings,
          shortcuts: registered,
        });
        setShortcutMessage("Shortcut reset");
      } catch (error: unknown) {
        setShortcutMessage(String(error));
      }
      return;
    }
    update({
      ...settings,
      shortcuts: { ...settings.shortcuts, [field]: defaultValue },
    });
    const labels: Record<ShortcutField, string> = {
      capture: "Start capture",
      captureAndCopy: "Capture & copy",
      captureAndSave: "Capture & save",
      onScreenToggle: "On-screen toolbar",
      recordToggle: "Start recording",
      captureModeCopy: "Copy selection",
      captureModeSave: "Save selection",
      captureModeCopyAndSave: "Copy & Save selection",
    };
    setShortcutMessage(`${labels[field]} shortcut reset`);
  }

  function updateOnScreenToolShortcut(tool: OnScreenDrawingToolId, value: string): void {
    const toolShortcuts = Object.fromEntries(
      configurableOnScreenToolIds.map((candidate) => [
        candidate,
        candidate === tool
          ? value
          : value !== "" && settings.onScreen.toolShortcuts[candidate] === value
            ? ""
            : settings.onScreen.toolShortcuts[candidate],
      ]),
    );
    const validated = defaultSnaphubSettings.onScreen.toolShortcuts;
    update({
      ...settings,
      onScreen: {
        ...settings.onScreen,
        toolShortcuts: {
          pencil: toolShortcuts.pencil ?? validated.pencil,
          rectangle: toolShortcuts.rectangle ?? validated.rectangle,
          ellipse: toolShortcuts.ellipse ?? validated.ellipse,
          arrow: toolShortcuts.arrow ?? validated.arrow,
          text: toolShortcuts.text ?? validated.text,
          spotlight: toolShortcuts.spotlight ?? validated.spotlight,
          magnifier: toolShortcuts.magnifier ?? validated.magnifier,
          pointer: toolShortcuts.pointer ?? validated.pointer,
          eraser: toolShortcuts.eraser ?? validated.eraser,
          blur: toolShortcuts.blur ?? validated.blur,
        },
      },
    });
  }

  async function resetOnScreenSettings(): Promise<void> {
    const shortcuts = {
      ...settings.shortcuts,
      onScreenToggle: defaultSnaphubSettings.shortcuts.onScreenToggle,
    };
    if (!isTauri()) {
      update({ ...settings, shortcuts, onScreen: defaultOnScreenSettings });
      return;
    }
    try {
      const registered = await registerShortcuts(shortcuts);
      update({
        ...settings,
        shortcuts: registered,
        onScreen: defaultOnScreenSettings,
      });
      setShortcutMessage("On-screen toolbar settings reset");
    } catch (error: unknown) {
      setShortcutMessage(String(error));
    }
  }

  function resetDetection(): void {
    update({
      ...settings,
      detection: defaultSnaphubSettings.detection,
      overlay: defaultSnaphubSettings.overlay,
    });
  }

  function toggleSection(id: SettingsSectionId): void {
    const nextOpen = !openSections[id];
    setOpenSections((current) => ({ ...current, [id]: nextOpen }));
    // A shortcut waiting for a keystroke has nowhere to land once the section
    // holding it closes, so the wait ends with the section.
    if (!nextOpen && shortcutSections.has(id)) setRecordingShortcut(null);
  }

  async function chooseSaveDirectory(): Promise<void> {
    if (!isTauri()) {
      setStorageMessage("Folder selection is available in the Windows desktop app");
      return;
    }
    setChoosingDirectory(true);
    setStorageMessage(null);
    try {
      const selected = await open({
        defaultPath: saveDirectory,
        directory: true,
        multiple: false,
        title: "Choose where Capkit saves captures",
      });
      if (typeof selected !== "string") return;
      const directory = await setSaveDirectory(selected);
      setSaveDirectoryState(directory);
      setStorageMessage("New captures will save here automatically");
    } catch (error: unknown) {
      setStorageMessage(describeInvokeError(error, "Save location could not be changed"));
    } finally {
      setChoosingDirectory(false);
    }
  }

  async function resetStorage(): Promise<void> {
    try {
      const directory = await resetSaveDirectory();
      setSaveDirectoryState(directory);
      setStorageMessage("Save location reset");
    } catch (error: unknown) {
      setStorageMessage(describeInvokeError(error, "Save location could not be reset"));
    }
  }

  async function chooseRecordingDirectory(): Promise<void> {
    if (!isTauri()) {
      setRecordingMessage("Folder selection is available in the Windows desktop app");
      return;
    }
    setChoosingRecordingDirectory(true);
    setRecordingMessage(null);
    try {
      const selected = await open({
        defaultPath: recordingDirectory,
        directory: true,
        multiple: false,
        title: "Choose where Capkit saves recordings",
      });
      if (typeof selected !== "string") return;
      const directory = await setRecordingDirectory(selected);
      setRecordingDirectoryState(directory);
      setRecordingMessage("New recordings will save here automatically");
    } catch (error: unknown) {
      setRecordingMessage(describeInvokeError(error, "Recordings location could not be changed"));
    } finally {
      setChoosingRecordingDirectory(false);
    }
  }

  async function openRecordingsFolder(): Promise<void> {
    try {
      await openRecordingDirectory();
    } catch (error: unknown) {
      setRecordingMessage(describeInvokeError(error, "Recordings folder could not be opened"));
    }
  }

  async function resetRecordings(): Promise<void> {
    try {
      const directory = await resetRecordingDirectory();
      setRecordingDirectoryState(directory);
      setRecordingMessage("Recordings location reset");
    } catch (error: unknown) {
      setRecordingMessage(describeInvokeError(error, "Recordings location could not be reset"));
    }
  }

  const startup = presentStartupState(startupState ?? { status: settings.openAtStartup ? "enabled" : "disabled", managedBy: "app" });
  const toolbarSummary = describeToolbar(settings.toolbar);
  const changed = {
    updates: !sameValue(settings.updates, defaultSnaphubSettings.updates),
    accent: settings.accentColor !== defaultSnaphubSettings.accentColor,
    toolbar: !sameValue(settings.toolbar, defaultSnaphubSettings.toolbar),
    colors:
      !sameValue(settings.palette, defaultSnaphubSettings.palette) ||
      settings.customColors.length > 0 ||
      !sameValue(settings.annotation, defaultSnaphubSettings.annotation),
    detection:
      !sameValue(settings.detection, defaultSnaphubSettings.detection) ||
      !sameValue(settings.overlay, defaultSnaphubSettings.overlay),
    cursor: !sameValue(settings.cursor, defaultSnaphubSettings.cursor),
    scrolling: !sameValue(settings.scrolling, defaultSnaphubSettings.scrolling),
    onScreen:
      !sameValue(settings.onScreen, defaultOnScreenSettings) ||
      settings.shortcuts.onScreenToggle !== defaultSnaphubSettings.shortcuts.onScreenToggle,
    shortcuts: !sameValue(settings.shortcuts, defaultSnaphubSettings.shortcuts),
  };
  const updateSummary =
    updates.status.state === "unsupported"
      ? "Store updates"
      : updates.status.state === "available"
        ? `v${updates.status.version} available`
        : updates.status.state === "installing"
          ? `Downloading ${String(updates.status.percent)}%`
          : !settings.updates.autoCheck
            ? "Checks off"
            : "Up to date";
  const scrollingLabels = { automatic: "Automatic", manual: "Manual", choose: "Ask every time" } as const;
  const cursorSummary = `${capitalize(settings.cursor.style)}, ${settings.cursor.size}`;

  return (
    <div className="mx-auto max-w-[760px] px-7 pb-12 pt-6">
      <PageHeader
        title="Settings"
        trailing={
          <span className="flex items-center gap-1.5">
            <Check aria-hidden="true" size={12} />
            Saved
          </span>
        }
      />

      <SettingsTabs active={activeTab} onSelect={setActiveTab} tabs={settingsTabs}>
        <div className="space-y-2">
          {activeTab === "general" ? (
            <>
              <section className="rounded-lg border border-content/10 bg-content/4 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Clock aria-hidden="true" className="shrink-0 text-content/60" size={16} strokeWidth={1.75} />
                  <h2 className="text-[13px] font-semibold text-content">Open at startup</h2>
                  <div className="ml-auto">
                    <Switch label="Open at startup" checked={startup.isOn} disabled={!startup.canChange || changingStartup} onChange={(enabled) => void changeStartup(enabled)} />
                  </div>
                </div>
                {startup.notice === null ? null : (
                  <div className="mt-2 flex items-center gap-3">
                    <p className="min-w-0 flex-1 text-[12px] text-content/60">{startup.notice}</p>
                    {startup.canOpenWindowsSettings ? <Button onClick={() => void showStartupSettings()}>Open Startup settings</Button> : null}
                  </div>
                )}
                {startupMessage === null ? null : <p aria-live="polite" className="mt-2 text-[12px] text-content/60">{startupMessage}</p>}
              </section>
              <SettingsCard id="updates" onToggle={toggleSection} open={openSections.updates} icon={RotateCcw} title="Updates" summary={updateSummary} hint="Checks once when CapKit starts; nothing installs until you choose.">
                {updates.status.state === "unsupported" ? (
                  <p className="text-[12px] text-content/60">Updates come from the Microsoft Store.</p>
                ) : (
                  <>
                    <SettingRow label="Check for updates automatically">
                      <Switch label="Check for updates automatically" checked={settings.updates.autoCheck} onChange={(autoCheck) => update({ ...settings, updates: { autoCheck } })} />
                    </SettingRow>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Button disabled={updates.status.state === "checking" || updates.status.state === "installing"} onClick={updates.check}>Check for updates</Button>
                      <p aria-live="polite" className="text-[12px] text-content/60">
                        {updates.status.state === "checking" ? "Checking…" : null}
                        {updates.status.state === "up-to-date" ? `You're on the latest version (v${updates.status.currentVersion}).` : null}
                        {updates.status.state === "available" ? `v${updates.status.version} is available.` : null}
                        {updates.status.state === "installing" ? `Downloading… ${String(updates.status.percent)}%` : null}
                        {updates.status.state === "error" ? updates.status.message : null}
                      </p>
                      {updates.status.state === "available" ? <Button variant="primary" onClick={updates.install}>Install and restart</Button> : null}
                    </div>
                    {updates.guardMessage === null ? null : <p className="mt-2 text-[12px] text-amber-500" role="alert">{updates.guardMessage}</p>}
                  </>
                )}
                <SectionReset visible={changed.updates} onClick={() => update({ ...settings, updates: defaultSnaphubSettings.updates })} />
              </SettingsCard>
              <SettingsCard
                id="theme-accent"
                onToggle={toggleSection}
                open={openSections["theme-accent"]}
                icon={Paintbrush}
                title="Accent"
                summary={<><span className="size-2.5 rounded-full" style={{ backgroundColor: settings.accentColor }} /><span className="font-mono">{settings.accentColor.toUpperCase()}</span></>}
                hint="Used for tools, focus and new annotations."
              >
                <div className="flex flex-wrap gap-2">{accentColors.map((color) => <ColorButton color={color} key={color} label={`Use ${color} as theme accent`} selected={settings.accentColor === color} onClick={() => update({ ...settings, accentColor: color })} />)}</div>
                <SectionReset visible={changed.accent} onClick={() => update({ ...settings, accentColor: defaultSnaphubSettings.accentColor })} />
              </SettingsCard>
              <SettingsCard id="save-location" onToggle={toggleSection} open={openSections["save-location"]} icon={FolderCog} title="Screenshot folder" summary={<span title={saveDirectory}>{shortenPath(saveDirectory)}</span>}>
                <FolderField label="Default save location" path={saveDirectory} chooseLabel="Choose default save location" choosing={choosingDirectory} onChoose={() => void chooseSaveDirectory()} />
                {storageMessage === null ? null : <p aria-live="polite" className="mt-2 text-[12px] text-content/60">{storageMessage}</p>}
                <SectionReset visible onClick={() => void resetStorage()} />
              </SettingsCard>
              <SettingsCard id="save-recordings" onToggle={toggleSection} open={openSections["save-recordings"]} icon={FolderCog} title="Recording folder" summary={<span title={recordingDirectory}>{shortenPath(recordingDirectory)}</span>}>
                <FolderField label="Default recordings location" path={recordingDirectory} chooseLabel="Choose default recordings location" choosing={choosingRecordingDirectory} onChoose={() => void chooseRecordingDirectory()} onOpen={() => void openRecordingsFolder()} openLabel="Open recordings folder" />
                {recordingMessage === null ? null : <p aria-live="polite" className="mt-2 text-[12px] text-content/60">{recordingMessage}</p>}
                <SectionReset visible onClick={() => void resetRecordings()} />
              </SettingsCard>
            </>
          ) : activeTab === "screenshots" ? (
            <>
              <SettingsCard id="capture-toolbar" onToggle={toggleSection} open={openSections["capture-toolbar"]} icon={SlidersHorizontal} title="Capture toolbar" summary={toolbarSummary} hint="Direct tools are one click away; groups keep the bar short.">
                <ToolbarConfiguration toolbar={settings.toolbar} onChange={(toolbar) => update({ ...settings, toolbar })} />
                <SectionReset visible={changed.toolbar} onClick={() => update({ ...settings, toolbar: defaultSnaphubSettings.toolbar })} />
              </SettingsCard>
              <SettingsCard
                id="colors"
                onToggle={toggleSection}
                open={openSections.colors}
                icon={Palette}
                title="Colors and size"
                summary={<><span className="flex gap-0.5">{settings.palette.map((color) => <span className="size-2.5 rounded-full" key={color} style={{ backgroundColor: color }} />)}</span><span className="tabular-nums">{settings.annotation.defaultSize} px</span></>}
              >
                <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
                  <div>
                    <div className="mb-2.5 flex items-center justify-between"><FieldLabel>Quick colors</FieldLabel><span className="text-[12px] tabular-nums text-content/45">{settings.palette.length} / 5 selected</span></div>
                    <div className="flex flex-wrap gap-2">
                      {[...neonColors, ...settings.customColors].filter((color, index, colors) => colors.indexOf(color) === index).map((color) => {
                        const selected = settings.palette.includes(color);
                        return <ColorButton color={color} key={color} label={`${selected ? "Remove" : "Add"} ${color}`} selected={selected} disabled={!selected && settings.palette.length === 5} onClick={() => togglePalette(color)} />;
                      })}
                      <label aria-label="Choose a custom color" className="relative grid size-6 cursor-pointer place-items-center rounded-full border border-dashed border-content/25 text-content/60 transition-colors duration-120 hover:border-content/50 hover:text-content motion-reduce:transition-none">
                        <Plus aria-hidden="true" size={13} />
                        <input className="absolute inset-0 cursor-pointer opacity-0" type="color" value={customColor} onChange={(event) => setCustomColor(event.currentTarget.value)} />
                      </label>
                      <Button aria-label="Add custom color" onClick={addCustomColor}>Add custom</Button>
                    </div>
                    {settings.palette.length === 5 ? <p className="mt-2 text-[12px] text-content/45">Remove one color before adding another.</p> : null}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><FieldLabel>Default color</FieldLabel><ColorSelect colors={settings.palette} value={settings.annotation.defaultColor} onChange={(defaultColor) => update({ ...settings, annotation: { ...settings.annotation, defaultColor } })} /></div>
                    <label className="block">
                      <FieldLabel>Default size</FieldLabel>
                      <div className="mt-1.5 flex h-8 items-center gap-2.5 rounded-md border border-content/15 bg-content/4 px-2.5">
                        <input aria-label="Default annotation size" className="min-w-0 flex-1 accent-accent" max="24" min="1" type="range" value={settings.annotation.defaultSize} onChange={(event) => update({ ...settings, annotation: { ...settings.annotation, defaultSize: Number(event.currentTarget.value) } })} />
                        <span className="w-9 text-right font-mono text-[12px] tabular-nums text-content/60">{settings.annotation.defaultSize}px</span>
                      </div>
                    </label>
                  </div>
                </div>
                <SectionReset visible={changed.colors} onClick={() => update({ ...settings, palette: defaultSnaphubSettings.palette, customColors: [], annotation: defaultSnaphubSettings.annotation })} />
              </SettingsCard>
              <SettingsCard
                id="detection"
                onToggle={toggleSection}
                open={openSections.detection}
                icon={ScanSearch}
                title="Detection and overlay"
                summary={`${describeDetection(settings.detection)}, ${String(Math.round(settings.overlay.opacity * 100))}% shade`}
              >
                <SettingRow label="Detect windows" hint="Highlight app windows as you hover">
                  <Switch label="Detect windows" checked={settings.detection.windows} onChange={(windows) => update({ ...settings, detection: { ...settings.detection, windows } })} />
                </SettingRow>
                <SettingRow label="Detect controls inside windows" hint="Uses Windows accessibility data; custom canvas regions are ignored">
                  <Switch label="Detect controls inside windows" checked={settings.detection.uiRegions} onChange={(uiRegions) => update({ ...settings, detection: { ...settings.detection, uiRegions } })} />
                </SettingRow>
                <SettingRow label="Overlay tint">
                  <input aria-label="Overlay tint color" className="size-7 cursor-pointer rounded-md border border-content/15 bg-content/4 p-0.5" type="color" value={settings.overlay.color} onChange={(event) => update({ ...settings, overlay: { ...settings.overlay, color: event.currentTarget.value } })} />
                  <input aria-label="Overlay tint strength" className="w-28 accent-accent" max="85" min="15" type="range" value={Math.round(settings.overlay.opacity * 100)} onChange={(event) => update({ ...settings, overlay: { ...settings.overlay, opacity: Number(event.currentTarget.value) / 100 } })} />
                  <span className="w-8 text-right font-mono text-[12px] tabular-nums text-content/60">{Math.round(settings.overlay.opacity * 100)}%</span>
                  <InlineResetButton label="Reset overlay tint" disabled={settings.overlay.color === defaultSnaphubSettings.overlay.color && settings.overlay.opacity === defaultSnaphubSettings.overlay.opacity} onClick={() => update({ ...settings, overlay: defaultSnaphubSettings.overlay })} />
                </SettingRow>
                <SectionReset visible={changed.detection} onClick={resetDetection} />
              </SettingsCard>
              <SettingsCard id="capture-cursor" onToggle={toggleSection} open={openSections["capture-cursor"]} icon={MousePointer2} title="Capture cursor" summary={settings.cursor.enabled ? cursorSummary : "System crosshair"}>
                <SettingRow label="Use Capkit drawing cursor" hint="Turn off to use the standard system crosshair">
                  <Switch label="Use Capkit drawing cursor" checked={settings.cursor.enabled} onChange={(enabled) => update({ ...settings, cursor: { ...settings.cursor, enabled } })} />
                </SettingRow>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(["crosshair", "target", "precision"] as const).map((cursorStyle) => {
                    const previewCursor = captureCursor({ enabled: true, style: cursorStyle, size: settings.cursor.size }, settings.accentColor);
                    return (
                      <button aria-label={`Use ${cursorStyle} cursor`} aria-pressed={settings.cursor.style === cursorStyle} className="rounded-md border border-content/10 bg-content/4 px-2.5 py-2 text-left text-[12px] font-medium capitalize text-content/80 outline-none transition-colors duration-120 hover:bg-content/6 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:border-accent/60 aria-pressed:bg-content/8 aria-pressed:text-content motion-reduce:transition-none" key={cursorStyle} style={{ cursor: previewCursor }} type="button" onClick={() => update({ ...settings, cursor: { ...settings.cursor, style: cursorStyle } })}>
                        {cursorStyle}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3">
                  <SettingRow label="Cursor size">
                    <Segmented label="Cursor size" value={settings.cursor.size} options={cursorSizes} onChange={(size) => update({ ...settings, cursor: { ...settings.cursor, size } })} />
                  </SettingRow>
                </div>
                <SectionReset visible={changed.cursor} onClick={() => update({ ...settings, cursor: defaultSnaphubSettings.cursor })} />
              </SettingsCard>
              <SettingsCard id="scrolling" onToggle={toggleSection} open={openSections.scrolling} icon={GalleryVerticalEnd} title="Scrolling capture" summary={scrollingLabels[settings.scrolling.defaultMode]}>
                <SettingRow label="Default method" hint="Skip the chooser for your usual workflow">
                  <Segmented
                    label="Default scrolling capture method"
                    value={settings.scrolling.defaultMode}
                    options={[
                      { value: "automatic", label: "Automatic" },
                      { value: "manual", label: "Manual" },
                      { value: "choose", label: "Ask every time" },
                    ]}
                    onChange={(defaultMode) => update({ ...settings, scrolling: { defaultMode } })}
                  />
                </SettingRow>
                <SectionReset visible={changed.scrolling} onClick={() => update({ ...settings, scrolling: defaultSnaphubSettings.scrolling })} />
              </SettingsCard>
            </>
          ) : activeTab === "developer" ? (
            <SettingsCard id="browser-extension" onToggle={toggleSection} open={openSections["browser-extension"]} icon={ScanSearch} title="Browser extension" summary={<BrowserLinkSummary />} hint="Inspect page elements and redact text exactly.">
              <BrowserExtensionSettings />
            </SettingsCard>
          ) : activeTab === "screen-draw" ? (
            <SettingsCard
              id="on-screen-toolbar"
              onToggle={toggleSection}
              open={openSections["on-screen-toolbar"]}
              icon={Presentation}
              title="Screen Draw"
              summary={<><Keycap>{settings.shortcuts.onScreenToggle}</Keycap>{settings.onScreen.liveDesktop ? "live desktop" : "frozen frame"}</>}
              hint="Press the shortcut again, or Esc, to leave."
            >
              <ShortcutRow label="Toggle on-screen toolbar" value={settings.shortcuts.onScreenToggle} defaultValue={defaultSnaphubSettings.shortcuts.onScreenToggle} recording={recordingShortcut === "onScreenToggle"} onRecord={() => setRecordingShortcut("onScreenToggle")} onReset={() => void resetShortcut("onScreenToggle")} />
              <SettingRow label="Keep desktop live" hint="Animations keep running beneath your drawings. Off annotates a frozen frame.">
                <Switch label="Keep desktop live" checked={settings.onScreen.liveDesktop} onChange={(liveDesktop) => update({ ...settings, onScreen: { ...settings.onScreen, liveDesktop } })} />
              </SettingRow>
              <SettingRow label="Keep drawings between toggles" hint="Restore drawings when you leave and reopen Screen Draw">
                <Switch label="Keep drawings between toggles" checked={settings.onScreen.persistDrawings} onChange={(persistDrawings) => update({ ...settings, onScreen: { ...settings.onScreen, persistDrawings } })} />
              </SettingRow>

              <GroupLabel>Appearance</GroupLabel>
              <SettingRow label="Color">
                <input aria-label="Custom on-screen drawing color" className="size-7 cursor-pointer rounded-md border border-content/15 bg-content/4 p-0.5" type="color" value={settings.onScreen.color} onChange={(event) => update({ ...settings, onScreen: { ...settings.onScreen, color: event.currentTarget.value } })} />
                {neonColors.slice(0, 8).map((color) => (
                  <ColorButton color={color} key={color} label={`Use ${color} for on-screen drawing`} selected={settings.onScreen.color.toLowerCase() === color.toLowerCase()} onClick={() => update({ ...settings, onScreen: { ...settings.onScreen, color } })} />
                ))}
              </SettingRow>
              <SettingRow label="Stroke width">
                <input aria-label="On-screen stroke width" className="w-36 accent-accent" max="18" min="1" type="range" value={settings.onScreen.strokeSize} onChange={(event) => update({ ...settings, onScreen: { ...settings.onScreen, strokeSize: Number(event.currentTarget.value) } })} />
                <span className="w-9 text-right font-mono text-[12px] tabular-nums text-content/60">{settings.onScreen.strokeSize}px</span>
              </SettingRow>
              <SettingRow label="Spotlight size">
                <input aria-label="On-screen spotlight size" className="w-36 accent-accent" max="360" min="80" step="10" type="range" value={settings.onScreen.spotlightSize} onChange={(event) => update({ ...settings, onScreen: { ...settings.onScreen, spotlightSize: Number(event.currentTarget.value) } })} />
                <span className="w-9 text-right font-mono text-[12px] tabular-nums text-content/60">{settings.onScreen.spotlightSize}px</span>
              </SettingRow>

              <GroupLabel>Number keys</GroupLabel>
              <p className="mb-2 text-[12px] text-content/45">Assign 0–9 once each while Screen Draw is active; the number shows on the dock tool.</p>
              <div className="grid gap-x-6 sm:grid-cols-2">
                {configurableOnScreenToolIds.map((tool) => (
                  <label className="flex items-center gap-3 border-b border-content/8 py-1.5" key={tool}>
                    <span className="min-w-0 flex-1 text-[13px] text-content">{onScreenToolLabels[tool]}</span>
                    <select aria-label={`Shortcut for ${onScreenToolLabels[tool]}`} className="h-7 w-16 rounded-md border border-content/15 bg-content/4 px-2 font-mono text-[12px] text-content outline-none focus-visible:ring-2 focus-visible:ring-accent/50" value={settings.onScreen.toolShortcuts[tool]} onChange={(event) => updateOnScreenToolShortcut(tool, event.currentTarget.value)}>
                      <option value="">Off</option>
                      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((key) => <option key={key} value={key}>{key}</option>)}
                    </select>
                  </label>
                ))}
              </div>

              <GroupLabel>Cursor</GroupLabel>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {(["ring", "laser", "precision", "crosshair"] as const).map((style) => {
                  const preview = onScreenCursor({ style, size: settings.onScreen.cursor.size }, settings.accentColor);
                  return (
                    <button aria-label={`Use ${style} on-screen cursor`} aria-pressed={settings.onScreen.cursor.style === style} className="rounded-md border border-content/10 bg-content/4 px-2.5 py-2 text-left text-[12px] font-medium capitalize text-content/80 outline-none transition-colors duration-120 hover:bg-content/6 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:border-accent/60 aria-pressed:bg-content/8 aria-pressed:text-content motion-reduce:transition-none" key={style} style={{ cursor: preview }} type="button" onClick={() => update({ ...settings, onScreen: { ...settings.onScreen, cursor: { ...settings.onScreen.cursor, style } } })}>
                      {style}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3">
                <SettingRow label="Cursor size">
                  <Segmented label="On-screen cursor size" value={settings.onScreen.cursor.size} options={cursorSizes} onChange={(size) => update({ ...settings, onScreen: { ...settings.onScreen, cursor: { ...settings.onScreen.cursor, size } } })} />
                </SettingRow>
              </div>
              <SectionReset visible={changed.onScreen} onClick={() => void resetOnScreenSettings()} />
            </SettingsCard>
          ) : (
            <>
              <SettingsCard
                id="shortcuts"
                onToggle={toggleSection}
                open={openSections.shortcuts}
                icon={Keyboard}
                title="Global shortcuts"
                summary={<><Keycap>{settings.shortcuts.capture}</Keycap>and 3 more</>}
                hint="Click a shortcut, then press the new keys. Esc cancels."
              >
                <ShortcutRow label="Start capture" value={settings.shortcuts.capture} defaultValue={defaultSnaphubSettings.shortcuts.capture} recording={recordingShortcut === "capture"} onRecord={() => setRecordingShortcut("capture")} onReset={() => void resetShortcut("capture")} />
                <ShortcutRow label="Capture & copy" value={settings.shortcuts.captureAndCopy} defaultValue={defaultSnaphubSettings.shortcuts.captureAndCopy} recording={recordingShortcut === "captureAndCopy"} onRecord={() => setRecordingShortcut("captureAndCopy")} onReset={() => void resetShortcut("captureAndCopy")} />
                <ShortcutRow label="Capture & save" value={settings.shortcuts.captureAndSave} defaultValue={defaultSnaphubSettings.shortcuts.captureAndSave} recording={recordingShortcut === "captureAndSave"} onRecord={() => setRecordingShortcut("captureAndSave")} onReset={() => void resetShortcut("captureAndSave")} />
                <ShortcutRow label="Start recording" value={settings.shortcuts.recordToggle} defaultValue={defaultSnaphubSettings.shortcuts.recordToggle} recording={recordingShortcut === "recordToggle"} onRecord={() => setRecordingShortcut("recordToggle")} onReset={() => void resetShortcut("recordToggle")} />
                <GroupLabel>In capture mode</GroupLabel>
                <p className="mb-1 text-[12px] text-content/45">Single keys, active only after you select a region.</p>
                <ShortcutRow label="Copy selection" value={settings.shortcuts.captureModeCopy} defaultValue={defaultSnaphubSettings.shortcuts.captureModeCopy} recording={recordingShortcut === "captureModeCopy"} onRecord={() => setRecordingShortcut("captureModeCopy")} onReset={() => void resetShortcut("captureModeCopy")} />
                <ShortcutRow label="Copy & Save selection" value={settings.shortcuts.captureModeCopyAndSave} defaultValue={defaultSnaphubSettings.shortcuts.captureModeCopyAndSave} recording={recordingShortcut === "captureModeCopyAndSave"} onRecord={() => setRecordingShortcut("captureModeCopyAndSave")} onReset={() => void resetShortcut("captureModeCopyAndSave")} />
                <ShortcutRow label="Save selection" value={settings.shortcuts.captureModeSave} defaultValue={defaultSnaphubSettings.shortcuts.captureModeSave} recording={recordingShortcut === "captureModeSave"} onRecord={() => setRecordingShortcut("captureModeSave")} onReset={() => void resetShortcut("captureModeSave")} />
                {shortcutMessage === null ? null : <p aria-live="polite" className="mt-2.5 text-[12px] text-content/60">{shortcutMessage}</p>}
                <SectionReset visible={changed.shortcuts} onClick={() => void resetShortcuts()} />
              </SettingsCard>
            </>
          )}
        </div>
      </SettingsTabs>
    </div>
  );
}

const cursorSizes = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Structural equality for plain settings objects (JSON-shaped, stable key order from the schema). */
function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** "6 tools, 3 actions": what the capture toolbar shows right now. */
function describeToolbar(toolbar: SnaphubSettings["toolbar"]): string {
  const tools =
    toolbar.mode === "group"
      ? new Set(toolbar.groups.flat()).size
      : Object.values(toolbar.individual).filter(Boolean).length;
  const actions = Object.values(toolbar.actions).filter((action) => action.enabled).length;
  return `${String(tools)} tools, ${String(actions)} actions`;
}

function describeDetection(detection: SnaphubSettings["detection"]): string {
  if (detection.windows && detection.uiRegions) return "Windows and elements";
  if (detection.windows) return "Windows";
  if (detection.uiRegions) return "Elements";
  return "No detection";
}

/** Keeps the drive and the last two folders: `C:\Users\…\Pictures\CapKit`. The full path stays in `title`. */
function shortenPath(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== "");
  if (parts.length <= 4) return path;
  const [first, second] = parts;
  return `${first ?? ""}\\${second ?? ""}\\…\\${parts.slice(-2).join("\\")}`;
}

/** The one-line extension status shown while the Developer card is closed. */
function BrowserLinkSummary(): React.JSX.Element {
  const [status, setStatus] = useState<BrowserLinkStatus | null>(null);
  useEffect(() => {
    let active = true;
    void getBrowserLinkStatus().then((next) => { if (active) setStatus(next); }).catch(() => undefined);
    const unlisten = listenForBrowserLinkStatus((next) => setStatus(next));
    return (): void => {
      active = false;
      void unlisten.then((stop) => stop());
    };
  }, []);
  if (status === null) return <span className="h-3 w-24 animate-pulse rounded bg-content/10 motion-reduce:animate-none" />;
  const connected = status.connected[0];
  const text = !status.enabled
    ? "Off"
    : connected !== undefined
      ? `Connected to ${connected.name} ${connected.version}`
      : "Waiting for the extension";
  return (
    <>
      <span className={`size-1.5 rounded-full ${connected !== undefined ? "bg-emerald-500" : "bg-content/30"}`} />
      {text}
    </>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <h3 className="mb-1 mt-5 text-[13px] font-semibold text-content">{children}</h3>;
}

type FolderFieldProps = {
  label: string;
  path: string;
  chooseLabel: string;
  choosing: boolean;
  onChoose: () => void;
  onOpen?: () => void;
  openLabel?: string;
};

function FolderField({ label, path, chooseLabel, choosing, onChoose, onOpen, openLabel }: FolderFieldProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="sr-only">{label}</p>
        <p className="truncate rounded-md border border-content/15 bg-content/4 px-2.5 py-1.5 font-mono text-[12px] text-content/80" title={path}>{path}</p>
      </div>
      <Button aria-label={chooseLabel} disabled={choosing} onClick={onChoose}>{choosing ? "Opening…" : "Change…"}</Button>
      {onOpen === undefined ? null : <Button aria-label={openLabel} variant="ghost" onClick={onOpen}>Open</Button>}
    </div>
  );
}

type ColorSelectProps = {
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
};

function ColorSelect({ colors, value, onChange }: ColorSelectProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;
    function closeFromOutside(event: PointerEvent): void {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function closeFromKeyboard(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", closeFromOutside);
    window.addEventListener("keydown", closeFromKeyboard);
    return (): void => {
      window.removeEventListener("pointerdown", closeFromOutside);
      window.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);

  return (
    <div className="relative mt-1.5" ref={containerRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Default annotation color"
        className="flex h-8 w-full items-center gap-2 rounded-md border border-content/15 bg-content/4 px-2.5 text-left font-mono text-[12px] text-content outline-none transition-colors duration-120 focus-visible:ring-2 focus-visible:ring-accent/50 motion-reduce:transition-none"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="size-3.5 shrink-0 rounded-full border border-content/10" style={{ backgroundColor: value }} />
        <span className="flex-1">{value.toUpperCase()}</span>
        <ChevronDown aria-hidden="true" className={`text-content/45 transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} size={13} />
      </button>
      {open ? (
        <ul
          aria-label="Available annotation colors"
          className="absolute inset-x-0 top-[calc(100%+4px)] origin-top overflow-hidden rounded-lg border border-content/10 bg-background-base py-1 shadow-xl transition-[opacity,transform] duration-[170ms] ease-arrive starting:scale-97 starting:opacity-0 motion-reduce:transition-none"
          id={listboxId}
          role="listbox"
          style={{ zIndex: LAYER.popover }}
        >
          {colors.map((color) => (
            <li key={color} role="none">
              <button
                aria-selected={value === color}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-[12px] text-content/60 outline-none hover:bg-content/6 focus-visible:bg-content/6 aria-selected:bg-content/8 aria-selected:text-content"
                role="option"
                type="button"
                onClick={() => {
                  onChange(color);
                  setOpen(false);
                }}
              >
                <span className="size-3.5 shrink-0 rounded-full border border-content/10" style={{ backgroundColor: color }} />
                <span className="flex-1">{color.toUpperCase()}</span>
                {value === color ? <Check aria-hidden="true" size={12} /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="text-[13px] font-medium text-content">{children}</span>;
}

type ColorButtonProps = { color: string; label: string; selected: boolean; disabled?: boolean; onClick: () => void };

/** A 24px colour swatch. The swatch colour is the user's own data, so it is the one place raw hex is allowed. */
function ColorButton({ color, label, selected, disabled = false, onClick }: ColorButtonProps): React.JSX.Element {
  const light = ["#ffffff", "#d9ff43", "#39ff88", "#39e7ff", "#ffb547"].includes(color.toLowerCase());
  return (
    <button
      aria-label={label}
      aria-pressed={selected}
      className="relative grid size-6 place-items-center rounded-full border border-content/15 outline-none transition-transform duration-120 focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none [@media(hover:hover)]:hover:scale-[1.06] aria-pressed:ring-2 aria-pressed:ring-accent aria-pressed:ring-offset-2 aria-pressed:ring-offset-background-base"
      disabled={disabled}
      style={{ backgroundColor: color }}
      type="button"
      onClick={onClick}
    >
      {selected ? <Check aria-hidden="true" className={light ? "text-accent-ink" : "text-white"} size={12} strokeWidth={2} /> : null}
    </button>
  );
}

/** "Reset this section" appears only once something differs from the default. */
function SectionReset({ onClick, visible }: { onClick: () => void; visible: boolean }): React.JSX.Element | null {
  if (!visible) return null;
  return (
    <div className="mt-3 flex justify-end">
      <Button aria-label="Reset this section" variant="ghost" onClick={onClick}>
        <RotateCcw aria-hidden="true" size={11} />
        Reset to default
      </Button>
    </div>
  );
}

type ShortcutRowProps = { label: string; value: string; defaultValue: string; recording: boolean; onRecord: () => void; onReset: () => void };

/** Recording state is an accent ring and "Press keys…", with no animation: a keystroke is the next event. */
function ShortcutRow({ label, value, defaultValue, recording, onRecord, onReset }: ShortcutRowProps): React.JSX.Element {
  return (
    <SettingRow label={label}>
      <button
        aria-label={`Configure ${label}`}
        aria-pressed={recording}
        className="min-w-28 rounded-md border border-content/10 bg-content/6 px-2.5 py-1 text-center font-keycap text-[12px] text-content outline-none hover:bg-content/10 focus-visible:ring-2 focus-visible:ring-accent/50 aria-pressed:ring-2 aria-pressed:ring-accent"
        type="button"
        onClick={onRecord}
      >
        {recording ? "Press keys…" : value}
      </button>
      <InlineResetButton label={`Reset ${label} shortcut`} disabled={value === defaultValue && !recording} onClick={onReset} />
    </SettingRow>
  );
}

type InlineResetButtonProps = { label: string; disabled: boolean; onClick: () => void };
function InlineResetButton({ label, disabled, onClick }: InlineResetButtonProps): React.JSX.Element {
  return (
    <Button aria-label={label} disabled={disabled} title={label} variant="ghost" onClick={onClick}>
      <RotateCcw aria-hidden="true" size={11} />
      Reset
    </Button>
  );
}

function isCaptureModeShortcutField(
  field: ShortcutField,
): field is "captureModeCopy" | "captureModeSave" | "captureModeCopyAndSave" {
  return field === "captureModeCopy"
    || field === "captureModeSave"
    || field === "captureModeCopyAndSave";
}

function formatShortcut(event: KeyboardEvent): string { const parts: string[] = []; if (event.ctrlKey) parts.push("Ctrl"); if (event.altKey) parts.push("Alt"); if (event.shiftKey) parts.push("Shift"); if (event.metaKey) parts.push("Meta"); const key = event.key.length === 1 ? event.key.toUpperCase() : event.key; parts.push(key); return parts.join("+"); }

async function registerShortcuts(
  shortcuts: SnaphubSettings["shortcuts"],
): Promise<SnaphubSettings["shortcuts"]> {
  return updateGlobalShortcuts(shortcuts);
}
