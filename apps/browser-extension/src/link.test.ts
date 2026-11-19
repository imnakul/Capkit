import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKOFF_MS, Link, PING_INTERVAL_MS, type SocketLike, type TokenStore } from "./link";

class FakeSocket implements SocketLike {
  static instances: FakeSocket[] = [];
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  sent: unknown[] = [];
  closed = false;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.onopen?.(new Event("open"));
  }
  fail(): void {
    this.onclose?.(new CloseEvent("close"));
  }
  receive(message: object): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify({ v: 1, ...message }) }));
  }
}

const TOKEN = "t".repeat(43);

function memoryStore(initial: string | null): TokenStore & { value: string | null } {
  const store = {
    value: initial,
    get: (): Promise<string | null> => Promise.resolve(store.value),
    set: (token: string): Promise<void> => {
      store.value = token;
      return Promise.resolve();
    },
    clear: (): Promise<void> => {
      store.value = null;
      return Promise.resolve();
    },
  };
  return store;
}

function make(token: string | null): { link: Link; store: ReturnType<typeof memoryStore> } {
  const store = memoryStore(token);
  const link = new Link({
    createSocket: (url): SocketLike => new FakeSocket(url),
    store,
    browser: { name: "Chrome", version: "130" },
    extensionVersion: "0.3.0",
    handleRequest: (): Promise<null> => Promise.resolve(null),
  });
  return { link, store };
}

const last = (): FakeSocket => {
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
  if (socket === undefined) throw new Error("no socket");
  return socket;
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Link", () => {
  it("reports no-token and opens nothing without a stored token", async () => {
    const { link } = make(null);
    await link.connect();
    expect(link.status.state).toBe("no-token");
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it("sends hello, becomes connected on ready, then pings every 20 seconds", async () => {
    const { link } = make(TOKEN);
    await link.connect();
    last().open();
    expect(last().sent[0]).toMatchObject({ type: "hello", token: TOKEN });
    last().receive({ type: "ready" });
    expect(link.status.state).toBe("connected");
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS);
    expect(last().sent[1]).toEqual({ v: 1, type: "ping" });
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS);
    expect(last().sent).toHaveLength(3);
  });

  it("tries the next port when the first refuses, then reports unreachable", async () => {
    const { link } = make(TOKEN);
    await link.connect();
    expect(last().url).toBe("ws://127.0.0.1:47811");
    last().fail();
    expect(last().url).toBe("ws://127.0.0.1:47812");
    last().fail();
    last().fail();
    expect(link.status.state).toBe("unreachable");
  });

  it("backs off 1s, 2s, 4s between reconnect attempts and resets after ready", async () => {
    const { link } = make(TOKEN);
    await link.connect();
    const failAll = (): void => {
      for (let i = 0; i < 3; i += 1) last().fail();
    };
    failAll();
    const before = FakeSocket.instances.length;
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] - 1);
    expect(FakeSocket.instances).toHaveLength(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.instances).toHaveLength(before + 1);
    failAll();
    const second = FakeSocket.instances.length;
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[1]);
    expect(FakeSocket.instances).toHaveLength(second + 1);
  });

  it("reconnects immediately when the popup opens (retry)", async () => {
    const { link } = make(TOKEN);
    await link.connect();
    for (let i = 0; i < 3; i += 1) last().fail();
    const before = FakeSocket.instances.length;
    link.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSocket.instances).toHaveLength(before + 1);
  });

  it("pairs with a pasted code containing a space, stores the token and says hello", async () => {
    const { link, store } = make(null);
    link.pair("123 456");
    last().open();
    expect(last().sent[0]).toMatchObject({ type: "pair", code: "123456" });
    last().receive({ type: "paired", token: TOKEN });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.value).toBe(TOKEN);
    expect(last().sent[1]).toMatchObject({ type: "hello", token: TOKEN });
  });

  it("rejects a malformed code without opening a socket", () => {
    const { link } = make(null);
    link.pair("12ab");
    expect(link.status.state).toBe("rejected");
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it("shows a plain reason when pairing is rejected", () => {
    const { link } = make(null);
    link.pair("123456");
    last().open();
    last().receive({ type: "pairRejected", reason: "wrong-code" });
    expect(link.status).toMatchObject({ state: "rejected" });
    expect(link.status.reason).toMatch(/code/i);
  });

  it("clears the token when CapKit no longer knows it", async () => {
    const { link, store } = make(TOKEN);
    await link.connect();
    last().open();
    last().receive({ type: "helloRejected", reason: "unknown-token" });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.value).toBeNull();
    expect(link.status.state).toBe("rejected");
  });

  it("ignores frames that fail validation", async () => {
    const { link } = make(TOKEN);
    await link.connect();
    last().open();
    last().receive({ type: "ready", extra: true });
    expect(link.status.state).toBe("connecting");
  });
});
