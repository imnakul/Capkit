import {
  Arrow,
  Blackout,
  Blur,
  CircleShape,
  CurvedArrow,
  Hashtag,
  MagicWand,
  Highlighter,
  Minus,
  NotePin,
  Pencil,
  Pixelate,
  Redo,
  Spotlight,
  SquareShape,
  Text,
  Undo,
  VerticalScroll,
  type CapkitIconComponent,
} from "./icons";
import type { ToolId } from "../domain/annotations";
import type { CaptureToolbarToolId } from "../domain/settings";

export type ToolbarToolDefinition = {
  id: CaptureToolbarToolId;
  label: string;
  icon: CapkitIconComponent;
  annotationTool?: ToolId;
  shortcut?: string;
  supportsStyle: boolean;
};

export const toolbarCatalog: readonly ToolbarToolDefinition[] = [
  { id: "smart", label: "Smart select", icon: MagicWand, annotationTool: "smart", shortcut: "W", supportsStyle: true },
  { id: "rectangle", label: "Rectangle", icon: SquareShape, annotationTool: "rectangle", shortcut: "R", supportsStyle: true },
  { id: "ellipse", label: "Ellipse", icon: CircleShape, annotationTool: "ellipse", supportsStyle: true },
  { id: "line", label: "Line", icon: Minus, annotationTool: "line", shortcut: "L", supportsStyle: true },
  { id: "arrow", label: "Arrow", icon: Arrow, annotationTool: "arrow", supportsStyle: true },
  { id: "curved-arrow", label: "Curved arrow", icon: CurvedArrow, annotationTool: "curved-arrow", supportsStyle: true },
  { id: "highlighter", label: "Text highlighter", icon: Highlighter, annotationTool: "highlighter", shortcut: "H", supportsStyle: true },
  { id: "pencil", label: "Pencil", icon: Pencil, annotationTool: "pencil", shortcut: "P", supportsStyle: true },
  { id: "text", label: "Text", icon: Text, annotationTool: "text", shortcut: "T", supportsStyle: true },
  { id: "blur", label: "Blur", icon: Blur, annotationTool: "blur", shortcut: "B", supportsStyle: true },
  { id: "spotlight", label: "Spotlight", icon: Spotlight, annotationTool: "spotlight", supportsStyle: true },
  { id: "pixelate", label: "Pixelate", icon: Pixelate, annotationTool: "pixelate", supportsStyle: true },
  { id: "blackout", label: "Blackout", icon: Blackout, annotationTool: "blackout", supportsStyle: true },
  { id: "counter", label: "Counter", icon: Hashtag, annotationTool: "counter", supportsStyle: true },
  { id: "note", label: "Note", icon: NotePin, annotationTool: "note", shortcut: "N", supportsStyle: false },
  { id: "scrolling-capture", label: "Scrolling capture", icon: VerticalScroll, shortcut: "G", supportsStyle: false },
  { id: "undo", label: "Undo", icon: Undo, shortcut: "Ctrl Z", supportsStyle: false },
  { id: "redo", label: "Redo", icon: Redo, supportsStyle: false },
];

const catalogById = new Map(toolbarCatalog.map((tool) => [tool.id, tool]));

export function getToolbarTool(id: CaptureToolbarToolId): ToolbarToolDefinition {
  const tool = catalogById.get(id);
  if (tool === undefined) throw new Error(`Unknown capture toolbar tool: ${id}`);
  return tool;
}

export type ToolbarToolHandlers = {
  onToolChange: (tool: ToolId) => void;
  onScrollCapture: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

/** Runs a toolbar tool the same way from either capture toolbar. */
export function runToolbarTool(toolId: CaptureToolbarToolId, handlers: ToolbarToolHandlers): void {
  const tool = getToolbarTool(toolId);
  if (tool.annotationTool !== undefined) handlers.onToolChange(tool.annotationTool);
  else if (toolId === "scrolling-capture") handlers.onScrollCapture();
  else if (toolId === "undo") handlers.onUndo();
  else handlers.onRedo();
}
