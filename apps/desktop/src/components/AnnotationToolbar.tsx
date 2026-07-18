import {
  Circle,
  Eye,
  Hash,
  Highlighter,
  Minus,
  MousePointer2,
  MoveUpRight,
  Orbit,
  RectangleHorizontal,
  Redo2,
  RotateCw,
  ScanEye,
  ShieldX,
  Sparkles,
  Type,
  Undo2,
} from "lucide-react";
import type { AnnotationStyle, ToolId } from "../domain/annotations";
import type { ShotHubSettings } from "../domain/settings";
import { ContextControls, type ContextToolOption } from "./ContextControls";
import { ToolButton } from "./ToolButton";

type AnnotationToolbarProps = {
  activeTool: ToolId;
  style: AnnotationStyle;
  canUndo: boolean;
  canRedo: boolean;
  palette: readonly string[];
  toolbar: ShotHubSettings["toolbar"];
  onToolChange: (tool: ToolId) => void;
  onStyleChange: (style: AnnotationStyle) => void;
  onUndo: () => void;
  onRedo: () => void;
};

const shapeTools = [
  { id: "rectangle", label: "Rectangle", icon: RectangleHorizontal },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "line", label: "Line", icon: Minus },
  { id: "arrow", label: "Arrow", icon: MoveUpRight },
  { id: "curved-arrow", label: "Curved arrow", icon: Orbit },
  { id: "highlighter", label: "Highlight", icon: Highlighter },
] as const satisfies readonly ContextToolOption[];

const effectTools = [
  { id: "blur", label: "Blur", icon: Sparkles },
  { id: "spotlight", label: "Spotlight", icon: Eye },
  { id: "pixelate", label: "Pixelate", icon: ScanEye },
  { id: "blackout", label: "Blackout", icon: ShieldX },
] as const satisfies readonly ContextToolOption[];

function includesTool(tools: readonly ContextToolOption[], activeTool: ToolId): boolean {
  return tools.some((tool) => tool.id === activeTool);
}

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
}: AnnotationToolbarProps): React.JSX.Element {
  const shapeActive = includesTool(shapeTools, activeTool);
  const effectActive = includesTool(effectTools, activeTool);

  return (
    <div
      aria-label="Quick editing tools"
      className="flex items-center gap-0.5 rounded-2xl border border-white/12 bg-[#161815]/96 p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      role="toolbar"
    >
      <ToolButton
        active={activeTool === "select"}
        icon={MousePointer2}
        label="Select"
        shortcut="V"
        onClick={() => onToolChange("select")}
      />
      {toolbar.rotate ? <ToolButton
        active={activeTool === "rotate"}
        icon={RotateCw}
        label="Rotate"
        shortcut="R"
        onClick={() => onToolChange("rotate")}
      /> : null}

      {toolbar.shapes ? <div className="relative">
        <ToolButton
          active={shapeActive}
          icon={RectangleHorizontal}
          label="Shapes and arrows"
          shortcut="S"
          onClick={() => onToolChange(shapeActive ? activeTool : toolbar.shapeDefault)}
        />
        {shapeActive ? (
          <ContextControls
            activeTool={activeTool}
            palette={palette}
            style={style}
            tools={shapeTools}
            onStyleChange={onStyleChange}
            onToolChange={onToolChange}
          />
        ) : null}
      </div> : null}

      {toolbar.effects ? <div className="relative">
        <ToolButton
          active={effectActive}
          icon={Sparkles}
          label="Focus and privacy"
          shortcut="B"
          onClick={() => onToolChange(effectActive ? activeTool : toolbar.effectDefault)}
        />
        {effectActive ? (
          <ContextControls
            activeTool={activeTool}
            palette={palette}
            style={style}
            tools={effectTools}
            onStyleChange={onStyleChange}
            onToolChange={onToolChange}
          />
        ) : null}
      </div> : null}

      {toolbar.counter ? <div className="relative">
        <ToolButton
          active={activeTool === "counter"}
          icon={Hash}
          label="Counter"
          onClick={() => onToolChange("counter")}
        />
        {activeTool === "counter" ? (
          <ContextControls
            activeTool={activeTool}
            palette={palette}
            style={style}
            tools={[]}
            onStyleChange={onStyleChange}
            onToolChange={onToolChange}
          />
        ) : null}
      </div> : null}

      {toolbar.text ? <div className="relative">
        <ToolButton
          active={activeTool === "text"}
          icon={Type}
          label="Text"
          shortcut="T"
          onClick={() => onToolChange("text")}
        />
        {activeTool === "text" ? (
          <ContextControls
            activeTool={activeTool}
            palette={palette}
            style={style}
            tools={[]}
            onStyleChange={onStyleChange}
            onToolChange={onToolChange}
          />
        ) : null}
      </div> : null}

      {toolbar.history ? <><div aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-white/10" /><ToolButton disabled={!canUndo} icon={Undo2} label="Undo" shortcut="Ctrl Z" onClick={onUndo} /><ToolButton disabled={!canRedo} icon={Redo2} label="Redo" onClick={onRedo} /></> : null}
    </div>
  );
}
