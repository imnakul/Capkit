import type { Tool } from "./messages";

export const MENU_PARENT = "capkit";

/** Right-click → CapKit → one item per page tool; each names the command whose shortcut it shows. */
export const MENU_ITEMS = [
  { id: "capkit-inspect", title: "Inspect", tool: "inspect", command: "toggle-inspector" },
  { id: "capkit-pick", title: "Pick and comment", tool: "pick", command: "toggle-picker" },
  { id: "capkit-font", title: "Font", tool: "font", command: "toggle-font" },
  { id: "capkit-color", title: "Colour", tool: "color", command: "toggle-color" },
] as const satisfies readonly { id: string; title: string; tool: Tool; command: string }[];

/** Tools need a real web page; Chrome blocks extensions on its own pages. */
const PAGE_PATTERNS = ["http://*/*", "https://*/*"];
const CONTEXTS: NonNullable<chrome.contextMenus.CreateProperties["contexts"]> = ["page", "frame", "selection", "link", "editable", "image", "video", "audio"];

export type MenuApi = {
  removeAll: () => Promise<void>;
  create: (properties: chrome.contextMenus.CreateProperties) => void;
};

export function toolForMenu(id: string | number): Tool | null {
  return MENU_ITEMS.find((item) => item.id === id)?.tool ?? null;
}

export function toolForCommand(command: string): Tool | null {
  return MENU_ITEMS.find((item) => item.command === command)?.tool ?? null;
}

/** "Inspect (Alt+Shift+I)"; the plain title when the user removed the shortcut. */
export function menuTitle(title: string, shortcut: string | undefined): string {
  return shortcut === undefined || shortcut === "" ? title : `${title} (${shortcut})`;
}

/** Rebuilds the menu, so a shortcut changed in chrome://extensions/shortcuts shows after the next start. */
export async function installMenus(api: MenuApi, shortcuts: ReadonlyMap<string, string>): Promise<void> {
  await api.removeAll();
  api.create({ id: MENU_PARENT, title: "CapKit", contexts: CONTEXTS, documentUrlPatterns: PAGE_PATTERNS });
  for (const item of MENU_ITEMS) {
    api.create({
      id: item.id,
      parentId: MENU_PARENT,
      title: menuTitle(item.title, shortcuts.get(item.command)),
      contexts: CONTEXTS,
      documentUrlPatterns: PAGE_PATTERNS,
    });
  }
}
