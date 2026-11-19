import {
  CHANNEL_ATTRIBUTE,
  HOST_TAG,
  TARGET_ATTRIBUTE,
  parseMainReply,
  replyEventName,
  type MainReply,
} from "./bridge";
import type { ComponentData } from "./dom";

const REPLY_TIMEOUT_MS = 1800;

export type ComponentResolver = (element: Element) => Promise<ComponentData>;

function randomId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 24);
}

/** Creates the host element once per page and returns the channel the main world listens on. */
export function ensureHost(doc: Document): { host: HTMLElement; channel: string; fresh: boolean } {
  const existing = doc.querySelector<HTMLElement>(HOST_TAG);
  const stored = existing === null ? undefined : hostChannels.get(existing);
  if (existing !== null && stored !== undefined) return { host: existing, channel: stored, fresh: false };
  const host = doc.createElement(HOST_TAG);
  const channel = `capkit-${randomId()}`;
  host.setAttribute(CHANNEL_ATTRIBUTE, channel);
  host.setAttribute("style", "position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block");
  doc.documentElement.append(host);
  hostChannels.set(host, channel);
  return { host, channel, fresh: true };
}

const hostChannels = new WeakMap<Element, string>();

let mainReady: Promise<string | null> | null = null;

/** Injects the main-world script once per page and resolves with the channel name (null on failure). */
export function ensureMainWorld(doc: Document): Promise<string | null> {
  mainReady ??= (async (): Promise<string | null> => {
    const { channel } = ensureHost(doc);
    try {
      const response: unknown = await chrome.runtime.sendMessage({ kind: "injectMain" });
      const ok = typeof response === "object" && response !== null && Reflect.get(response, "ok") === true;
      return ok ? channel : null;
    } catch {
      return null;
    }
  })();
  return mainReady;
}

/** Asks the main-world script for the component and source of an element. */
export async function requestMain(doc: Document, element: Element): Promise<MainReply | null> {
  const channel = await ensureMainWorld(doc);
  if (channel === null) return null;
  const id = randomId();
  const target = randomId();
  return new Promise<MainReply | null>((resolve) => {
    const finish = (value: MainReply | null): void => {
      clearTimeout(timer);
      doc.removeEventListener(replyEventName(channel), onReply);
      element.removeAttribute(TARGET_ATTRIBUTE);
      resolve(value);
    };
    const onReply = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const reply = parseMainReply(event.detail);
      if (reply?.id === id) finish(reply);
    };
    const timer = setTimeout(() => {
      finish(null);
    }, REPLY_TIMEOUT_MS);
    doc.addEventListener(replyEventName(channel), onReply);
    element.setAttribute(TARGET_ATTRIBUTE, target);
    doc.dispatchEvent(new CustomEvent(channel, { detail: JSON.stringify({ id, target }) }));
  });
}

/** Component data for an element; unavailable data comes back as a typed reason, never an exception. */
export const resolveComponentData: ComponentResolver = async (element) => {
  const reply = await requestMain(document, element);
  if (reply === null) return { component: null, source: null, sourceUnavailableReason: "fetch-failed" };
  return {
    component: reply.component,
    source: reply.source,
    ...(reply.reason === undefined ? {} : { sourceUnavailableReason: reply.reason }),
  };
};
