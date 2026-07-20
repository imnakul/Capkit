import {
  Circle,
  Eye,
  GalleryVerticalEnd,
  Hash,
  Highlighter,
  Minus,
  MoveUpRight,
  Orbit,
  Pencil,
  RectangleHorizontal,
  Redo2,
  ScanEye,
  ShieldX,
  Sparkles,
  Type,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { ToolId } from "../domain/annotations";
import type { CaptureToolbarToolId } from "../domain/settings";

export type ToolbarToolDefinition = {
  id: CaptureToolbarToolId;
  label: string;
  icon: LucideIcon;
  annotationTool?: ToolId;
  shortcut?: string;
  supportsStyle: boolean;
};

export const toolbarCatalog: readonly ToolbarToolDefinition[] = [
  { id: "rectangle", label: "Rectangle", icon: RectangleHorizontal, annotationTool: "rectangle", shortcut: "R", supportsStyle: true },
  { id: "ellipse", label: "Ellipse", icon: Circle, annotationTool: "ellipse", supportsStyle: true },
  { id: "line", label: "Line", icon: Minus, annotationTool: "line", shortcut: "L", supportsStyle: true },
  { id: "arrow", label: "Arrow", icon: MoveUpRight, annotationTool: "arrow", shortcut: "A", supportsStyle: true },
  { id: "curved-arrow", label: "Curved arrow", icon: Orbit, annotationTool: "curved-arrow", supportsStyle: true },
  { id: "highlighter", label: "Text highlighter", icon: Highlighter, annotationTool: "highlighter", shortcut: "H", supportsStyle: true },
  { id: "pencil", label: "Pencil", icon: Pencil, annotationTool: "pencil", shortcut: "P", supportsStyle: true },
  { id: "text", label: "Text", icon: Type, annotationTool: "text", shortcut: "T", supportsStyle: true },
  { id: "blur", label: "Blur", icon: Sparkles, annotationTool: "blur", shortcut: "B", supportsStyle: true },
  { id: "spotlight", label: "Spotlight", icon: Eye, annotationTool: "spotlight", supportsStyle: true },
  { id: "pixelate", label: "Pixelate", icon: ScanEye, annotationTool: "pixelate", supportsStyle: true },
  { id: "blackout", label: "Blackout", icon: ShieldX, annotationTool: "blackout", supportsStyle: true },
  { id: "counter", label: "Counter", icon: Hash, annotationTool: "counter", supportsStyle: true },
  { id: "scrolling-capture", label: "Scrolling capture", icon: GalleryVerticalEnd, shortcut: "G", supportsStyle: false },
  { id: "undo", label: "Undo", icon: Undo2, shortcut: "Ctrl Z", supportsStyle: false },
  { id: "redo", label: "Redo", icon: Redo2, supportsStyle: false },
];

const catalogById = new Map(toolbarCatalog.map((tool) => [tool.id, tool]));

export function getToolbarTool(id: CaptureToolbarToolId): ToolbarToolDefinition {
  const tool = catalogById.get(id);
  if (tool === undefined) throw new Error(`Unknown capture toolbar tool: ${id}`);
  return tool;
}
