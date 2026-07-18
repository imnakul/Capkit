import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  Check,
  ChevronDown,
  Crosshair,
  Keyboard,
  MousePointer2,
  Paintbrush,
  Palette,
  Plus,
  RotateCcw,
  ScanSearch,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  defaultShotHubSettings,
  type ShotHubSettings,
  parseEffectDefault,
  parseShapeDefault,
  useShotHubSettings,
} from "../../domain/settings";

const neonColors = ["#d9ff43", "#39ff88", "#39e7ff", "#7c5cff", "#ff4fd8", "#ff5b4d", "#ffb547", "#ffffff", "#171717"] as const;
const accentColors = ["#d9ff43", "#39ff88", "#39e7ff", "#7c5cff", "#ff4fd8", "#ffb547"] as const;

type ShortcutField = keyof ShotHubSettings["shortcuts"];

export function SettingsView(): React.JSX.Element {
  const { settings, updateSettings } = useShotHubSettings();
  const [customColor, setCustomColor] = useState("#8b5cf6");
  const [recordingShortcut, setRecordingShortcut] = useState<ShortcutField | null>(null);
  const [shortcutMessage, setShortcutMessage] = useState<string | null>(null);

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
      const value = formatShortcut(event);
      setRecordingShortcut(null);
      setShortcutMessage(null);
      if (activeShortcut === "capture" && isTauri()) {
        void invoke<string>("update_global_shortcut", { shortcut: value })
          .then((registered) => {
            updateSettings({ ...settings, shortcuts: { ...settings.shortcuts, capture: registered } });
            setShortcutMessage("Capture shortcut updated");
          })
          .catch((error: unknown) => setShortcutMessage(String(error)));
        return;
      }
      updateSettings({ ...settings, shortcuts: { ...settings.shortcuts, [activeShortcut]: value } });
      setShortcutMessage("Shortcut saved");
    }
    window.addEventListener("keydown", record, true);
    return (): void => window.removeEventListener("keydown", record, true);
  }, [recordingShortcut, settings, updateSettings]);

  function update(next: ShotHubSettings): void {
    updateSettings(next);
  }

  function togglePalette(color: string): void {
    const selected = settings.palette.includes(color);
    if (selected && settings.palette.length === 1) return;
    if (!selected && settings.palette.length === 5) return;
    const palette = selected ? settings.palette.filter((item) => item !== color) : [...settings.palette, color];
    const defaultColor = palette.includes(settings.annotation.defaultColor) ? settings.annotation.defaultColor : (palette[0] ?? defaultShotHubSettings.annotation.defaultColor);
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
    if (!isTauri()) {
      update({ ...settings, shortcuts: defaultShotHubSettings.shortcuts });
      setShortcutMessage("Shortcuts reset");
      return;
    }
    try {
      const registered = await invoke<string>("update_global_shortcut", {
        shortcut: defaultShotHubSettings.shortcuts.capture,
      });
      update({
        ...settings,
        shortcuts: { ...defaultShotHubSettings.shortcuts, capture: registered },
      });
      setShortcutMessage("Shortcuts reset");
    } catch (error: unknown) {
      setShortcutMessage(String(error));
    }
  }

  async function resetShortcut(field: ShortcutField): Promise<void> {
    const defaultValue = defaultShotHubSettings.shortcuts[field];
    if (field === "capture" && isTauri()) {
      try {
        const registered = await invoke<string>("update_global_shortcut", {
          shortcut: defaultValue,
        });
        update({
          ...settings,
          shortcuts: { ...settings.shortcuts, capture: registered },
        });
        setShortcutMessage("Start capture shortcut reset");
      } catch (error: unknown) {
        setShortcutMessage(String(error));
      }
      return;
    }
    update({
      ...settings,
      shortcuts: { ...settings.shortcuts, [field]: defaultValue },
    });
    setShortcutMessage(`${field === "captureAndCopy" ? "Capture & copy" : "Capture & save"} shortcut reset`);
  }

  async function resetBehavior(): Promise<void> {
    update({
      ...settings,
      detection: defaultShotHubSettings.detection,
      openAtStartup: false,
      overlay: defaultShotHubSettings.overlay,
    });
    if (!isTauri()) return;
    try {
      const plugin = await import("@tauri-apps/plugin-autostart");
      await plugin.disable();
    } catch (error: unknown) {
      console.error("SH-AUTOSTART-RESET-001", error);
    }
  }

  return (
    <div className="mx-auto max-w-[960px] px-7 pb-12 pt-7">
      <header className="mb-6 flex items-end justify-between border-b border-stone-300/80 pb-5 dark:border-white/10">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">Preferences</p>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] text-[#171815] dark:text-stone-100">Make capture feel like yours</h1>
          <p className="mt-1.5 max-w-2xl text-xs leading-5 text-stone-500 dark:text-stone-400">Start with the essentials. Advanced controls stay grouped where they affect your workflow.</p>
        </div>
        <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-medium text-stone-500 dark:text-stone-400"><Check aria-hidden="true" className="text-emerald-600" size={13} />Saved locally</div>
      </header>

      <div>
        <SettingsSection icon={Palette} eyebrow="Capture style" title="Colors & default size" description="Pick up to five colors to keep one click away while annotating.">
          <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
            <div>
              <div className="mb-2.5 flex items-center justify-between"><FieldLabel>Quick colors</FieldLabel><span className="text-[10px] tabular-nums text-stone-400 dark:text-stone-500">{settings.palette.length} / 5 selected</span></div>
              <div className="flex flex-wrap gap-2">
                {[...neonColors, ...settings.customColors].filter((color, index, colors) => colors.indexOf(color) === index).map((color) => {
                  const selected = settings.palette.includes(color);
                  return <ColorButton color={color} key={color} label={`${selected ? "Remove" : "Add"} ${color}`} selected={selected} disabled={!selected && settings.palette.length === 5} onClick={() => togglePalette(color)} />;
                })}
                <label className="relative grid size-8 cursor-pointer place-items-center rounded-full border border-dashed border-stone-400 bg-white text-stone-500 transition hover:border-stone-700 hover:text-stone-800 dark:border-stone-600 dark:bg-[#30312e] dark:hover:border-stone-400 dark:hover:text-stone-200" aria-label="Choose a custom color">
                  <Plus aria-hidden="true" size={15} />
                  <input className="absolute inset-0 cursor-pointer opacity-0" type="color" value={customColor} onChange={(event) => setCustomColor(event.currentTarget.value)} />
                </label>
                <button aria-label="Add custom color" className="rounded-md border border-stone-300 bg-white px-2.5 text-[11px] font-medium text-stone-600 transition hover:border-stone-400 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-[var(--shothub-accent)] dark:border-white/10 dark:bg-[#30312e] dark:text-stone-300 dark:hover:border-white/20 dark:hover:text-white" type="button" onClick={addCustomColor}>Add custom</button>
              </div>
              {settings.palette.length === 5 ? <p className="mt-2 text-[10px] text-stone-400 dark:text-stone-500">Remove one color before adding another.</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><FieldLabel>Default color</FieldLabel><ColorSelect colors={settings.palette} value={settings.annotation.defaultColor} onChange={(defaultColor) => update({ ...settings, annotation: { ...settings.annotation, defaultColor } })} /></div>
              <label className="block"><FieldLabel>Default size</FieldLabel><div className="mt-1.5 flex h-9 items-center gap-2.5 rounded-md border border-stone-300 bg-white px-2.5 dark:border-white/10 dark:bg-[#30312e]"><input aria-label="Default annotation size" className="min-w-0 flex-1 accent-[var(--shothub-accent)]" max="24" min="1" type="range" value={settings.annotation.defaultSize} onChange={(event) => update({ ...settings, annotation: { ...settings.annotation, defaultSize: Number(event.currentTarget.value) } })} /><span className="w-8 text-right font-mono text-[10px] font-semibold text-stone-600 dark:text-stone-300">{settings.annotation.defaultSize}px</span></div></label>
            </div>
          </div>
          <SectionReset onClick={() => update({ ...settings, palette: defaultShotHubSettings.palette, customColors: [], annotation: defaultShotHubSettings.annotation })} />
        </SettingsSection>

        <SettingsSection icon={Paintbrush} eyebrow="Identity" title="Theme accent" description="Used for active tools, focus states, selection handles, and new annotations.">
          <div className="flex flex-wrap gap-2">{accentColors.map((color) => <ColorButton color={color} key={color} label={`Use ${color} as theme accent`} selected={settings.accentColor === color} onClick={() => update({ ...settings, accentColor: color })} />)}</div>
          <SectionReset onClick={() => update({ ...settings, accentColor: defaultShotHubSettings.accentColor })} />
        </SettingsSection>

        <SettingsSection icon={SlidersHorizontal} eyebrow="Capture toolbar" title="Choose what stays within reach" description="Each enabled family occupies one slot. Choose the tool that opens first in grouped slots.">
          <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white dark:divide-white/8 dark:border-white/10 dark:bg-[#2b2c29]">
            <SlotRow number={1} title="Shapes & markup" description="Rectangle, ellipse, lines, arrows and highlight" enabled={settings.toolbar.shapes} onToggle={(enabled) => update({ ...settings, toolbar: { ...settings.toolbar, shapes: enabled } })}><CompactSelect label="Default shape" value={settings.toolbar.shapeDefault} options={["rectangle", "ellipse", "line", "arrow", "curved-arrow", "highlighter"]} onChange={(value) => update({ ...settings, toolbar: { ...settings.toolbar, shapeDefault: parseShapeDefault(value) } })} /></SlotRow>
            <SlotRow number={2} title="Focus & privacy" description="Blur, spotlight, pixelate and permanent blackout" enabled={settings.toolbar.effects} onToggle={(enabled) => update({ ...settings, toolbar: { ...settings.toolbar, effects: enabled } })}><CompactSelect label="Default effect" value={settings.toolbar.effectDefault} options={["blur", "spotlight", "pixelate", "blackout"]} onChange={(value) => update({ ...settings, toolbar: { ...settings.toolbar, effectDefault: parseEffectDefault(value) } })} /></SlotRow>
            <SlotRow number={3} title="Rotate" description="Rotate the selected image in place" enabled={settings.toolbar.rotate} onToggle={(enabled) => update({ ...settings, toolbar: { ...settings.toolbar, rotate: enabled } })} />
            <SlotRow number={4} title="Counter" description="Number steps and callouts quickly" enabled={settings.toolbar.counter} onToggle={(enabled) => update({ ...settings, toolbar: { ...settings.toolbar, counter: enabled } })} />
            <SlotRow number={5} title="Text" description="Add short labels and notes" enabled={settings.toolbar.text} onToggle={(enabled) => update({ ...settings, toolbar: { ...settings.toolbar, text: enabled } })} />
            <SlotRow number={6} title="Undo & redo" description="Keep history controls visible" enabled={settings.toolbar.history} onToggle={(enabled) => update({ ...settings, toolbar: { ...settings.toolbar, history: enabled } })} />
          </div>
          <SectionReset onClick={() => update({ ...settings, toolbar: defaultShotHubSettings.toolbar })} />
        </SettingsSection>

        <SettingsSection icon={Keyboard} eyebrow="Keyboard" title="Shortcuts" description="Click a shortcut, then press the key combination you want. Escape cancels recording.">
          <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white dark:divide-white/8 dark:border-white/10 dark:bg-[#2b2c29]">
            <ShortcutRow label="Start capture" description="Open the selection overlay" value={settings.shortcuts.capture} defaultValue={defaultShotHubSettings.shortcuts.capture} recording={recordingShortcut === "capture"} onRecord={() => setRecordingShortcut("capture")} onReset={() => void resetShortcut("capture")} />
            <ShortcutRow label="Capture & copy" description="Capture, then place the result on your clipboard" value={settings.shortcuts.captureAndCopy} defaultValue={defaultShotHubSettings.shortcuts.captureAndCopy} recording={recordingShortcut === "captureAndCopy"} onRecord={() => setRecordingShortcut("captureAndCopy")} onReset={() => void resetShortcut("captureAndCopy")} />
            <ShortcutRow label="Capture & save" description="Capture, then save using your default location" value={settings.shortcuts.captureAndSave} defaultValue={defaultShotHubSettings.shortcuts.captureAndSave} recording={recordingShortcut === "captureAndSave"} onRecord={() => setRecordingShortcut("captureAndSave")} onReset={() => void resetShortcut("captureAndSave")} />
          </div>
          {shortcutMessage === null ? null : <p aria-live="polite" className="mt-2.5 text-[10px] text-stone-500 dark:text-stone-400">{shortcutMessage}</p>}
          <SectionReset onClick={() => void resetShortcuts()} />
        </SettingsSection>

        <SettingsSection icon={ScanSearch} eyebrow="Behavior" title="Detection & overlay" description="Tune what ShotHub recognizes and how the frozen screen is shaded.">
          <div className="grid gap-x-7 gap-y-4 lg:grid-cols-2">
            <ToggleField label="Detect windows" description="Highlight app windows as you hover" checked={settings.detection.windows} onChange={(windows) => update({ ...settings, detection: { ...settings.detection, windows } })} />
            <ToggleField label="Detect inner UI regions" description="Recognize panels and rectangular controls when supported" checked={settings.detection.uiRegions} onChange={(uiRegions) => update({ ...settings, detection: { ...settings.detection, uiRegions } })} />
            <ToggleField label="Open at startup" description="Keep ShotHub ready in the system tray" checked={settings.openAtStartup} onChange={(enabled) => void toggleAutostart(enabled)} />
            <div><FieldLabel>Overlay tint</FieldLabel><div className="mt-1.5 flex items-center gap-2.5"><input aria-label="Overlay tint color" className="size-9 cursor-pointer rounded-md border border-stone-300 bg-white p-1 dark:border-white/10 dark:bg-[#30312e]" type="color" value={settings.overlay.color} onChange={(event) => update({ ...settings, overlay: { ...settings.overlay, color: event.currentTarget.value } })} /><input aria-label="Overlay tint strength" className="min-w-0 flex-1 accent-[var(--shothub-accent)]" max="85" min="15" type="range" value={Math.round(settings.overlay.opacity * 100)} onChange={(event) => update({ ...settings, overlay: { ...settings.overlay, opacity: Number(event.currentTarget.value) / 100 } })} /><span className="w-8 font-mono text-[10px] text-stone-500 dark:text-stone-400">{Math.round(settings.overlay.opacity * 100)}%</span><InlineResetButton label="Reset overlay tint" disabled={settings.overlay.color === defaultShotHubSettings.overlay.color && settings.overlay.opacity === defaultShotHubSettings.overlay.opacity} onClick={() => update({ ...settings, overlay: defaultShotHubSettings.overlay })} /></div></div>
          </div>
          <SectionReset onClick={() => void resetBehavior()} />
        </SettingsSection>

        <SettingsSection icon={MousePointer2} eyebrow="Pointer" title="Capture cursor" description="Only changes the precision cursor used over the frozen screen.">
          <ToggleField label="Use ShotHub drawing cursor" description="Turn off to use the standard system crosshair" checked={settings.cursor.enabled} onChange={(enabled) => update({ ...settings, cursor: { ...settings.cursor, enabled } })} />
          <div className="mt-4 grid grid-cols-3 gap-2">{(["crosshair", "target", "precision"] as const).map((cursorStyle) => <button aria-label={`Use ${cursorStyle} cursor`} aria-pressed={settings.cursor.style === cursorStyle} className="flex items-center gap-2.5 rounded-lg border border-stone-200 bg-white p-2.5 text-left outline-none transition hover:border-stone-400 focus-visible:ring-2 focus-visible:ring-[var(--shothub-accent)] aria-pressed:border-stone-700 aria-pressed:bg-stone-50 dark:border-white/10 dark:bg-[#2b2c29] dark:hover:border-white/20 dark:aria-pressed:border-stone-500 dark:aria-pressed:bg-white/6" key={cursorStyle} type="button" onClick={() => update({ ...settings, cursor: { ...settings.cursor, style: cursorStyle } })}><span className="grid size-8 place-items-center rounded-md bg-stone-100 dark:bg-white/7"><Crosshair aria-hidden="true" className={cursorStyle === "target" ? "rounded-full border border-current p-1" : cursorStyle === "precision" ? "rotate-45" : ""} size={17} /></span><span className="text-xs font-semibold capitalize">{cursorStyle}</span></button>)}</div>
          <div className="mt-4 max-w-xs"><FieldLabel>Cursor size</FieldLabel><div className="mt-1.5 grid grid-cols-3 rounded-md border border-stone-300 bg-white p-1 dark:border-white/10 dark:bg-[#2b2c29]">{(["small", "medium", "large"] as const).map((size) => <button aria-label={`Use ${size} cursor`} aria-pressed={settings.cursor.size === size} className="rounded px-2.5 py-1.5 text-[10px] font-semibold capitalize text-stone-500 outline-none hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-[var(--shothub-accent)] aria-pressed:bg-stone-900 aria-pressed:text-white dark:text-stone-400 dark:hover:text-white dark:aria-pressed:bg-white/10" key={size} type="button" onClick={() => update({ ...settings, cursor: { ...settings.cursor, size } })}>{size}</button>)}</div></div>
          <SectionReset onClick={() => update({ ...settings, cursor: defaultShotHubSettings.cursor })} />
        </SettingsSection>
      </div>
    </div>
  );
}

type SettingsSectionProps = { icon: typeof Palette; eyebrow: string; title: string; description: string; children: React.ReactNode };
function SettingsSection({ icon: Icon, eyebrow, title, description, children }: SettingsSectionProps): React.JSX.Element {
  return <section className="border-b border-stone-300/80 py-6 first:pt-0 dark:border-white/10"><div className="mb-4 flex gap-2.5"><div className="grid size-8 shrink-0 place-items-center rounded-md border border-stone-200 bg-white text-stone-600 dark:border-white/10 dark:bg-[#30312e] dark:text-stone-300"><Icon aria-hidden="true" size={15} /></div><div><p className="text-[9px] font-bold uppercase tracking-[0.17em] text-stone-400 dark:text-stone-500">{eyebrow}</p><h2 className="mt-0.5 text-sm font-semibold tracking-tight dark:text-stone-100">{title}</h2><p className="mt-0.5 text-[11px] leading-4.5 text-stone-500 dark:text-stone-400">{description}</p></div></div>{children}</section>;
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
        className="flex h-9 w-full items-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-left font-mono text-[10px] text-stone-700 outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-[var(--shothub-accent)]/35 dark:border-white/10 dark:bg-[#30312e] dark:text-stone-200"
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
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[10px] text-stone-600 outline-none hover:bg-stone-100 focus-visible:bg-stone-100 aria-selected:bg-stone-100 aria-selected:text-stone-900 dark:text-stone-300 dark:hover:bg-white/7 dark:focus-visible:bg-white/7 dark:aria-selected:bg-white/8 dark:aria-selected:text-white"
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

function FieldLabel({ children }: { children: React.ReactNode }): React.JSX.Element { return <span className="text-[11px] font-semibold text-stone-700 dark:text-stone-300">{children}</span>; }

type ColorButtonProps = { color: string; label: string; selected: boolean; disabled?: boolean; onClick: () => void };
function ColorButton({ color, label, selected, disabled = false, onClick }: ColorButtonProps): React.JSX.Element { return <button aria-label={label} aria-pressed={selected} className="relative grid size-8 place-items-center rounded-full border border-black/10 outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 dark:focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-35" disabled={disabled} style={{ backgroundColor: color }} type="button" onClick={onClick}>{selected ? <Check aria-hidden="true" className={color === "#ffffff" || color === "#d9ff43" || color === "#39ff88" || color === "#39e7ff" ? "text-stone-900" : "text-white"} size={13} strokeWidth={3} /> : null}</button>; }

function SectionReset({ onClick }: { onClick: () => void }): React.JSX.Element { return <div className="mt-4 border-t border-stone-200 pt-3 dark:border-white/8"><button aria-label="Reset this section" className="flex items-center gap-1.5 text-[10px] font-medium text-stone-500 outline-none transition hover:text-stone-900 focus-visible:text-stone-900 dark:text-stone-500 dark:hover:text-stone-200 dark:focus-visible:text-white" type="button" onClick={onClick}><RotateCcw aria-hidden="true" size={11} />Reset this section</button></div>; }

type ToggleFieldProps = { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void };
function ToggleField({ label, description, checked, onChange }: ToggleFieldProps): React.JSX.Element { return <label className="flex cursor-pointer items-start justify-between gap-3"><span><span className="block text-xs font-semibold text-stone-800 dark:text-stone-200">{label}</span>{description === "" ? null : <span className="mt-0.5 block text-[10px] leading-4 text-stone-500 dark:text-stone-400">{description}</span>}</span><span className="relative mt-0.5 shrink-0"><input aria-label={label} checked={checked} className="peer sr-only" role="switch" type="checkbox" onChange={(event) => onChange(event.currentTarget.checked)} /><span className="block h-5 w-9 rounded-full bg-stone-300 transition peer-checked:bg-[var(--shothub-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-stone-900 peer-focus-visible:ring-offset-2 dark:bg-stone-700 dark:peer-focus-visible:ring-white" /><span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4 peer-checked:bg-[#171815]" /></span></label>; }

type SlotRowProps = { number: number; title: string; description: string; enabled: boolean; onToggle: (enabled: boolean) => void; children?: React.ReactNode };
function SlotRow({ number, title, description, enabled, onToggle, children }: SlotRowProps): React.JSX.Element { return <div className="flex min-h-14 items-center gap-3 px-3 py-2.5"><span className="grid size-6 shrink-0 place-items-center rounded bg-stone-100 font-mono text-[9px] font-bold text-stone-500 dark:bg-white/6 dark:text-stone-500">{number.toString().padStart(2, "0")}</span><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-stone-800 dark:text-stone-200">{title}</p><p className="mt-0.5 truncate text-[10px] text-stone-500 dark:text-stone-400">{description}</p></div>{enabled ? children : null}<ToggleField label={`Enable ${title}`} description="" checked={enabled} onChange={onToggle} /></div>; }

type CompactSelectProps = { label: string; value: string; options: readonly string[]; onChange: (value: string) => void };
function CompactSelect({ label, value, options, onChange }: CompactSelectProps): React.JSX.Element { return <label className="relative"><span className="sr-only">{label}</span><select aria-label={label} className="h-8 appearance-none rounded-md border border-stone-300 bg-white py-1 pl-2.5 pr-7 text-[10px] font-medium capitalize text-stone-700 outline-none focus:ring-2 focus:ring-[var(--shothub-accent)] dark:border-white/10 dark:bg-[#333431] dark:text-stone-300" value={value} onChange={(event) => onChange(event.currentTarget.value)}>{options.map((option) => <option key={option} value={option}>{option.replace("-", " ")}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-stone-400" size={11} /></label>; }

type ShortcutRowProps = { label: string; description: string; value: string; defaultValue: string; recording: boolean; onRecord: () => void; onReset: () => void };
function ShortcutRow({ label, description, value, defaultValue, recording, onRecord, onReset }: ShortcutRowProps): React.JSX.Element { return <div className="flex items-center gap-2 px-3 py-2.5"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-stone-800 dark:text-stone-200">{label}</p><p className="mt-0.5 text-[10px] text-stone-500 dark:text-stone-400">{description}</p></div><button aria-label={`Configure ${label}`} aria-pressed={recording} className="min-w-32 rounded-md border border-stone-300 bg-stone-50 px-2.5 py-1.5 font-mono text-[10px] font-semibold text-stone-700 outline-none transition hover:border-stone-500 focus-visible:ring-2 focus-visible:ring-[var(--shothub-accent)] aria-pressed:border-stone-900 aria-pressed:bg-stone-900 aria-pressed:text-white dark:border-white/10 dark:bg-[#333431] dark:text-stone-300 dark:hover:border-white/20 dark:aria-pressed:bg-white/10" type="button" onClick={onRecord}>{recording ? "Press shortcut…" : value}</button><InlineResetButton label={`Reset ${label} shortcut`} disabled={value === defaultValue} onClick={onReset} /></div>; }

type InlineResetButtonProps = { label: string; disabled: boolean; onClick: () => void };
function InlineResetButton({ label, disabled, onClick }: InlineResetButtonProps): React.JSX.Element { return <button aria-label={label} className="flex h-7 shrink-0 items-center gap-1 rounded px-1.5 text-[9px] font-medium text-stone-400 outline-none transition hover:bg-stone-100 hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-[var(--shothub-accent)] dark:text-stone-500 dark:hover:bg-white/7 dark:hover:text-stone-200 disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent" disabled={disabled} title={label} type="button" onClick={onClick}><RotateCcw aria-hidden="true" size={11} />Reset</button>; }

function formatShortcut(event: KeyboardEvent): string { const parts: string[] = []; if (event.ctrlKey) parts.push("Ctrl"); if (event.altKey) parts.push("Alt"); if (event.shiftKey) parts.push("Shift"); if (event.metaKey) parts.push("Meta"); const key = event.key.length === 1 ? event.key.toUpperCase() : event.key; parts.push(key); return parts.join("+"); }
