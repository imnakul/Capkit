import {
  CHANNEL_ATTRIBUTE,
  HOST_TAG,
  TARGET_ATTRIBUTE,
  parseMainRequest,
  replyEventName,
  type MainReply,
} from "./bridge";
import { debugSource, debugStack, describeComponent, findFiber } from "./component";
import { SourceMapCache, normalizeSourcePath, resolveSource } from "./source";

const FETCH_TIMEOUT_MS = 1500;
const MAX_SCRIPT_BYTES = 5 * 1024 * 1024;

async function fetchSameOriginText(url: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) return null;
    if (new URL(url, location.href).origin !== location.origin) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
      if (!response.ok) return null;
      const text = await response.text();
      return text.length > MAX_SCRIPT_BYTES ? null : text;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

const cache = new SourceMapCache(fetchSameOriginText);

async function describeTarget(id: string, element: Element): Promise<MainReply> {
  const fiber = findFiber(element);
  if (fiber === null) return { id, component: null, source: null, reason: "no-react" };

  const info = describeComponent(fiber);
  const component = info === null || info === "minified" ? null : info;

  const legacy = debugSource(fiber);
  if (legacy !== null) {
    const file = normalizeSourcePath(legacy.file, location.origin);
    return { id, component, source: { file, line: legacy.line, column: legacy.column } };
  }
  const stack = debugStack(fiber);
  if (stack === null) {
    return { id, component, source: null, reason: "production-build" };
  }
  const result = await resolveSource(stack, cache, location.origin);
  if (result.ok) return { id, component, source: result.location };
  return { id, component, source: null, reason: result.reason };
}

function install(): void {
  const host = document.querySelector(HOST_TAG);
  const channel = host?.getAttribute(CHANNEL_ATTRIBUTE) ?? null;
  if (host === null || channel === null) return;
  host.removeAttribute(CHANNEL_ATTRIBUTE);

  document.addEventListener(channel, (event) => {
    if (!(event instanceof CustomEvent)) return;
    const request = parseMainRequest(event.detail);
    if (request === null) return;
    const target = document.querySelector(`[${TARGET_ATTRIBUTE}="${CSS.escape(request.target)}"]`);
    const reply = (value: MainReply): void => {
      document.dispatchEvent(new CustomEvent(replyEventName(channel), { detail: JSON.stringify(value) }));
    };
    if (target === null) {
      reply({ id: request.id, component: null, source: null, reason: "no-react" });
      return;
    }
    void describeTarget(request.id, target).then(reply, () => {
      reply({ id: request.id, component: null, source: null, reason: "fetch-failed" });
    });
  });
}

install();
