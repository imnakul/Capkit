import { describe, expect, it } from "vitest";
import { MENU_PARENT, installMenus, menuTitle, toolForCommand, toolForMenu } from "./menus";

describe("context menu", () => {
  it("maps item ids to tools", () => {
    expect(toolForMenu("capkit-inspect")).toBe("inspect");
    expect(toolForMenu("capkit-pick")).toBe("pick");
    expect(toolForMenu("capkit-font")).toBe("font");
    expect(toolForMenu("capkit-color")).toBe("color");
    expect(toolForMenu(MENU_PARENT)).toBeNull();
    expect(toolForMenu(7)).toBeNull();
  });

  it("maps shortcut commands to tools", () => {
    expect(toolForCommand("toggle-inspector")).toBe("inspect");
    expect(toolForCommand("toggle-picker")).toBe("pick");
    expect(toolForCommand("toggle-font")).toBe("font");
    expect(toolForCommand("toggle-color")).toBe("color");
    expect(toolForCommand("_execute_action")).toBeNull();
  });

  it("shows the shortcut when one is set", () => {
    expect(menuTitle("Inspect", "Alt+Shift+I")).toBe("Inspect (Alt+Shift+I)");
    expect(menuTitle("Inspect", "")).toBe("Inspect");
    expect(menuTitle("Inspect", undefined)).toBe("Inspect");
  });

  it("builds CapKit → Inspect / Pick and comment / Font / Colour on web pages only", async () => {
    const created: chrome.contextMenus.CreateProperties[] = [];
    let cleared = false;
    await installMenus(
      {
        removeAll: () => {
          cleared = true;
          return Promise.resolve();
        },
        create: (properties) => {
          created.push(properties);
        },
      },
      new Map([["toggle-picker", "Alt+Shift+C"]]),
    );
    expect(cleared).toBe(true);
    expect(created.map((item) => [item.id, item.parentId, item.title])).toEqual([
      [MENU_PARENT, undefined, "CapKit"],
      ["capkit-inspect", MENU_PARENT, "Inspect"],
      ["capkit-pick", MENU_PARENT, "Pick and comment (Alt+Shift+C)"],
      ["capkit-font", MENU_PARENT, "Font"],
      ["capkit-color", MENU_PARENT, "Colour"],
    ]);
    for (const item of created) expect(item.documentUrlPatterns).toEqual(["http://*/*", "https://*/*"]);
  });
});
