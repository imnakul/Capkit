import type { LucideIcon } from "lucide-react";
import type { AnnotationStyle, ToolId } from "../domain/annotations";

export type ContextToolOption = {
  id: ToolId;
  label: string;
  icon: LucideIcon;
};

type ContextControlsProps = {
  activeTool: ToolId;
  style: AnnotationStyle;
  tools: readonly ContextToolOption[];
  palette: readonly string[];
  onStyleChange: (style: AnnotationStyle) => void;
  onToolChange: (tool: ToolId) => void;
};

export function ContextControls({
  activeTool,
  style,
  tools,
  palette,
  onStyleChange,
  onToolChange,
}: ContextControlsProps): React.JSX.Element {
  return (
    <div
      aria-label={`${activeTool} properties`}
      className="absolute left-0 top-[calc(100%+7px)] z-50 flex min-w-max items-center gap-2 rounded-xl border border-white/12 bg-[#1b1d19]/98 px-2.5 py-2 shadow-[0_16px_45px_rgba(0,0,0,0.5)] backdrop-blur-xl"
      role="group"
    >
      {activeTool === "text" ? (
        <>
          <label className="sr-only" htmlFor="annotation-text">
            Annotation text
          </label>
          <input
            className="w-36 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-stone-100 outline-none placeholder:text-stone-500 focus:border-lime-300/60"
            id="annotation-text"
            placeholder="Type your note"
            type="text"
            value={style.textContent}
            onChange={(event) =>
              onStyleChange({ ...style, textContent: event.currentTarget.value })
            }
          />
          <select
            aria-label="Text font"
            className="rounded-md border border-white/10 bg-[#22241f] px-2 py-1 text-xs text-stone-200 outline-none focus:border-lime-300/60"
            value={style.fontFamily}
            onChange={(event) =>
              onStyleChange({ ...style, fontFamily: event.currentTarget.value })
            }
          >
            <option value="Segoe UI Variable">Segoe UI</option>
            <option value="Ink Free">Ink Free</option>
            <option value="Comic Sans MS">Comic Sans</option>
          </select>
        </>
      ) : null}

      <div className="flex gap-1" role="radiogroup" aria-label="Annotation color">
        {palette.map((color) => (
          <button
            aria-label={`Use ${color}`}
            aria-checked={style.color === color}
            className="size-5 rounded-full border border-white/20 outline-none ring-offset-2 ring-offset-stone-950 transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-white data-[checked=true]:ring-2 data-[checked=true]:ring-white"
            data-checked={style.color === color}
            key={color}
            role="radio"
            style={{ backgroundColor: color }}
            type="button"
            onClick={() => onStyleChange({ ...style, color })}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
        Size
        <input
          aria-label="Tool size"
          className="h-1 w-20 cursor-pointer accent-lime-300"
          max="24"
          min="1"
          type="range"
          value={style.strokeWidth}
          onChange={(event) =>
            onStyleChange({ ...style, strokeWidth: Number(event.currentTarget.value) })
          }
        />
      </label>

      {tools.length > 0 ? <div aria-hidden="true" className="h-6 w-px bg-white/10" /> : null}
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <button
            aria-label={tool.label}
            aria-pressed={activeTool === tool.id}
            className="grid size-8 place-items-center rounded-lg text-stone-300 outline-none transition hover:bg-white/9 hover:text-white focus-visible:ring-2 focus-visible:ring-lime-300 aria-pressed:bg-lime-300 aria-pressed:text-stone-950"
            key={tool.id}
            type="button"
            onClick={() => onToolChange(tool.id)}
          >
            <Icon aria-hidden="true" size={16} strokeWidth={activeTool === tool.id ? 2.4 : 1.9} />
          </button>
        );
      })}
    </div>
  );
}
