import { useCallback, useEffect, useState, type ClipboardEvent, type SyntheticEvent, type ReactElement } from "react";
import { z } from "zod";
import { linkStatusSchema, siteAccessSchema, type BackgroundRequest, type LinkStatus, type SiteAccess } from "../messages";

export type Transport = (request: BackgroundRequest) => Promise<unknown>;
export type RequestPermission = (origins: string[]) => Promise<boolean>;

const SPINNER_DELAY_MS = 300;
const SETTLE_POLL_MS = 400;
const SETTLE_ATTEMPTS = 8;

const button =
  "rounded-md border border-hairline bg-graphite-raised px-3 py-1.5 text-sm font-medium text-ink transition-[transform,background-color] duration-100 ease-out-strong hover:bg-white/10 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:active:scale-100";
const primary =
  "rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-graphite transition-[transform,opacity] duration-100 ease-out-strong hover:opacity-90 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 motion-reduce:active:scale-100";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function Spinner(): ReactElement {
  return (
    <span
      role="status"
      aria-label="Connecting"
      className="inline-block size-4 animate-spin rounded-full border-2 border-white/20 border-t-accent motion-reduce:animate-none"
    />
  );
}

const inspectResultSchema = z.object({ ok: z.boolean() });

export function Popup({ send, requestPermission }: { send: Transport; requestPermission: RequestPermission }): ReactElement {
  const [status, setStatus] = useState<LinkStatus>({ state: "connecting" });
  const [access, setAccess] = useState<SiteAccess | null>(null);
  const [code, setCode] = useState("");
  const [showSpinner, setShowSpinner] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

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

  const inspect = (): void => {
    setInspectError(null);
    void send({ kind: "inspectActiveTab" }).then((raw) => {
      const parsed = inspectResultSchema.safeParse(raw);
      if (parsed.success && parsed.data.ok) {
        window.close();
        return;
      }
      setInspectError("Couldn't start the inspector here. Reload the page and try again.");
    });
  };

  const canInspect = access !== null && access.state !== "unavailable";

  const inspectBlock = (
    <div className="flex flex-col gap-2">
      <button type="button" className={primary} disabled={!canInspect} onClick={inspect}>
        Inspect page
      </button>
      {access?.state === "unavailable" ? (
        <p className="text-xs text-ink-muted">Inspect works on web pages (http and https) only.</p>
      ) : null}
      {inspectError === null ? null : (
        <p role="alert" className="text-xs text-danger">
          {inspectError}
        </p>
      )}
    </div>
  );

  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-sm font-semibold tracking-tight">CapKit Inspector</h1>

      {status.state === "no-token" || status.state === "rejected" ? (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <label htmlFor="pair-code" className="text-xs text-ink-muted">
            Enter the 6-digit code from CapKit → Settings → Developer tools.
          </label>
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
            className="rounded-md border border-hairline bg-graphite-raised px-3 py-2 font-mono text-lg tracking-[0.3em] tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-accent"
          />
          {status.state === "rejected" && status.reason !== undefined ? (
            <p role="alert" className="text-xs text-danger">
              {status.reason}
            </p>
          ) : null}
          <button type="submit" disabled={code.length !== 6} className={primary}>
            {status.state === "rejected" ? "Pair again" : "Pair"}
          </button>
        </form>
      ) : null}

      {status.state === "connecting" ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          {showSpinner ? <Spinner /> : null}
          Connecting to CapKit…
        </p>
      ) : null}

      {status.state === "connected" ? null : inspectBlock}

      {status.state === "unreachable" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">CapKit isn&apos;t running or Developer tools is off.</p>
          <button
            type="button"
            className={button}
            onClick={() => {
              void settle({ kind: "retry" });
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {status.state === "connected" ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
            Connected to CapKit
          </p>
          {inspectBlock}
          <div className="flex items-center justify-between gap-2 border-t border-hairline pt-3 text-xs">
            <span className="text-ink-muted">Site access</span>
            {access?.state === "allowed" ? <span>Allowed</span> : null}
            {access?.state === "unavailable" ? <span className="text-ink-muted">Not available on this page</span> : null}
            {access?.state === "needs-access" ? (
              <button
                type="button"
                className={button}
                onClick={() => {
                  requestAccess(false);
                }}
              >
                Allow on this site
              </button>
            ) : null}
          </div>
          {access?.state === "needs-access" ? (
            <button
              type="button"
              className="self-start text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent"
              onClick={() => {
                requestAccess(true);
              }}
            >
              Allow on all sites
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
