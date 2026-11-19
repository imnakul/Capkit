import { useEffect, useState } from "react";
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
