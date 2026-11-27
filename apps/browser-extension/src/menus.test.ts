import { describe, expect, it } from "vitest";
import { MENU_PARENT, installMenus, menuTitle, toolForMenu } from "./menus";

describe("context menu", () => {
  it("maps item ids to tools", () => {
    expect(toolForMenu("capkit-inspect")).toBe("inspect");
    expect(toolForMenu("capkit-pick")).toBe("pick");
    expect(toolForMenu(MENU_PARENT)).toBeNull();
    expect(toolForMenu(7)).toBeNull();
  });

  it("shows the shortcut when one is set", () => {
    expect(menuTitle("Inspect", "Alt+Shift+I")).toBe("Inspect (Alt+Shift+I)");
    expect(menuTitle("Inspect", "")).toBe("Inspect");
    expect(menuTitle("Inspect", undefined)).toBe("Inspect");
  });

  it("builds CapKit → Inspect / Pick and comment on web pages only", async () => {
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
    ]);
    for (const item of created) expect(item.documentUrlPatterns).toEqual(["http://*/*", "https://*/*"]);
  });
});
