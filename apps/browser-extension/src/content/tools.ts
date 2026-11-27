import type { Tool } from "../messages";

export type ToolController = { readonly isActive: boolean; start: () => void; stop: () => void };

/** Starts or toggles one page tool and stops the other, so the two never fight over clicks. */
export function runTool(controllers: Record<Tool, ToolController>, tool: Tool, action: "toggle" | "start"): void {
  const target = controllers[tool];
  if (action === "toggle" && target.isActive) {
    target.stop();
    return;
  }
  for (const [name, controller] of Object.entries(controllers)) {
    if (name !== tool) controller.stop();
  }
  target.start();
}
