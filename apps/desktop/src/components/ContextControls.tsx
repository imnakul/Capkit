import { useState } from "react";
import type { AnnotationStyle, ToolId } from "../domain/annotations";
import type { CaptureToolbarToolId } from "../domain/settings";
import type { ToolbarToolDefinition } from "./toolbarCatalog";

type ContextControlsProps = {
  activeTool: ToolId;
  style: AnnotationStyle;
  tools: readonly ToolbarToolDefinition[];
  palette: readonly string[];
  visible: boolean;
  showStyleControls: boolean;
  onStyleChange: (style: AnnotationStyle) => void;
  onToolSelect: (tool: CaptureToolbarToolId) => void;
};

/** A compact property rail whose variants lead and styling controls follow. */
export function ContextControls({
  activeTool,
  style,
  tools,
  palette,
  visible,
  showStyleControls,
  onStyleChange,
  onToolSelect,
}: ContextControlsProps): React.JSX.Element {
  const activeIndex = tools.findIndex((tool) => tool.annotationTool === activeTool);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const indicatorIndex = hoveredIndex ?? activeIndex;

  return (
    <div
      aria-hidden={!visible}
      aria-label="Tool properties"
      className={`flex min-w-max origin-top-left items-center gap-3 rounded-xl border border-white/12 bg-[#1b1d19]/98 px-3 py-2 shadow-[0_16px_45px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-[opacity,transform] duration-150 ease-out ${visible ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0"}`}
      role="group"
    >
      {tools.length > 0 ? (
        <div className="relative flex gap-1" onPointerLeave={() => setHoveredIndex(null)}>
          {indicatorIndex >= 0 ? (
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute left-0 top-0 size-8 rounded-lg transition-transform duration-150 ease-out ${activeIndex === indicatorIndex ? "bg-lime-300" : "bg-white/9"}`}
              style={{ transform: `translateX(${String(indicatorIndex * 36)}px)` }}
            />
          ) : null}
          {tools.map((tool, index) => {
            const Icon = tool.icon;
            const active = tool.annotationTool === activeTool;
            return (
              <button
                aria-label={tool.label}
                aria-pressed={active}
                className="group relative z-10 grid size-8 place-items-center rounded-lg text-white outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lime-300"
                key={tool.id}
                type="button"
                onClick={() => onToolSelect(tool.id)}
                onFocus={() => setHoveredIndex(index)}
                onPointerEnter={() => setHoveredIndex(index)}
              >
                <Icon aria-hidden="true" size={16} strokeWidth={active ? 2.4 : 1.9} />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-stone-950 px-2 py-1 text-[10px] font-medium text-stone-100 shadow-xl group-hover:block group-focus-visible:block">
                  {tool.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {tools.length > 0 && showStyleControls ? <div aria-hidden="true" className="h-6 w-px bg-white/10" /> : null}
      {showStyleControls ? (
        <>
          <div className="flex gap-2" role="radiogroup" aria-label="Annotation color">
            {palette.map((color) => (
              <button
                aria-label={`Use ${color}`}
                aria-checked={style.color === color}
                className="size-5 rounded-full border border-white/15 outline-none ring-offset-[3px] ring-offset-[#1b1d19] transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-white aria-checked:ring-2 aria-checked:ring-white"
                key={color}
                role="radio"
                style={{ backgroundColor: color }}
                type="button"
                onClick={() => onStyleChange({ ...style, color })}
              />
            ))}
          </div>

          <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
            Size
            <input
              aria-label="Tool size"
              className="h-1 w-20 cursor-pointer accent-lime-300"
              max="24"
              min="1"
              type="range"
              value={style.strokeWidth}
              onChange={(event) => onStyleChange({ ...style, strokeWidth: Number(event.currentTarget.value) })}
            />
          </label>

          {activeTool === "text" ? (
            <select
              aria-label="Text font"
              className="h-8 rounded-md border border-white/10 bg-[#242622] px-2 text-[11px] text-stone-200 outline-none focus-visible:ring-2 focus-visible:ring-lime-300"
              value={style.fontFamily}
              onChange={(event) => onStyleChange({ ...style, fontFamily: event.currentTarget.value })}
            >
              <option value="Caveat Variable">Caveat</option>
              <option value="Segoe UI Variable">Segoe UI</option>
              <option value="Ink Free">Ink Free</option>
            </select>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
