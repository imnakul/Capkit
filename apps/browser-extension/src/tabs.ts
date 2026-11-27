import type { ResultStatus } from "@snaphub/devtools-protocol/protocol";
import { pageResponseSchema, type PageRequest, type PageResponse, type SiteAccess } from "./messages";

const ISOLATED_FILE = "content/isolated.js";
const MAIN_FILE = "content/main-world.js";

export type TabRef = { id: number; url: string; title: string };

/** Origin match pattern for a page URL. Match patterns carry no port, so one pattern covers every port. */
export function originPattern(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return null;
  }
}

/** The window title is "<tab title> - <Browser>"; pick the active tab whose title the window title starts with. */
export function matchTab(windowTitle: string, tabs: readonly TabRef[]): TabRef | null {
  let best: TabRef | null = null;
  for (const tab of tabs) {
    if (tab.title === "" || !windowTitle.startsWith(tab.title)) continue;
    if (best === null || tab.title.length > best.title.length) best = tab;
  }
  return best;
}

export async function activeTabs(): Promise<TabRef[]> {
  const tabs = await chrome.tabs.query({ active: true });
  const result: TabRef[] = [];
  for (const tab of tabs) {
    if (tab.id !== undefined) result.push({ id: tab.id, url: tab.url ?? "", title: tab.title ?? "" });
  }
  return result;
}

export async function hasAccess(url: string): Promise<boolean> {
  const pattern = originPattern(url);
  if (pattern === null) return false;
  return chrome.permissions.contains({ origins: [pattern] });
}

export async function siteAccessFor(tab: TabRef | null): Promise<SiteAccess> {
  if (tab === null) return { state: "unavailable" };
  const pattern = originPattern(tab.url);
  if (pattern === null) return { state: "unavailable" };
  return (await hasAccess(tab.url)) ? { state: "allowed", origin: pattern } : { state: "needs-access", origin: pattern };
}

async function ping(tabId: number): Promise<boolean> {
  try {
    const response: unknown = await chrome.tabs.sendMessage(tabId, { kind: "ping" });
    return pageResponseSchema.safeParse(response).success;
  } catch {
    return false;
  }
}

/** Injects the isolated content script when no live instance answers; a new instance replaces an orphaned one. */
export async function ensureInjected(tabId: number): Promise<boolean> {
  if (await ping(tabId)) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [ISOLATED_FILE] });
  } catch {
    return false;
  }
  return ping(tabId);
}

export async function injectMainWorld(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", files: [MAIN_FILE] });
    return true;
  } catch {
    return false;
  }
}

export type PageResult = { status: ResultStatus; response: PageResponse | null };

/** Sends a request to a tab's content script, injecting it first. Never throws. */
export async function askTab(
  tab: TabRef,
  request: PageRequest,
  options: { requireSiteAccess: boolean } = { requireSiteAccess: true },
): Promise<PageResult> {
  if (options.requireSiteAccess && !(await hasAccess(tab.url))) return { status: "no-access", response: null };
  if (!(await ensureInjected(tab.id))) return { status: "error", response: null };
  try {
    const raw: unknown = await chrome.tabs.sendMessage(tab.id, request);
    const parsed = pageResponseSchema.safeParse(raw);
    return parsed.success ? { status: "ok", response: parsed.data } : { status: "error", response: null };
  } catch {
    return { status: "error", response: null };
  }
}
