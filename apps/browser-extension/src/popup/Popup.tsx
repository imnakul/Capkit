import { useCallback, useEffect, useState, type ClipboardEvent, type ReactElement, type SyntheticEvent } from "react";
import { z } from "zod";
import { MENU_ITEMS } from "../menus";
import { linkStatusSchema, siteAccessSchema, type BackgroundRequest, type LinkStatus, type SiteAccess, type Tool } from "../messages";

export type Transport = (request: BackgroundRequest) => Promise<unknown>;
export type RequestPermission = (origins: string[]) => Promise<boolean>;
/** Command name to its current shortcut, as set in chrome://extensions/shortcuts. */
export type LoadShortcuts = () => Promise<ReadonlyMap<string, string>>;

const SPINNER_DELAY_MS = 300;
const SETTLE_POLL_MS = 400;
const SETTLE_ATTEMPTS = 8;

// Same recipe as the dashboard's components/ui/Button.
const buttonBase =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium outline-none transition-[transform,background-color,color,filter] duration-100 ease-out focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100";
const secondary = `${buttonBase} bg-content/6 text-content hover:bg-content/10 active:scale-[0.97]`;
const primary = `${buttonBase} bg-accent text-accent-ink hover:brightness-95 active:scale-[0.97]`;

type ToolCopy = { name: string; description: string; error: string; icon: ReactElement };

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: "size-4",
} as const;

const TOOL_COPY: Record<Tool, ToolCopy> = {
  inspect: {
    name: "Inspect",
    description: "Spacing, styles and source",
    error: "the inspector",
    icon: (
      <svg {...iconProps}>
        <path d="M5 4.5l5.8 14.2 2.1-5.8 5.8-2.1z" />
      </svg>
    ),
  },
  pick: {
    name: "Pick and comment",
    description: "Notes on elements for an AI agent",
    error: "Pick and comment",
    icon: (
      <svg {...iconProps}>
        <path d="M5 5.5h14v10H10l-5 4z" />
        <path d="M9 9.5h6M9 12h3.5" />
      </svg>
    ),
  },
  font: {
    name: "Font",
    description: "Read text styles, copy as CSS",
    error: "the font tool",
    icon: (
      <svg {...iconProps}>
        <path d="M4 19l5-14 5 14M6 14h6" />
        <path d="M15.5 12.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM18 12v7" />
      </svg>
    ),
  },
  color: {
    name: "Colour",
    description: "Element colours and an eyedropper",
    error: "the colour tool",
    icon: (
      <svg {...iconProps}>
        <path d="M12 3.5s5.5 6 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 9.5 12 3.5 12 3.5z" />
      </svg>
    ),
  },
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function Spinner(): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-content/15 border-t-content/60 motion-reduce:animate-none"
    />
  );
}

function Keys({ shortcut }: { shortcut: string }): ReactElement {
  return (
    <span aria-hidden="true" className="flex gap-0.5">
      {shortcut.split("+").map((key) => (
        <kbd key={key} className="grid h-[18px] min-w-[18px] place-items-center rounded bg-content/8 px-1 font-mono text-[10px] font-medium text-content/60">
          {key}
        </kbd>
      ))}
    </span>
  );
}

const startResultSchema = z.object({ ok: z.boolean() });
const noShortcuts: LoadShortcuts = () => Promise.resolve(new Map());

export function Popup({
  send,
  requestPermission,
  loadShortcuts = noShortcuts,
}: {
  send: Transport;
  requestPermission: RequestPermission;
  loadShortcuts?: LoadShortcuts;
}): ReactElement {
  const [status, setStatus] = useState<LinkStatus>({ state: "connecting" });
  const [access, setAccess] = useState<SiteAccess | null>(null);
  const [code, setCode] = useState("");
  const [showSpinner, setShowSpinner] = useState(false);
  const [toolError, setToolError] = useState<string | null>(null);
  const [shortcuts, setShortcuts] = useState<ReadonlyMap<string, string>>(new Map());

  const refreshAccess = useCallback(async (): Promise<void> => {
    const parsed = siteAccessSchema.safeParse(await send({ kind: "siteAccess" }));
    setAccess(parsed.success ? parsed.data : { state: "unavailable" });
  }, [send]);

  const read = useCallback(
    async (request: BackgroundRequest): Promise<LinkStatus> => {
      const parsed = linkStatusSchema.safeParse(await send(request));
      return parsed.success ? parsed.data : { state: "unreachable" };
    },
    [send],
  );

  const settle = useCallback(
    async (first: BackgroundRequest): Promise<void> => {
      let next = await read(first);
      setStatus(next);
      for (let i = 0; i < SETTLE_ATTEMPTS && next.state === "connecting"; i += 1) {
        await wait(SETTLE_POLL_MS);
        next = await read({ kind: "status" });
        setStatus(next);
      }
    },
    [read],
  );

  useEffect(() => {
    void settle({ kind: "retry" });
  }, [settle]);

  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);

  useEffect(() => {
    void loadShortcuts()
      .then(setShortcuts)
      .catch(() => undefined);
  }, [loadShortcuts]);

  useEffect(() => {
    if (status.state !== "connecting") {
      setShowSpinner(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowSpinner(true);
    }, SPINNER_DELAY_MS);
    return (): void => {
      clearTimeout(timer);
    };
  }, [status.state]);

  const onPaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    event.preventDefault();
    setCode(event.clipboardData.getData("text").replaceAll(/\D/g, "").slice(0, 6));
  };

  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    void settle({ kind: "pair", code });
  };

  // Called synchronously from the click so Chrome sees the user gesture.
  const requestAccess = (all: boolean): void => {
    const origins = all ? ["<all_urls>"] : access?.origin === undefined ? [] : [access.origin];
    if (origins.length === 0) return;
    void requestPermission(origins)
      .catch(() => false)
      .then(refreshAccess);
  };

  const startTool = (tool: Tool): void => {
    setToolError(null);
    void send({ kind: "startTool", tool }).then((raw) => {
      const parsed = startResultSchema.safeParse(raw);
      if (parsed.success && parsed.data.ok) {
        window.close();
        return;
      }
      setToolError(`Couldn't start ${TOOL_COPY[tool].error} here. Reload the page and try again.`);
    });
  };

  const canStart = access !== null && access.state !== "unavailable";

  return (
    <main className="flex flex-col">
      <header className="flex h-11 items-center gap-2 border-b border-content/8 px-3">
        <span aria-hidden="true" className="grid size-5 place-items-center rounded-[5px] bg-accent">
          <span className="size-2 rounded-[2px] bg-accent-ink" />
        </span>
        <h1 className="m-0 flex-1 text-[13px] font-semibold">CapKit</h1>
        <p role="status" className="m-0 flex items-center gap-1.5 text-[11px] text-content/60">
          {status.state === "connecting" ? (
            <>
              {showSpinner ? <Spinner /> : null}
              Connecting…
            </>
          ) : status.state === "connected" ? (
            <>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
              Connected to CapKit
            </>
          ) : (
            <>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-content/30" />
              Not connected
            </>
          )}
        </p>
      </header>

      <nav aria-label="Page tools" className="flex flex-col p-1.5">
        {MENU_ITEMS.map((item) => {
          const copy = TOOL_COPY[item.tool];
          const shortcut = shortcuts.get(item.command) ?? "";
          const descriptionId = `tool-${item.tool}-description`;
          return (
            <button
              key={item.tool}
              type="button"
              disabled={!canStart}
              aria-describedby={descriptionId}
              {...(shortcut === "" ? {} : { "aria-keyshortcuts": shortcut })}
              onClick={() => {
                startTool(item.tool);
              }}
              className="group flex h-11 items-center gap-2.5 rounded-md px-2 text-left outline-none transition-[background-color,transform] duration-100 ease-out hover:bg-content/6 focus-visible:ring-2 focus-visible:ring-accent/50 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-content/6 text-content/80 transition-colors duration-100 group-hover:bg-content/10 group-hover:text-content">
                {copy.icon}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[12px] font-medium leading-4">{copy.name}</span>
                <span id={descriptionId} aria-hidden="true" className="truncate text-[11px] leading-4 text-content/45">
                  {copy.description}
                </span>
              </span>
              {shortcut === "" ? null : <Keys shortcut={shortcut} />}
            </button>
          );
        })}
        {access?.state === "unavailable" ? (
          <p className="m-0 px-2 pb-1 pt-1.5 text-[11px] text-content/60">These tools work on web pages (http and https) only.</p>
        ) : null}
        {toolError === null ? null : (
          <p role="alert" className="m-0 px-2 pb-1 pt-1.5 text-[11px] text-danger">
            {toolError}
          </p>
        )}
      </nav>

      {status.state === "no-token" || status.state === "rejected" ? (
        <form onSubmit={submit} className="flex flex-col gap-2 border-t border-content/8 p-3">
          <label htmlFor="pair-code" className="text-[11px] text-content/60">
            Enter the 6-digit code from CapKit → Settings → Developer tools.
          </label>
          <div className="flex gap-2">
            <input
              id="pair-code"
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              onPaste={onPaste}
              onChange={(event) => {
                setCode(event.target.value.replaceAll(/\D/g, ""));
              }}
              className="h-7 min-w-0 flex-1 rounded-md bg-content/6 px-2.5 font-mono text-[13px] tracking-[0.3em] tabular-nums text-content outline-none placeholder:text-content/45 focus-visible:ring-2 focus-visible:ring-accent/50"
            />
            <button type="submit" disabled={code.length !== 6} className={primary}>
              {status.state === "rejected" ? "Pair again" : "Pair"}
            </button>
          </div>
          {status.state === "rejected" && status.reason !== undefined ? (
            <p role="alert" className="m-0 text-[11px] text-danger">
              {status.reason}
            </p>
          ) : null}
        </form>
      ) : null}

      {status.state === "unreachable" ? (
        <div className="flex items-center gap-2 border-t border-content/8 p-3">
          <p className="m-0 flex-1 text-[11px] text-content/60">CapKit isn&apos;t running or Developer tools is off.</p>
          <button
            type="button"
            className={secondary}
            onClick={() => {
              void settle({ kind: "retry" });
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {access === null ? null : (
        <footer className="flex flex-col gap-1 border-t border-content/8 px-3 py-2.5">
          <div className="flex min-h-7 items-center justify-between gap-2 text-[11px]">
            <span className="text-content/60">Site access</span>
            {access.state === "allowed" ? <span className="text-content/80">Allowed</span> : null}
            {access.state === "unavailable" ? <span className="text-content/45">Not available on this page</span> : null}
            {access.state === "needs-access" ? (
              <button
                type="button"
                className={secondary}
                onClick={() => {
                  requestAccess(false);
                }}
              >
                Allow on this site
              </button>
            ) : null}
          </div>
          {access.state === "needs-access" ? (
            <button
              type="button"
              className="self-end rounded text-[11px] text-content/45 outline-none hover:text-content focus-visible:ring-2 focus-visible:ring-accent/50"
              onClick={() => {
                requestAccess(true);
              }}
            >
              Allow on all sites
            </button>
          ) : null}
        </footer>
      )}
    </main>
  );
}
