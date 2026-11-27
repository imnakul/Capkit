import { describe, expect, it } from "vitest";
import { runTool, type ToolController } from "./tools";

function fake(active = false): ToolController & { active: boolean } {
  return {
    active,
    get isActive(): boolean {
      return this.active;
    },
    start(): void {
      this.active = true;
    },
    stop(): void {
      this.active = false;
    },
  };
}

describe("runTool", () => {
  it("starting one tool stops the other", () => {
    const controllers = { inspect: fake(true), pick: fake() };
    runTool(controllers, "pick", "start");
    expect(controllers.pick.active).toBe(true);
    expect(controllers.inspect.active).toBe(false);
  });

  it("toggle turns an active tool off", () => {
    const controllers = { inspect: fake(), pick: fake(true) };
    runTool(controllers, "pick", "toggle");
    expect(controllers.pick.active).toBe(false);
  });

  it("start keeps an active tool on", () => {
    const controllers = { inspect: fake(true), pick: fake() };
    runTool(controllers, "inspect", "start");
    expect(controllers.inspect.active).toBe(true);
  });
});
