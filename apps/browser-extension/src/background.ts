import { PROTOCOL_VERSION, type AppMessage, type ExtensionMessage } from "@snaphub/devtools-protocol/protocol";
import { ACCENT_KEY } from "./accent";
import { Link, type SocketLike, type TokenStore } from "./link";
import { backgroundRequestSchema, type LinkStatus, type PageRequest } from "./messages";
import { activeTabs, askTab, injectMainWorld, matchTab, originPattern, siteAccessFor, type TabRef } from "./tabs";

const TOKEN_KEY = "capkitToken";
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
  onAccent: (accent): void => {
    void chrome.storage.local.set({ [ACCENT_KEY]: accent });
  },
});

async function currentTab(): Promise<TabRef | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  return tab?.id === undefined ? null : { id: tab.id, url: tab.url ?? "", title: tab.title ?? "" };
}

/** Opening the popup or pressing the shortcut grants activeTab, so the inspector needs no site access. */
async function inspectActiveTab(): Promise<boolean> {
  const tab = await currentTab();
  if (tab === null || originPattern(tab.url) === null) return false;
  const result = await askTab(tab, { kind: "toggle" }, { requireSiteAccess: false });
  return result.response !== null;
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
    case "inspectActiveTab":
      return { ok: await inspectActiveTab() };
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
  if (command === "toggle-inspector") void inspectActiveTab();
});

chrome.runtime.onStartup.addListener(() => {
  void link.connect();
});
chrome.runtime.onInstalled.addListener(() => {
  void link.connect();
});
void link.connect();
