import {
  LINK_PORTS,
  PROTOCOL_VERSION,
  parseAppMessage,
  type AppMessage,
  type BrowserInfo,
  type ExtensionMessage,
} from "@snaphub/devtools-protocol/protocol";
import type { LinkStatus } from "./messages";

export const PING_INTERVAL_MS = 20_000;
export const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000] as const;

export type SocketLike = {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send: (data: string) => void;
  close: () => void;
};

export type TokenStore = {
  get: () => Promise<string | null>;
  set: (token: string) => Promise<void>;
  clear: () => Promise<void>;
};

export type LinkOptions = {
  createSocket: (url: string) => SocketLike;
  store: TokenStore;
  browser: BrowserInfo;
  extensionVersion: string;
  /** Answers a request from CapKit; null means no reply. */
  handleRequest: (message: AppMessage) => Promise<ExtensionMessage | null>;
  onStatus?: (status: LinkStatus) => void;
};

const REJECT_TEXT: Record<string, string> = {
  "wrong-code": "That code doesn't match. Check the code in CapKit and try again.",
  expired: "That code expired. Open Developer tools in CapKit for a new one.",
  "too-many-attempts": "Too many wrong tries. Wait a minute, then pair again.",
  "not-pairing": "CapKit isn't waiting for a code. Open Developer tools in CapKit and start pairing.",
  "unknown-token": "CapKit no longer knows this browser. Pair again.",
};

/** Localhost WebSocket link to CapKit: pairing, hello, ping and request routing. */
export class Link {
  status: LinkStatus = { state: "connecting" };
  private socket: SocketLike | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private generation = 0;

  constructor(private readonly options: LinkOptions) {}

  private setStatus(status: LinkStatus): void {
    this.status = status;
    this.options.onStatus?.(status);
  }

  private frame(message: ExtensionMessage): string {
    return JSON.stringify(message);
  }

  /** Connects with the stored token; without one the state is "no-token". */
  async connect(): Promise<void> {
    const token = await this.options.store.get();
    if (token === null) {
      this.setStatus({ state: "no-token" });
      return;
    }
    this.setStatus({ state: "connecting" });
    this.open({ kind: "hello", token });
  }

  /** Pairs with a six-digit code, accepting a pasted code with spaces. */
  pair(rawCode: string): void {
    const code = rawCode.replaceAll(/\s+/g, "");
    if (!/^\d{6}$/.test(code)) {
      this.setStatus({ state: "rejected", reason: "Enter the 6-digit code shown in CapKit." });
      return;
    }
    this.setStatus({ state: "connecting" });
    this.open({ kind: "pair", code });
  }

  /** Popup opened or Retry pressed: reset backoff and try now. */
  retry(): void {
    this.attempt = 0;
    if (this.status.state === "connected" || this.status.state === "rejected" || this.status.state === "no-token") return;
    this.clearRetry();
    void this.connect();
  }

  async forget(): Promise<void> {
    await this.options.store.clear();
    this.teardown();
    this.setStatus({ state: "no-token" });
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private teardown(): void {
    this.generation += 1;
    this.clearRetry();
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket !== null) {
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
    }
  }

  private open(intent: { kind: "hello"; token: string } | { kind: "pair"; code: string }, portIndex = 0): void {
    this.teardown();
    const generation = this.generation;
    const port = LINK_PORTS[portIndex];
    if (port === undefined) {
      this.unreachable();
      return;
    }
    const socket = this.options.createSocket(`ws://127.0.0.1:${String(port)}`);
    this.socket = socket;
    let opened = false;
    const failed = (): void => {
      if (generation !== this.generation) return;
      if (!opened) {
        this.open(intent, portIndex + 1);
        return;
      }
      this.teardown();
      this.unreachable();
    };
    socket.onopen = (): void => {
      if (generation !== this.generation) return;
      opened = true;
      const common = { v: PROTOCOL_VERSION, browser: this.options.browser, extensionVersion: this.options.extensionVersion } as const;
      socket.send(
        this.frame(
          intent.kind === "hello"
            ? { ...common, type: "hello", token: intent.token }
            : { ...common, type: "pair", code: intent.code },
        ),
      );
    };
    socket.onerror = (): void => {
      // The close event that follows drives recovery.
    };
    socket.onclose = failed;
    socket.onmessage = (event): void => {
      if (generation !== this.generation || typeof event.data !== "string") return;
      const message = parseAppMessage(event.data);
      if (message !== null) void this.onMessage(message, socket);
    };
  }

  private unreachable(): void {
    this.setStatus({ state: "unreachable" });
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)] ?? 30_000;
    this.attempt += 1;
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      void this.connect();
    }, delay);
  }

  private async onMessage(message: AppMessage, socket: SocketLike): Promise<void> {
    switch (message.type) {
      case "paired":
        await this.options.store.set(message.token);
        socket.send(
          this.frame({
            v: PROTOCOL_VERSION,
            type: "hello",
            token: message.token,
            browser: this.options.browser,
            extensionVersion: this.options.extensionVersion,
          }),
        );
        return;
      case "pairRejected":
        this.teardown();
        this.setStatus({ state: "rejected", reason: REJECT_TEXT[message.reason] ?? "Pairing was rejected." });
        return;
      case "helloRejected":
        await this.options.store.clear();
        this.teardown();
        this.setStatus({ state: "rejected", reason: REJECT_TEXT["unknown-token"] ?? "Pair again." });
        return;
      case "ready":
        this.attempt = 0;
        this.setStatus({ state: "connected" });
        if (this.pingTimer !== null) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          socket.send(this.frame({ v: PROTOCOL_VERSION, type: "ping" }));
        }, PING_INTERVAL_MS);
        return;
      case "pong":
        return;
      case "hitTest":
      case "inspect":
      case "findSensitive": {
        const reply = await this.options.handleRequest(message);
        if (reply !== null && this.socket === socket) socket.send(this.frame(reply));
        return;
      }
    }
  }
}
