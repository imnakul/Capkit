import { PROTOCOL_VERSION, type AppMessage, type ExtensionMessage } from "@snaphub/devtools-protocol/protocol";
import { ACCENT_KEY } from "./accent";
import { Link, WAKE_ALARM_MINUTES, wakeAlarmFor, type SocketLike, type TokenStore } from "./link";
import { installMenus, toolForCommand, toolForMenu } from "./menus";
import { backgroundRequestSchema, type LinkStatus, type PageRequest, type Tool } from "./messages";
import { activeTabs, askTab, injectMainWorld, matchTab, originPattern, siteAccessFor, type TabRef } from "./tabs";

const TOKEN_KEY = "capkitToken";
const WAKE_ALARM = "capkit-reconnect";
const MAX_HIT_ELEMENTS = 12;
const MAX_INSPECT_ELEMENTS = 20;

const store: TokenStore = {
  get: async () => {
    const value: unknown = (await chrome.storage.local.get(TOKEN_KEY))[TOKEN_KEY];
    return typeof value === "string" ? value : null;
  },
  set: async (token) => {
    await chrome.storage.local.set({ [TOKEN_KEY]: token });
  },
  clear: async () => {
    await chrome.storage.local.remove(TOKEN_KEY);
  },
};

function browserInfo(): { name: string; version: string } {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string; version: string }[] } }).userAgentData?.brands; // userAgentData is not in the DOM lib
  const named = brands?.find((b) => !/not.?a.?brand|chromium/i.test(b.brand));
  const chromium = brands?.find((b) => /chromium/i.test(b.brand));
  const pick = named ?? chromium;
  return { name: pick?.brand ?? "Chromium", version: pick?.version ?? "" };
}

async function answer(message: AppMessage): Promise<ExtensionMessage | null> {
  if (message.type !== "hitTest" && message.type !== "inspect" && message.type !== "findSensitive") return null;
  const base = { v: PROTOCOL_VERSION, id: message.id } as const;
  const fail = (status: "no-tab" | "no-access" | "mismatch" | "error"): ExtensionMessage => {
    switch (message.type) {
      case "hitTest":
        return { ...base, type: "hitTestResult", status, elements: [] };
      case "inspect":
        return { ...base, type: "inspectResult", status, elements: [] };
      case "findSensitive":
        return { ...base, type: "findSensitiveResult", status, matches: [] };
    }
  };

  const tab = matchTab(message.windowTitle, await activeTabs());
  if (tab === null) return fail("no-tab");
  const info = { url: tab.url, title: tab.title };

  let request: PageRequest;
  switch (message.type) {
    case "hitTest":
      request = { kind: "hitTest", viewport: message.viewport, point: message.point };
      break;
    case "inspect":
      request = {
        kind: "inspect",
        viewport: message.viewport,
        ...(message.point === undefined ? {} : { point: message.point }),
        ...(message.area === undefined ? {} : { area: message.area }),
      };
      break;
    case "findSensitive":
      request = { kind: "findSensitive", viewport: message.viewport, area: message.area };
      break;
  }

  // Try even without a stored site permission: a tab the user opened the extension on has
  // temporary access. If injection fails, CapKit falls back to Windows accessibility.
  const result = await askTab(tab, request, { requireSiteAccess: false });
  if (result.response === null) return fail(result.status === "ok" ? "error" : result.status);
  const response = result.response;
  if (response.kind === "hitTest" && message.type === "hitTest") {
    return { ...base, type: "hitTestResult", status: response.status, tab: info, elements: response.elements.slice(0, MAX_HIT_ELEMENTS) };
  }
  if (response.kind === "inspect" && message.type === "inspect") {
    return {
      ...base,
      type: "inspectResult",
      status: response.status,
      tab: info,
      ...(response.cssViewport === undefined ? {} : { cssViewport: response.cssViewport }),
      elements: response.elements.slice(0, MAX_INSPECT_ELEMENTS),
    };
  }
  if (response.kind === "findSensitive" && message.type === "findSensitive") {
    return { ...base, type: "findSensitiveResult", status: response.status, matches: response.matches };
  }
  return fail("error");
}

const link = new Link({
  createSocket: (url): SocketLike => new WebSocket(url),
  store,
  browser: browserInfo(),
  extensionVersion: chrome.runtime.getManifest().version,
  handleRequest: answer,
  onStatus: (status): void => {
    const action = wakeAlarmFor(status);
    if (action === "schedule") void chrome.alarms.create(WAKE_ALARM, { periodInMinutes: WAKE_ALARM_MINUTES });
    if (action === "cancel") void chrome.alarms.clear(WAKE_ALARM);
  },
  onAccent: (accent): void => {
    void chrome.storage.local.set({ [ACCENT_KEY]: accent });
  },
});

async function currentTab(): Promise<TabRef | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  return tab?.id === undefined ? null : { id: tab.id, url: tab.url ?? "", title: tab.title ?? "" };
}

/** The popup, a shortcut or a menu click grants activeTab, so the page tools need no site access. */
async function runTool(tab: TabRef | null, tool: Tool, action: "toggle" | "start"): Promise<boolean> {
  if (tab === null || originPattern(tab.url) === null) return false;
  const result = await askTab(tab, { kind: "tool", tool, action }, { requireSiteAccess: false });
  return result.response !== null;
}

async function refreshMenus(): Promise<void> {
  const commands = await chrome.commands.getAll();
  const shortcuts = new Map(commands.flatMap((command) => (command.name === undefined || command.shortcut === undefined ? [] : [[command.name, command.shortcut] as const])));
  await installMenus(chrome.contextMenus, shortcuts);
}

async function dispatch(raw: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const parsed = backgroundRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const request = parsed.data;
  switch (request.kind) {
    case "injectMain": {
      const tabId = sender.tab?.id;
      return { ok: tabId !== undefined && (await injectMainWorld(tabId)) };
    }
    case "captureVisible": {
      const windowId = sender.tab?.windowId;
      if (windowId === undefined) return { ok: false };
      return { ok: true, dataUrl: await chrome.tabs.captureVisibleTab(windowId, { format: "png" }) };
    }
    case "status":
      return link.status satisfies LinkStatus;
    case "pair":
      link.pair(request.code);
      return link.status;
    case "retry":
      link.retry();
      return link.status;
    case "forget":
      await link.forget();
      return link.status;
    case "startTool":
      return { ok: await runTool(await currentTab(), request.tool, "start") };
    case "siteAccess":
      return siteAccessFor(await currentTab());
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Always answer, even on failure; otherwise the caller sees "message channel closed".
  dispatch(message, sender).then(sendResponse, () => {
    sendResponse({ ok: false });
  });
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  const tool = toolForCommand(command);
  if (tool !== null) void currentTab().then((tab) => runTool(tab, tool, "toggle"));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tool = toolForMenu(info.menuItemId);
  if (tool === null || tab?.id === undefined) return;
  void runTool({ id: tab.id, url: tab.url ?? info.pageUrl ?? "", title: tab.title ?? "" }, tool, "start");
});

// A fresh worker already connects at the bottom of this file; the alarm only nudges a live one.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WAKE_ALARM && link.status.state === "unreachable") link.retry();
});
chrome.runtime.onStartup.addListener(() => {
  void link.connect();
  void refreshMenus();
});
chrome.runtime.onInstalled.addListener(() => {
  void link.connect();
  void refreshMenus();
});
void link.connect();
