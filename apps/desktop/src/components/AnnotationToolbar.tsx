import { useEffect, useRef, useState } from "react";
import type { AnnotationStyle, ToolId } from "../domain/annotations";
import type { CaptureToolbarToolId, SnaphubSettings } from "../domain/settings";
import { SelectPointer, type CapkitIconComponent } from "./icons";
import { ContextControls } from "./ContextControls";
import type { RailItem } from "./captureActions";
import { getToolbarTool, runToolbarTool, toolbarCatalog, type ToolbarToolDefinition } from "./toolbarCatalog";

type AnnotationToolbarProps = {
  activeTool: ToolId;
  style: AnnotationStyle;
  canUndo: boolean;
  canRedo: boolean;
  palette: readonly string[];
  toolbar: SnaphubSettings["toolbar"];
  /** Which side of the selection the toolbar sits on; the style row goes on the far side. */
  placement?: "top" | "bottom";
  lastToolByGroup: Readonly<Partial<Record<number, CaptureToolbarToolId>>>;
  openGroupIndex: number | null;
  /** Finishing actions the user moved into this toolbar; shown after the tools. */
  actionItems?: readonly RailItem[];
  /** False while the capture is busy (scrolling capture, finishing); V and the number keys do nothing. */
  keyboardEnabled?: boolean;
  onToolChange: (tool: ToolId) => void;
  onStyleChange: (style: AnnotationStyle) => void;
  onUndo: () => void;
  onRedo: () => void;
  onScrollCapture: () => void;
  onGroupToolUsed: (groupIndex: number, toolId: CaptureToolbarToolId) => void;
  onOpenGroupChange: (groupIndex: number | null) => void;
};

type PrimaryItem = {
  id: string;
  groupIndex?: number;
  /** The tool this button runs: the only one in individual mode, the group's current one in group mode. */
  toolId?: CaptureToolbarToolId;
  label: string;
  icon: CapkitIconComponent;
  active: boolean;
  disabled: boolean;
  shortcut?: string;
  tools: readonly ToolbarToolDefinition[];
  showStyleControls: boolean;
  onSelect: () => void;
};

/** Renders either explicit tools or user-ordered groups while keeping Select recoverable. */
export function AnnotationToolbar({
  activeTool,
  style,
  canUndo,
  canRedo,
  palette,
  toolbar,
  placement = "bottom",
  lastToolByGroup,
  openGroupIndex,
  actionItems = [],
  keyboardEnabled = true,
  onToolChange,
  onStyleChange,
  onUndo,
  onRedo,
  onScrollCapture,
  onGroupToolUsed,
  onOpenGroupChange,
}: AnnotationToolbarProps): React.JSX.Element {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  function runTool(toolId: CaptureToolbarToolId): void {
    runToolbarTool(toolId, { onToolChange, onScrollCapture, onUndo, onRedo });
  }

  const groups = toolbar.mode === "group" ? toolbar.groups : [];

  // A tool picked by shortcut also becomes its group's remembered tool.
  useEffect(() => {
    groups.forEach((group, index) => {
      const used = group.find((toolId) => getToolbarTool(toolId).annotationTool === activeTool);
      if (used !== undefined && lastToolByGroup[index] !== used) onGroupToolUsed(index, used);
    });
  }, [activeTool, groups, lastToolByGroup, onGroupToolUsed]);

  const items: PrimaryItem[] = [{
    id: "select",
    label: "Select",
    icon: SelectPointer,
    shortcut: "V",
    active: activeTool === "select",
    disabled: false,
    tools: [],
    showStyleControls: false,
    onSelect: (): void => {
      onToolChange("select");
      onOpenGroupChange(null);
    },
  }];

  if (toolbar.mode === "individual") {
    for (const tool of toolbarCatalog) {
      if (!toolbar.individual[tool.id] || toolbar.verticalTools.includes(tool.id)) continue;
      const active = tool.annotationTool === activeTool;
      items.push({
        id: `tool-${tool.id}`,
        toolId: tool.id,
        label: tool.label,
        icon: tool.icon,
        ...(tool.shortcut === undefined ? {} : { shortcut: tool.shortcut }),
        active,
        disabled: tool.id === "undo" ? !canUndo : tool.id === "redo" ? !canRedo : false,
        tools: [],
        showStyleControls: tool.supportsStyle,
        onSelect: () => runTool(tool.id),
      });
    }
  } else {
    groups.forEach((group, index) => {
      const tools = group.map(getToolbarTool);
      const remembered = lastToolByGroup[index];
      const shown = tools.find((tool) => tool.id === remembered) ?? tools[0];
      if (shown === undefined) return;
      const opensRow = tools.length > 1 || tools.some((tool) => tool.supportsStyle);
      items.push({
        id: `group-${String(index)}`,
        groupIndex: index,
        toolId: shown.id,
        label: `${shown.label} group`,
        icon: shown.icon,
        ...(shown.shortcut === undefined ? {} : { shortcut: shown.shortcut }),
        active: tools.some((tool) => tool.annotationTool === activeTool),
        disabled: false,
        tools,
        showStyleControls: tools.some((tool) => tool.supportsStyle),
        onSelect: () => {
          if (openGroupIndex === index) {
            onOpenGroupChange(null);
            return;
          }
          runTool(shown.id);
          onGroupToolUsed(index, shown.id);
          onOpenGroupChange(opensRow ? index : null);
        },
      });
    });
  }

  // Tools and groups (not finishing actions, which have their own letters) take 1–9, then 0.
  // A tool with its own key keeps it; the rest take the digits nobody claimed, in order.
  const ownKeys = new Map<string, string>(Object.entries(toolbar.keys));
  const claimed = new Set(ownKeys.values());
  const freeNumberKeys = numberKeys.filter((key) => !claimed.has(key));
  let nextNumber = 0;
  for (const item of items.slice(1)) {
    const own = item.toolId === undefined ? undefined : ownKeys.get(item.toolId);
    const key = own ?? freeNumberKeys[nextNumber++];
    if (key !== undefined) item.shortcut = key;
  }

  /** Own keys reach every enabled tool, including the ones behind a group and the ones in the side rail. */
  const ownBindings: { key: string; disabled: boolean; run: () => void }[] = [];
  if (toolbar.mode === "group") {
    groups.forEach((group, index) => {
      const opensRow = group.length > 1 || group.some((toolId) => getToolbarTool(toolId).supportsStyle);
      for (const toolId of group) {
        const key = ownKeys.get(toolId);
        if (key === undefined) continue;
        ownBindings.push({
          key,
          disabled: toolId === "undo" ? !canUndo : toolId === "redo" ? !canRedo : false,
          run: () => {
            runTool(toolId);
            onGroupToolUsed(index, toolId);
            onOpenGroupChange(opensRow ? index : null);
          },
        });
      }
    });
  } else {
    for (const tool of toolbarCatalog) {
      const key = ownKeys.get(tool.id);
      if (key === undefined || !toolbar.individual[tool.id]) continue;
      ownBindings.push({
        key,
        disabled: tool.id === "undo" ? !canUndo : tool.id === "redo" ? !canRedo : false,
        run: () => runTool(tool.id),
      });
    }
  }
  const shortcutBindings = useRef(ownBindings);
  useEffect(() => {
    shortcutBindings.current = ownBindings;
  });

  for (const action of actionItems) {
    items.push({
      id: action.id,
      label: action.label,
      icon: action.icon,
      ...(action.shortcut === undefined ? {} : { shortcut: action.shortcut }),
      active: false,
      disabled: action.disabled ?? false,
      tools: [],
      showStyleControls: false,
      onSelect: action.onSelect,
    });
  }

  const shortcutItems = useRef(items);
  useEffect(() => {
    shortcutItems.current = items;
  });

  useEffect(() => {
    if (!keyboardEnabled) return undefined;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key.toUpperCase();
      const own = shortcutBindings.current.find((candidate) => candidate.key === key);
      if (own !== undefined) {
        event.preventDefault();
        if (!own.disabled) own.run();
        return;
      }
      const item = shortcutItems.current.find((candidate) => candidate.shortcut === key && !candidate.id.startsWith("action-"));
      if (item === undefined || item.disabled) return;
      event.preventDefault();
      item.onSelect();
    }
    window.addEventListener("keydown", onKeyDown);
    return (): void => window.removeEventListener("keydown", onKeyDown);
  }, [keyboardEnabled]);

  const activeIndex = items.findIndex((item) => item.active);
  const indicatorIndex = hoveredIndex ?? activeIndex;
  const openGroup = items.find(
    (item) => item.groupIndex !== undefined && item.groupIndex === openGroupIndex,
  );
  const activeStyleItem = toolbar.mode === "individual"
    ? items.find((item) => item.active && item.showStyleControls) ?? railStyleItem(toolbar, activeTool)
    : undefined;
  const rowTwo = openGroup ?? activeStyleItem;

  return (
    <div
      className={`flex rounded-2xl border border-white/12 bg-[#161815]/96 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl ${placement === "top" ? "flex-col-reverse" : "flex-col"}`}
      data-placement={placement}
    >
      <div
        aria-label="Quick editing tools"
        className="relative flex items-center gap-1 p-1.5"
        role="toolbar"
        onPointerLeave={() => setHoveredIndex(null)}
      >
        {indicatorIndex >= 0 ? (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute left-1.5 top-1.5 size-10 rounded-[11px] transition-transform duration-150 ease-out ${items[indicatorIndex]?.active === true ? "bg-lime-300" : "bg-white/9"}`}
            style={{ transform: `translateX(${String(indicatorIndex * 44)}px)` }}
          />
        ) : null}

        {items.map((item, index) => {
          const Icon = item.icon;
          const isOpen = item.groupIndex !== undefined && item.groupIndex === openGroupIndex;
          return (
            <button
              aria-expanded={item.groupIndex === undefined ? undefined : isOpen}
              aria-keyshortcuts={item.shortcut}
              aria-label={item.label}
              aria-pressed={item.active}
              className="group relative z-10 grid size-10 shrink-0 place-items-center rounded-[11px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lime-300 disabled:cursor-not-allowed disabled:opacity-30"
              disabled={item.disabled}
              key={item.id}
              type="button"
              onClick={item.onSelect}
              onFocus={() => setHoveredIndex(index)}
              onBlur={() => setHoveredIndex(null)}
              onPointerEnter={() => setHoveredIndex(index)}
            >
              <Icon
                aria-hidden="true"
                className={item.id === "select" ? "text-white" : item.active ? "text-stone-950" : "text-stone-200 group-hover:text-white"}
                size={18}
                strokeWidth={item.active ? 2.4 : 1.9}
              />
              {item.shortcut === undefined ? null : (
                <kbd
                  aria-hidden="true"
                  className={`pointer-events-none absolute right-1 top-1 min-w-3.5 rounded border px-1 text-center font-(family-name:--font-keycap) text-[8px] font-semibold leading-3 shadow-sm ${item.active ? "border-stone-950/20 bg-lime-200 text-stone-900" : "border-white/15 bg-stone-950/80 text-stone-300"}`}
                >
                  {item.shortcut}
                </kbd>
              )}
              <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-stone-950 px-2 py-1 text-[10px] font-medium text-stone-100 shadow-xl group-hover:block group-focus-visible:block">
                {item.label}
                {item.shortcut === undefined ? null : <kbd className="ml-2 text-stone-500">{item.shortcut}</kbd>}
              </span>
            </button>
          );
        })}
      </div>

      {rowTwo === undefined ? null : (
        <div className={placement === "top" ? "border-b border-white/10" : "border-t border-white/10"}>
          <ContextControls
            activeTool={activeTool}
            palette={palette}
            showStyleControls={rowTwo.showStyleControls}
            style={style}
            tools={rowTwo.tools}
            onStyleChange={onStyleChange}
            onToolSelect={(toolId) => {
              runTool(toolId);
              if (rowTwo.groupIndex !== undefined) onGroupToolUsed(rowTwo.groupIndex, toolId);
            }}
          />
        </div>
      )}
    </div>
  );
}

const numberKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

/** A style tool moved to the vertical rail still gets its colour and size row here. */
function railStyleItem(toolbar: SnaphubSettings["toolbar"], activeTool: ToolId): PrimaryItem | undefined {
  const tool = toolbarCatalog.find((candidate) =>
    candidate.annotationTool === activeTool && toolbar.verticalTools.includes(candidate.id) && toolbar.individual[candidate.id]);
  if (!tool?.supportsStyle) return undefined;
  return {
    id: `rail-${tool.id}`,
    label: tool.label,
    icon: tool.icon,
    active: true,
    disabled: false,
    tools: [],
    showStyleControls: true,
    onSelect: () => undefined,
  };
}
