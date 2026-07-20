import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MousePointer2, type LucideIcon } from "lucide-react";
import type { AnnotationStyle, ToolId } from "../domain/annotations";
import type { CaptureToolbarToolId, SnaphubSettings } from "../domain/settings";
import { ContextControls } from "./ContextControls";
import { getToolbarTool, toolbarCatalog, type ToolbarToolDefinition } from "./toolbarCatalog";

type AnnotationToolbarProps = {
  activeTool: ToolId;
  style: AnnotationStyle;
  canUndo: boolean;
  canRedo: boolean;
  palette: readonly string[];
  toolbar: SnaphubSettings["toolbar"];
  onToolChange: (tool: ToolId) => void;
  onStyleChange: (style: AnnotationStyle) => void;
  onUndo: () => void;
  onRedo: () => void;
  onScrollCapture: () => void;
};

type PrimaryItem = {
  id: string;
  label: string;
  icon: LucideIcon;
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
  onToolChange,
  onStyleChange,
  onUndo,
  onRedo,
  onScrollCapture,
}: AnnotationToolbarProps): React.JSX.Element {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState({ side: "bottom" as "top" | "bottom", x: 0 });
  const closeTimer = useRef<number | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);

  function runTool(toolId: CaptureToolbarToolId): void {
    const tool = getToolbarTool(toolId);
    if (tool.annotationTool !== undefined) {
      onToolChange(tool.annotationTool);
      return;
    }
    if (toolId === "scrolling-capture") onScrollCapture();
    else if (toolId === "undo") onUndo();
    else onRedo();
  }

  function cancelClose(): void {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose(): void {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      setOpenItemId(null);
      setHoveredIndex(null);
    }, 130);
  }

  useEffect(() => (): void => cancelClose(), []);

  const items: PrimaryItem[] = [{
    id: "select",
    label: "Select",
    icon: MousePointer2,
    shortcut: "V",
    active: activeTool === "select",
    disabled: false,
    tools: [],
    showStyleControls: false,
    onSelect: () => onToolChange("select"),
  }];

  if (toolbar.mode === "individual") {
    for (const tool of toolbarCatalog) {
      if (!toolbar.individual[tool.id]) continue;
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
    toolbar.groups.forEach((group, index) => {
      const tools = group.map(getToolbarTool);
      const first = tools[0];
      if (first === undefined) return;
      items.push({
        id: `group-${String(index)}`,
        label: `${first.label} group`,
        icon: first.icon,
        ...(first.shortcut === undefined ? {} : { shortcut: first.shortcut }),
        active: tools.some((tool) => tool.annotationTool === activeTool),
        disabled: false,
        tools,
        showStyleControls: tools.some((tool) => tool.supportsStyle),
        onSelect: () => runTool(first.id),
      });
    });
  }

  const activeIndex = items.findIndex((item) => item.active);
  const indicatorIndex = hoveredIndex ?? activeIndex;
  const openIndex = items.findIndex((item) => item.id === openItemId);
  const openItem = openIndex < 0 ? null : items[openIndex] ?? null;

  useLayoutEffect(() => {
    const toolbarElement = toolbarRef.current;
    const submenuElement = submenuRef.current;
    if (openItem === null || toolbarElement === null || submenuElement === null) return;
    const toolbarRect = toolbarElement.getBoundingClientRect();
    const submenuRect = submenuElement.getBoundingClientRect();
    const gap = 7;
    const viewportPadding = 8;
    const roomBelow = window.innerHeight - toolbarRect.bottom;
    const roomAbove = toolbarRect.top;
    const side = roomBelow >= submenuRect.height + gap || roomBelow >= roomAbove ? "bottom" : "top";
    const desiredX = openIndex * 44;
    const minimumX = viewportPadding - toolbarRect.left;
    const maximumX = window.innerWidth - viewportPadding - toolbarRect.left - submenuRect.width;
    const x = Math.max(minimumX, Math.min(desiredX, Math.max(minimumX, maximumX)));
    setSubmenuPosition((current) => current.side === side && current.x === x ? current : { side, x });
  }, [openIndex, openItem]);

  function revealItem(item: PrimaryItem, index: number): void {
    cancelClose();
    setHoveredIndex(index);
    setOpenItemId(item.tools.length > 1 || item.showStyleControls ? item.id : null);
  }

  return (
    <div
      aria-label="Quick editing tools"
      className="relative flex items-center gap-1 rounded-2xl border border-white/12 bg-[#161815]/96 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      ref={toolbarRef}
      role="toolbar"
      onPointerEnter={cancelClose}
      onPointerLeave={scheduleClose}
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
        return (
          <button
            aria-label={item.label}
            aria-pressed={item.active}
            className="group relative z-10 grid size-10 shrink-0 place-items-center rounded-[11px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lime-300 disabled:cursor-not-allowed disabled:opacity-30"
            disabled={item.disabled}
            key={item.id}
            type="button"
            onClick={() => {
              item.onSelect();
              revealItem(item, index);
            }}
            onFocus={() => revealItem(item, index)}
            onPointerEnter={() => revealItem(item, index)}
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

      <div
        className={`absolute left-1.5 z-50 transition-transform duration-200 ease-out ${submenuPosition.side === "top" ? "bottom-[calc(100%+7px)]" : "top-[calc(100%+7px)]"} ${openItem === null ? "pointer-events-none" : "pointer-events-auto"}`}
        data-placement={submenuPosition.side}
        ref={submenuRef}
        style={{ transform: `translateX(${String(submenuPosition.x)}px)` }}
      >
        <ContextControls
          activeTool={activeTool}
          palette={palette}
          showStyleControls={openItem?.showStyleControls ?? false}
          style={style}
          tools={openItem?.tools ?? []}
          visible={openItem !== null}
          onStyleChange={onStyleChange}
          onToolSelect={runTool}
        />
      </div>
    </div>
  );
}
