import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  FolderSettings as FolderCog,
  FolderOpen,
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
  describeInvokeError,
  getSaveDirectory,
  resetSaveDirectory,
  setSaveDirectory,
  updateGlobalShortcuts,
} from "../../lib/tauri";
import { captureCursor, onScreenCursor } from "../../lib/cursor";
import { ToolbarConfiguration } from "./ToolbarConfiguration";

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

export function SettingsView(): React.JSX.Element {
  const { settings, updateSettings } = useSnaphubSettings();
  const [customColor, setCustomColor] = useState("#8b5cf6");
  const [recordingShortcut, setRecordingShortcut] = useState<ShortcutField | null>(null);
  const [shortcutMessage, setShortcutMessage] = useState<string | null>(null);
  const [saveDirectory, setSaveDirectoryState] = useState("Pictures\\Capkit");
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [choosingDirectory, setChoosingDirectory] = useState(false);

  useEffect(() => {
    void getSaveDirectory()
      .then(setSaveDirectoryState)
      .catch((error: unknown) => setStorageMessage(describeInvokeError(error, "Save location could not be loaded")));
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void import("@tauri-apps/plugin-autostart")
      .then(({ isEnabled }) => isEnabled())
      .then((enabled) => {
        if (enabled !== settings.openAtStartup) updateSettings({ ...settings, openAtStartup: enabled });
      })
      .catch((error: unknown) => console.error("SH-AUTOSTART-READ-001", error));
  }, []);

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

  async function toggleAutostart(enabled: boolean): Promise<void> {
    update({ ...settings, openAtStartup: enabled });
    if (!isTauri()) return;
    try {
      const plugin = await import("@tauri-apps/plugin-autostart");
      if (enabled) await plugin.enable();
      else await plugin.disable();
    } catch (error: unknown) {
      update({ ...settings, openAtStartup: !enabled });
      console.error("SH-AUTOSTART-WRITE-001", error);
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

  async function resetBehavior(): Promise<void> {
    update({
      ...settings,
      detection: defaultSnaphubSettings.detection,
      openAtStartup: false,
      overlay: defaultSnaphubSettings.overlay,
    });
    if (!isTauri()) return;
    try {
      const plugin = await import("@tauri-apps/plugin-autostart");
      await plugin.disable();
    } catch (error: unknown) {
      console.error("SH-AUTOSTART-RESET-001", error);
    }
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

  return (
    <div className="mx-auto max-w-[960px] px-7 pb-12 pt-7">
      <header className="mb-6 flex items-end justify-between border-b border-stone-300/80 pb-5 dark:border-white/10">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">Preferences</p>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] text-[#171815] dark:text-stone-100">Make capture feel like yours</h1>
          <p className="mt-1.5 max-w-2xl text-xs leading-5 text-stone-500 dark:text-stone-400">Start with the essentials. Advanced controls stay grouped where they affect your workflow.</p>
            </div>
        <div className="mb-0.5 flex items-center gap-1.5 text-[12px] font-medium text-stone-500 dark:text-stone-400"><Check aria-hidden="true" className="text-emerald-600" size={13} />Saved locally</div>
      </header>

      <div>
        <SettingsSection icon={Palette} eyebrow="Capture style" title="Colors & default size" description="Pick up to five colors to keep one click away while annotating.">
          <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
            <div>
              <div className="mb-2.5 flex items-center justify-between"><FieldLabel>Quick colors</FieldLabel><span className="text-[12px] tabular-nums text-stone-400 dark:text-stone-500">{settings.palette.length} / 5 selected</span></div>
              <div className="flex flex-wrap gap-2">
                {[...neonColors, ...settings.customColors].filter((color, index, colors) => colors.indexOf(color) === index).map((color) => {
                  const selected = settings.palette.includes(color);
                  return <ColorButton color={color} key={color} label={`${selected ? "Remove" : "Add"} ${color}`} selected={selected} disabled={!selected && settings.palette.length === 5} onClick={() => togglePalette(color)} />;
                })}
                <label className="relative grid size-8 cursor-pointer place-items-center rounded-full border border-dashed border-stone-400 bg-white text-stone-500 transition hover:border-stone-700 hover:text-stone-800 dark:border-stone-600 dark:bg-[#30312e] dark:hover:border-stone-400 dark:hover:text-stone-200" aria-label="Choose a custom color">
                  <Plus aria-hidden="true" size={15} />
                  <input className="absolute inset-0 cursor-pointer opacity-0" type="color" value={customColor} onChange={(event) => setCustomColor(event.currentTarget.value)} />
                </label>
                <button aria-label="Add custom color" className="rounded-md border border-stone-300 bg-white px-2.5 text-[13px] font-medium text-stone-600 transition hover:border-stone-400 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-[var(--snaphub-accent)] dark:border-white/10 dark:bg-[#30312e] dark:text-stone-300 dark:hover:border-white/20 dark:hover:text-white" type="button" onClick={addCustomColor}>Add custom</button>
           </div>
              {settings.palette.length === 5 ? <p className="mt-2 text-[12px] text-stone-400 dark:text-stone-500">Remove one color before adding another.</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><FieldLabel>Default color</FieldLabel><ColorSelect colors={settings.palette} value={settings.annotation.defaultColor} onChange={(defaultColor) => update({ ...settings, annotation: { ...settings.annotation, defaultColor } })} /></div>
              <label className="block"><FieldLabel>Default size</FieldLabel><div className="mt-1.5 flex h-9 items-center gap-2.5 rounded-md border border-stone-300 bg-white px-2.5 dark:border-white/10 dark:bg-[#30312e]"><input aria-label="Default annotation size" className="min-w-0 flex-1 accent-[var(--snaphub-accent)]" max="24" min="1" type="range" value={settings.annotation.defaultSize} onChange={(event) => update({ ...settings, annotation: { ...settings.annotation, defaultSize: Number(event.currentTarget.value) } })} /><span className="w-8 text-right font-mono text-[12px] font-semibold text-stone-600 dark:text-stone-300">{settings.annotation.defaultSize}px</span></div></label>
            </div>
          </div>
          <SectionReset onClick={() => update({ ...settings, palette: defaultSnaphubSettings.palette, customColors: [], annotation: defaultSnaphubSettings.annotation })} />
        </SettingsSection>

        <SettingsSection icon={Paintbrush} eyebrow="Identity" title="Theme accent" description="Used for active tools, focus states, selection handles, and new annotations.">
          <div className="flex flex-wrap gap-2">{accentColors.map((color) => <ColorButton color={color} key={color} label={`Use ${color} as theme accent`} selected={settings.accentColor === color} onClick={() => update({ ...settings, accentColor: color })} />)}</div>
          <SectionReset onClick={() => update({ ...settings, accentColor: defaultSnaphubSettings.accentColor })} />
        </SettingsSection>

        <SettingsSection icon={SlidersHorizontal} eyebrow="Capture toolbar" title="Choose what stays within reach" description="Use direct tools for speed, or build ordered groups around your workflow.">
          <ToolbarConfiguration toolbar={settings.toolbar} onChange={(toolbar) => update({ ...settings, toolbar })} />
          <SectionReset onClick={() => update({ ...settings, toolbar: defaultSnaphubSettings.toolbar })} />
        </SettingsSection>

        <SettingsSection icon={Keyboard} eyebrow="Keyboard" title="Shortcuts" description="Click a shortcut, then press the key combination you want. Escape cancels recording.">
          <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white dark:divide-white/8 dark:border-white/10 dark:bg-[#2b2c29]">
            <ShortcutRow label="Start capture" description="Open the selection overlay" value={settings.shortcuts.capture} defaultValue={defaultSnaphubSettings.shortcuts.capture} recording={recordingShortcut === "capture"} onRecord={() => setRecordingShortcut("capture")} onReset={() => void resetShortcut("capture")} />
            <ShortcutRow label="Capture & copy" description="Capture, then place the result on your clipboard" value={settings.shortcuts.captureAndCopy} defaultValue={defaultSnaphubSettings.shortcuts.captureAndCopy} recording={recordingShortcut === "captureAndCopy"} onRecord={() => setRecordingShortcut("captureAndCopy")} onReset={() => void resetShortcut("captureAndCopy")} />
            <ShortcutRow label="Capture & save" description="Capture, then save using your default location" value={settings.shortcuts.captureAndSave} defaultValue={defaultSnaphubSettings.shortcuts.captureAndSave} recording={recordingShortcut === "captureAndSave"} onRecord={() => setRecordingShortcut("captureAndSave")} onReset={() => void resetShortcut("captureAndSave")} />
            <ShortcutRow label="Start recording" description="Open the recorder, ready to choose a source and record" value={settings.shortcuts.recordToggle} defaultValue={defaultSnaphubSettings.shortcuts.recordToggle} recording={recordingShortcut === "recordToggle"} onRecord={() => setRecordingShortcut("recordToggle")} onReset={() => void resetShortcut("recordToggle")} />
          </div>
           <div className="mt-3 rounded-lg border border-stone-200 bg-white dark:border-white/10 dark:bg-[#2b2c29]">
             <div className="border-b border-stone-200 px-3 py-2.5 dark:border-white/8">
               <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-stone-400 dark:text-stone-500">While in capture mode</p>
               <p className="mt-0.5 text-[12px] text-stone-500 dark:text-stone-400">Single keys work only after a region is selected. They never change your global shortcuts.</p>
             </div>
              <ShortcutRow label="Copy selection" description="Copy the edited capture and exit" value={settings.shortcuts.captureModeCopy} defaultValue={defaultSnaphubSettings.shortcuts.captureModeCopy} recording={recordingShortcut === "captureModeCopy"} onRecord={() => setRecordingShortcut("captureModeCopy")} onReset={() => void resetShortcut("captureModeCopy")} />
              <ShortcutRow label="Copy & Save selection" description="Copy and save the edited capture, then exit" value={settings.shortcuts.captureModeCopyAndSave} defaultValue={defaultSnaphubSettings.shortcuts.captureModeCopyAndSave} recording={recordingShortcut === "captureModeCopyAndSave"} onRecord={() => setRecordingShortcut("captureModeCopyAndSave")} onReset={() => void resetShortcut("captureModeCopyAndSave")} />
              <ShortcutRow label="Save selection" description="Save the edited capture and exit" value={settings.shortcuts.captureModeSave} defaultValue={defaultSnaphubSettings.shortcuts.captureModeSave} recording={recordingShortcut === "captureModeSave"} onRecord={() => setRecordingShortcut("captureModeSave")} onReset={() => void resetShortcut("captureModeSave")} />
           </div>
           {shortcutMessage === null ? null : <p aria-live="polite" className="mt-2.5 text-[12px] text-stone-500 dark:text-stone-400">{shortcutMessage}</p>}
          <SectionReset onClick={() => void resetShortcuts()} />
        </SettingsSection>

        <SettingsSection icon={Presentation} eyebrow="Presentation" title="On-screen toolbar" description="Toggle a temporary drawing layer over the monitor under your pointer. Press the same global shortcut or Escape to leave instantly.">
          <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white dark:divide-white/8 dark:border-white/10 dark:bg-[#2b2c29]">
            <ShortcutRow label="Toggle on-screen toolbar" description="Enter or leave presentation drawing mode" value={settings.shortcuts.onScreenToggle} defaultValue={defaultSnaphubSettings.shortcuts.onScreenToggle} recording={recordingShortcut === "onScreenToggle"} onRecord={() => setRecordingShortcut("onScreenToggle")} onReset={() => void resetShortcut("onScreenToggle")} />
          </div>
          <div className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white dark:divide-white/8 dark:border-white/10 dark:bg-[#2b2c29]">
            <div className="px-3 py-3">
              <ToggleField label="Keep desktop live" description="Continue animations and screen updates beneath your drawings. Turn this off to annotate a frozen frame." checked={settings.onScreen.liveDesktop} onChange={(liveDesktop) => update({ ...settings, onScreen: { ...settings.onScreen, liveDesktop } })} />
            </div>
            <div className="px-3 py-3">
              <ToggleField label="Keep drawings between toggles" description="Restore persistent annotations when you leave and reopen Screen Draw mode" checked={settings.onScreen.persistDrawings} onChange={(persistDrawings) => update({ ...settings, onScreen: { ...settings.onScreen, persistDrawings } })} />
            </div>
          </div>
          <div className="mt-5">
            <div>
              <FieldLabel>Drawing appearance</FieldLabel>
              <p className="mt-0.5 text-[12px] leading-4 text-stone-500 dark:text-stone-400">Set these once here. The presentation dock stays clear of color and size controls.</p>
            </div>
            <div className="mt-2.5 grid gap-3 rounded-lg border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-[#2b2c29] lg:grid-cols-[1.2fr_1fr_1fr]">
              <div>
                <FieldLabel>Color</FieldLabel>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input aria-label="Custom on-screen drawing color" className="size-8 cursor-pointer rounded-md border border-stone-300 bg-white p-1 dark:border-white/10 dark:bg-[#333431]" type="color" value={settings.onScreen.color} onChange={(event) => update({ ...settings, onScreen: { ...settings.onScreen, color: event.currentTarget.value } })} />
                  {neonColors.slice(0, 8).map((color) => (
                    <button aria-label={`Use ${color} for on-screen drawing`} aria-pressed={settings.onScreen.color.toLowerCase() === color.toLowerCase()} className="grid size-7 place-items-center rounded-full outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-pressed:ring-2 aria-pressed:ring-stone-900 aria-pressed:ring-offset-2 dark:aria-pressed:ring-white dark:aria-pressed:ring-offset-[#2b2c29]" key={color} type="button" onClick={() => update({ ...settings, onScreen: { ...settings.onScreen, color } })}>
                      <span className="size-5 rounded-full border border-black/15" style={{ backgroundColor: color }} />
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="flex items-center justify-between gap-3">
                  <FieldLabel>Stroke width</FieldLabel>
                  <span className="font-mono text-[11px] text-stone-500 dark:text-stone-400">{settings.onScreen.strokeSize}px</span>
                </span>
                <input aria-label="On-screen stroke width" className="mt-3 w-full accent-[var(--snaphub-accent)]" max="18" min="1" type="range" value={settings.onScreen.strokeSize} onChange={(event) => update({ ...settings, onScreen: { ...settings.onScreen, strokeSize: Number(event.currentTarget.value) } })} />
              </label>
              <label className="block">
                <span className="flex items-center justify-between gap-3">
                  <FieldLabel>Spotlight size</FieldLabel>
                  <span className="font-mono text-[11px] text-stone-500 dark:text-stone-400">{settings.onScreen.spotlightSize}px</span>
                </span>
                <input aria-label="On-screen spotlight size" className="mt-3 w-full accent-[var(--snaphub-accent)]" max="360" min="80" step="10" type="range" value={settings.onScreen.spotlightSize} onChange={(event) => update({ ...settings, onScreen: { ...settings.onScreen, spotlightSize: Number(event.currentTarget.value) } })} />
              </label>
            </div>
          </div>
          <div className="mt-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <FieldLabel>Number keys</FieldLabel>
                <p className="mt-0.5 text-[12px] leading-4 text-stone-500 dark:text-stone-400">Assign 0–9 once each. The number appears on the matching dock tool.</p>
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-stone-400">While active</span>
            </div>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {configurableOnScreenToolIds.map((tool) => (
                <label className="flex items-center gap-3 rounded-md border border-stone-200 bg-white/60 px-3 py-2 dark:border-white/8 dark:bg-white/[0.025]" key={tool}>
                  <span className="min-w-0 flex-1 text-[13px] font-semibold text-stone-700 dark:text-stone-300">{onScreenToolLabels[tool]}</span>
                  <select aria-label={`Shortcut for ${onScreenToolLabels[tool]}`} className="h-7 w-16 rounded border border-stone-300 bg-white px-2 font-mono text-[12px] text-stone-700 outline-none focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:border-white/10 dark:bg-[#333431] dark:text-stone-200" value={settings.onScreen.toolShortcuts[tool]} onChange={(event) => updateOnScreenToolShortcut(tool, event.currentTarget.value)}>
                    <option value="">Off</option>
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((key) => <option key={key} value={key}>{key}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <div className="mt-5">
            <FieldLabel>On-screen cursor</FieldLabel>
            <p className="mt-0.5 text-[12px] leading-4 text-stone-500 dark:text-stone-400">Hover a choice to preview the exact cursor used on the presentation layer.</p>
            <div className="mt-2.5 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {(["ring", "laser", "precision", "crosshair"] as const).map((style) => {
                const preview = onScreenCursor({ style, size: settings.onScreen.cursor.size }, settings.accentColor);
                return <button aria-label={`Use ${style} on-screen cursor`} aria-pressed={settings.onScreen.cursor.style === style} className="rounded-lg border border-stone-200 bg-white p-2.5 text-left outline-none transition hover:border-stone-400 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-pressed:border-stone-700 aria-pressed:bg-stone-50 dark:border-white/10 dark:bg-[#2b2c29] dark:hover:border-white/20 dark:aria-pressed:border-stone-500 dark:aria-pressed:bg-white/6" key={style} style={{ cursor: preview }} type="button" onClick={() => update({ ...settings, onScreen: { ...settings.onScreen, cursor: { ...settings.onScreen.cursor, style } } })}><span className="block text-[13px] font-semibold capitalize">{style}</span><span className="mt-1 block text-[11px] text-stone-400">Hover to preview</span></button>;
              })}
            </div>
            <div className="mt-3 max-w-xs">
              <FieldLabel>Cursor size</FieldLabel>
              <div className="mt-1.5 grid grid-cols-3 rounded-md border border-stone-300 bg-white p-1 dark:border-white/10 dark:bg-[#2b2c29]">
                {(["small", "medium", "large"] as const).map((size) => <button aria-label={`Use ${size} on-screen cursor`} aria-pressed={settings.onScreen.cursor.size === size} className="rounded px-2.5 py-1.5 text-[12px] font-semibold capitalize text-stone-500 outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-pressed:bg-stone-900 aria-pressed:text-white dark:text-stone-400 dark:hover:text-white dark:aria-pressed:bg-white/10" key={size} type="button" onClick={() => update({ ...settings, onScreen: { ...settings.onScreen, cursor: { ...settings.onScreen.cursor, size } } })}>{size}</button>)}
              </div>
            </div>
          </div>
          <SectionReset onClick={() => void resetOnScreenSettings()} />
        </SettingsSection>

        <SettingsSection icon={FolderCog} eyebrow="Storage" title="Saved captures" description="Choose one predictable location for toolbar saves, scrolling captures, pinned-image saves, and Capture & save.">
          <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-3 py-3 dark:border-white/10 dark:bg-[#2b2c29]">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-500 dark:bg-white/6 dark:text-stone-400"><FolderOpen aria-hidden="true" size={15} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-stone-800 dark:text-stone-200">Default save location</p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-stone-500 dark:text-stone-400" title={saveDirectory}>{saveDirectory}</p>
            </div>
            <button aria-label="Choose default save location" className="shrink-0 rounded-md border border-stone-300 bg-stone-50 px-3 py-1.5 text-[12px] font-semibold text-stone-700 outline-none transition hover:border-stone-500 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-[#333431] dark:text-stone-300 dark:hover:border-white/20" disabled={choosingDirectory} type="button" onClick={() => void chooseSaveDirectory()}>{choosingDirectory ? "Opening…" : "Choose folder"}</button>
          </div>
          {storageMessage === null ? null : <p aria-live="polite" className="mt-2 text-[12px] text-stone-500 dark:text-stone-400">{storageMessage}</p>}
          <SectionReset onClick={() => void resetStorage()} />
        </SettingsSection>

        <SettingsSection icon={GalleryVerticalEnd} eyebrow="Scrolling" title="Default capture method" description="Skip the chooser for your usual workflow, or ask every time.">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Default scrolling capture method">
            {([
              ["automatic", "Automatic", "Scroll and stitch immediately"],
              ["manual", "Manual", "You advance every frame"],
              ["choose", "Always ask", "Show the method chooser"],
            ] as const).map(([value, label, description]) => (
              <button aria-label={`Use ${label} scrolling capture`} aria-checked={settings.scrolling.defaultMode === value} className="rounded-lg border border-stone-200 bg-white p-3 text-left outline-none transition hover:border-stone-400 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-checked:border-stone-700 aria-checked:bg-stone-50 dark:border-white/10 dark:bg-[#2b2c29] dark:hover:border-white/20 dark:aria-checked:border-[var(--snaphub-accent)]/55 dark:aria-checked:bg-white/5" key={value} role="radio" type="button" onClick={() => update({ ...settings, scrolling: { defaultMode: value } })}><span className="block text-[13px] font-semibold text-stone-800 dark:text-stone-200">{label}</span><span className="mt-1 block text-[11px] leading-4 text-stone-500 dark:text-stone-400">{description}</span></button>
            ))}
          </div>
          <SectionReset onClick={() => update({ ...settings, scrolling: defaultSnaphubSettings.scrolling })} />
        </SettingsSection>

        <SettingsSection icon={ScanSearch} eyebrow="Behavior" title="Detection & overlay" description="Tune what Capkit recognizes and how the frozen screen is shaded.">
          <div className="grid gap-x-7 gap-y-4 lg:grid-cols-2">
            <ToggleField label="Detect windows" description="Highlight app windows as you hover" checked={settings.detection.windows} onChange={(windows) => update({ ...settings, detection: { ...settings.detection, windows } })} />
            <ToggleField label="Detect controls inside windows" description="Use Windows accessibility metadata in supported apps; custom canvas regions are ignored" checked={settings.detection.uiRegions} onChange={(uiRegions) => update({ ...settings, detection: { ...settings.detection, uiRegions } })} />
          <ToggleField label="Open at startup" description="Keep Capkit ready in the system tray" checked={settings.openAtStartup} onChange={(enabled) => void toggleAutostart(enabled)} />
            <div><FieldLabel>Overlay tint</FieldLabel><div className="mt-1.5 flex items-center gap-2.5"><input aria-label="Overlay tint color" className="size-9 cursor-pointer rounded-md border border-stone-300 bg-white p-1 dark:border-white/10 dark:bg-[#30312e]" type="color" value={settings.overlay.color} onChange={(event) => update({ ...settings, overlay: { ...settings.overlay, color: event.currentTarget.value } })} /><input aria-label="Overlay tint strength" className="min-w-0 flex-1 accent-[var(--snaphub-accent)]" max="85" min="15" type="range" value={Math.round(settings.overlay.opacity * 100)} onChange={(event) => update({ ...settings, overlay: { ...settings.overlay, opacity: Number(event.currentTarget.value) / 100 } })} /><span className="w-8 font-mono text-[12px] text-stone-500 dark:text-stone-400">{Math.round(settings.overlay.opacity * 100)}%</span><InlineResetButton label="Reset overlay tint" disabled={settings.overlay.color === defaultSnaphubSettings.overlay.color && settings.overlay.opacity === defaultSnaphubSettings.overlay.opacity} onClick={() => update({ ...settings, overlay: defaultSnaphubSettings.overlay })} /></div></div>
          </div>
          <SectionReset onClick={() => void resetBehavior()} />
        </SettingsSection>

        <SettingsSection icon={MousePointer2} eyebrow="Pointer" title="Capture cursor" description="Only changes the precision cursor used over the frozen screen.">
          <ToggleField label="Use Capkit drawing cursor" description="Turn off to use the standard system crosshair" checked={settings.cursor.enabled} onChange={(enabled) => update({ ...settings, cursor: { ...settings.cursor, enabled } })} />
          <div className="mt-4 grid grid-cols-3 gap-2">{(["crosshair", "target", "precision"] as const).map((cursorStyle) => { const previewCursor = captureCursor({ enabled: true, style: cursorStyle, size: settings.cursor.size }, settings.accentColor); return <button aria-label={`Use ${cursorStyle} cursor`} aria-pressed={settings.cursor.style === cursorStyle} className="group rounded-lg border border-stone-200 bg-white p-2.5 text-left outline-none transition hover:border-stone-400 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-pressed:border-stone-700 aria-pressed:bg-stone-50 dark:border-white/10 dark:bg-[#2b2c29] dark:hover:border-white/20 dark:aria-pressed:border-stone-500 dark:aria-pressed:bg-white/6" key={cursorStyle} style={{ cursor: previewCursor }} type="button" onClick={() => update({ ...settings, cursor: { ...settings.cursor, style: cursorStyle } })}><span className="block text-xs font-semibold capitalize">{cursorStyle}</span><span className="mt-1 block text-[11px] text-stone-400 transition-colors group-hover:text-stone-600 dark:text-stone-500 dark:group-hover:text-stone-300">Hover to preview</span></button>; })}</div>
          <div className="mt-4 max-w-xs"><FieldLabel>Cursor size</FieldLabel><div className="mt-1.5 grid grid-cols-3 rounded-md border border-stone-300 bg-white p-1 dark:border-white/10 dark:bg-[#2b2c29]">{(["small", "medium", "large"] as const).map((size) => <button aria-label={`Use ${size} cursor`} aria-pressed={settings.cursor.size === size} className="rounded px-2.5 py-1.5 text-[12px] font-semibold capitalize text-stone-500 outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-pressed:bg-stone-900 aria-pressed:text-white dark:text-stone-400 dark:hover:text-white dark:aria-pressed:bg-white/10" key={size} type="button" onClick={() => update({ ...settings, cursor: { ...settings.cursor, size } })}>{size}</button>)}</div></div>
          <SectionReset onClick={() => update({ ...settings, cursor: defaultSnaphubSettings.cursor })} />
        </SettingsSection>
      </div>
    </div>
  );
}

type SettingsSectionProps = { icon: typeof Palette; eyebrow: string; title: string; description: string; children: React.ReactNode };
function SettingsSection({ icon: Icon, eyebrow, title, description, children }: SettingsSectionProps): React.JSX.Element {
  return <section className="border-b border-stone-300/80 py-6 first:pt-0 dark:border-white/10"><div className="mb-4 flex gap-2.5"><div className="grid size-8 shrink-0 place-items-center rounded-md border border-stone-200 bg-white text-stone-600 dark:border-white/10 dark:bg-[#30312e] dark:text-stone-300"><Icon aria-hidden="true" size={15} /></div><div><p className="text-[11px] font-bold uppercase tracking-[0.17em] text-stone-400 dark:text-stone-500">{eyebrow}</p><h2 className="mt-0.5 text-sm font-semibold tracking-tight dark:text-stone-100">{title}</h2><p className="mt-0.5 text-[13px] leading-4.5 text-stone-500 dark:text-stone-400">{description}</p></div></div>{children}</section>;
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
        className="flex h-9 w-full items-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-left font-mono text-[12px] text-stone-700 outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-[var(--snaphub-accent)]/35 dark:border-white/10 dark:bg-[#30312e] dark:text-stone-200"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="size-3.5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: value }} />
        <span className="flex-1">{value.toUpperCase()}</span>
        <ChevronDown aria-hidden="true" className={`text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} size={13} />
      </button>
      {open ? (
        <ul
          aria-label="Available annotation colors"
          className="absolute inset-x-0 top-[calc(100%+4px)] z-40 overflow-hidden rounded-md border border-stone-300 bg-white py-1 shadow-lg dark:border-white/12 dark:bg-[#333431]"
          id={listboxId}
          role="listbox"
        >
          {colors.map((color) => (
            <li key={color} role="none">
              <button
                aria-selected={value === color}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[12px] text-stone-600 outline-none hover:bg-stone-100 focus-visible:bg-stone-100 aria-selected:bg-stone-100 aria-selected:text-stone-900 dark:text-stone-300 dark:hover:bg-white/7 dark:focus-visible:bg-white/7 dark:aria-selected:bg-white/8 dark:aria-selected:text-white"
                role="option"
                type="button"
                onClick={() => {
                  onChange(color);
                  setOpen(false);
                }}
              >
                <span className="size-3.5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: color }} />
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

function FieldLabel({ children }: { children: React.ReactNode }): React.JSX.Element { return <span className="text-[13px] font-semibold text-stone-700 dark:text-stone-300">{children}</span>; }

type ColorButtonProps = { color: string; label: string; selected: boolean; disabled?: boolean; onClick: () => void };
function ColorButton({ color, label, selected, disabled = false, onClick }: ColorButtonProps): React.JSX.Element { return <button aria-label={label} aria-pressed={selected} className="relative grid size-8 place-items-center rounded-full border border-black/10 outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 dark:focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-35" disabled={disabled} style={{ backgroundColor: color }} type="button" onClick={onClick}>{selected ? <Check aria-hidden="true" className={color === "#ffffff" || color === "#d9ff43" || color === "#39ff88" || color === "#39e7ff" ? "text-stone-900" : "text-white"} size={13} strokeWidth={3} /> : null}</button>; }

function SectionReset({ onClick }: { onClick: () => void }): React.JSX.Element { return <div className="mt-4 border-t border-stone-200 pt-3 dark:border-white/8"><button aria-label="Reset this section" className="flex items-center gap-1.5 text-[12px] font-medium text-stone-500 outline-none transition hover:text-stone-900 focus-visible:text-stone-900 dark:text-stone-500 dark:hover:text-stone-200 dark:focus-visible:text-white" type="button" onClick={onClick}><RotateCcw aria-hidden="true" size={11} />Reset this section</button></div>; }

type ToggleFieldProps = { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void };
function ToggleField({ label, description, checked, onChange }: ToggleFieldProps): React.JSX.Element { return <label className="flex cursor-pointer items-start justify-between gap-3"><span><span className="block text-xs font-semibold text-stone-800 dark:text-stone-200">{label}</span>{description === "" ? null : <span className="mt-0.5 block text-[12px] leading-4 text-stone-500 dark:text-stone-400">{description}</span>}</span><span className="relative mt-0.5 shrink-0"><input aria-label={label} checked={checked} className="peer sr-only" role="switch" type="checkbox" onChange={(event) => onChange(event.currentTarget.checked)} /><span className="block h-5 w-9 rounded-full bg-stone-300 transition peer-checked:bg-[var(--snaphub-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-stone-900 peer-focus-visible:ring-offset-2 dark:bg-stone-700 dark:peer-focus-visible:ring-white" /><span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4 peer-checked:bg-[#171815]" /></span></label>; }

type ShortcutRowProps = { label: string; description: string; value: string; defaultValue: string; recording: boolean; onRecord: () => void; onReset: () => void };
function ShortcutRow({ label, description, value, defaultValue, recording, onRecord, onReset }: ShortcutRowProps): React.JSX.Element { return <div className="flex items-center gap-2 px-3 py-2.5"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-stone-800 dark:text-stone-200">{label}</p><p className="mt-0.5 text-[12px] text-stone-500 dark:text-stone-400">{description}</p></div><button aria-label={`Configure ${label}`} aria-pressed={recording} className="min-w-32 rounded-md border border-stone-300 bg-stone-50 px-2.5 py-1.5 font-mono text-[12px] font-semibold text-stone-700 outline-none transition hover:border-stone-500 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] aria-pressed:border-stone-900 aria-pressed:bg-stone-900 aria-pressed:text-white dark:border-white/10 dark:bg-[#333431] dark:text-stone-300 dark:hover:border-white/20 dark:aria-pressed:bg-white/10" type="button" onClick={onRecord}>{recording ? "Press shortcut…" : value}</button><InlineResetButton label={`Reset ${label} shortcut`} disabled={value === defaultValue && !recording} onClick={onReset} /></div>; }

type InlineResetButtonProps = { label: string; disabled: boolean; onClick: () => void };
function InlineResetButton({ label, disabled, onClick }: InlineResetButtonProps): React.JSX.Element { return <button aria-label={label} className="flex h-7 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-stone-400 outline-none transition hover:bg-stone-100 hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] dark:text-stone-500 dark:hover:bg-white/7 dark:hover:text-stone-200 disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent" disabled={disabled} title={label} type="button" onClick={onClick}><RotateCcw aria-hidden="true" size={11} />Reset</button>; }

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
