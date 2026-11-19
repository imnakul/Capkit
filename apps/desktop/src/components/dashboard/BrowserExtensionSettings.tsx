import { useCallback, useEffect, useState } from "react";
import {
  cancelBrowserPairing,
  describeInvokeError,
  forgetBrowser,
  getBrowserLinkStatus,
  listenForBrowserLinkStatus,
  setBrowserLinkEnabled,
  startBrowserPairing,
  type BrowserLinkStatus,
  type PairingCode,
} from "../../lib/tauri";

const buttonClass =
  "shrink-0 rounded-md border border-stone-300 bg-stone-50 px-3 py-1.5 text-[12px] font-semibold text-stone-700 outline-none transition hover:border-stone-500 focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-[#333431] dark:text-stone-300 dark:hover:border-white/20";

/** Whole seconds left until `expiresAt`, never below zero. */
export function secondsUntil(expiresAt: string, now: number): number {
  const target = Date.parse(expiresAt);
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.ceil((target - now) / 1000));
}

/** Status lines: one per connected browser, otherwise a single waiting or error line. */
function describeState(status: BrowserLinkStatus): string[] {
  if (!status.enabled) return ["Off. Nothing is listening."];
  if (status.state === "error") return [status.error ?? "Could not start the browser link."];
  if (status.connected.length > 0) {
    return status.connected.map((browser) => `Connected · ${browser.name} ${browser.version}`);
  }
  return [status.port === null ? "Starting…" : "Waiting for the extension"];
}

/** `m:ss`, as in `1:59`. */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, "0")}`;
}

const EXTENSION_STEPS = "Not in the Chrome Web Store yet. In Chrome or Aside, open chrome://extensions, turn on Developer mode, choose Load unpacked, and select the extension folder.";

/**
 * The Developer tools switch, the one-time pairing code and the paired browsers.
 * Rust owns every secret; this panel only ever sees a short code and origins.
 */
export function BrowserExtensionSettings(): React.JSX.Element {
  const [status, setStatus] = useState<BrowserLinkStatus | null>(null);
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingForget, setConfirmingForget] = useState<string | null>(null);
  const [stepsCopied, setStepsCopied] = useState(false);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void getBrowserLinkStatus().then(
      (next) => {
        if (active) setStatus(next);
      },
      () => undefined,
    );
    void listenForBrowserLinkStatus((next) => {
      if (active) setStatus(next);
    }).then(
      (stop) => {
        if (active) unlisten = stop;
        else stop();
      },
      () => undefined,
    );
    return (): void => {
      active = false;
      unlisten?.();
    };
  }, []);

  const remaining = pairing === null ? 0 : secondsUntil(pairing.expiresAt, now);
  const codeExpired = pairing !== null && remaining === 0;

  useEffect(() => {
    if (pairing === null || codeExpired) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return (): void => window.clearInterval(timer);
  }, [codeExpired, pairing]);

  // A paired browser appearing means the code did its job.
  const pairedCount = status?.paired.length ?? 0;
  useEffect(() => {
    setPairing(null);
  }, [pairedCount]);

  const toggle = useCallback(async (enabled: boolean): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      setStatus(await setBrowserLinkEnabled(enabled));
      if (!enabled) setPairing(null);
    } catch (error: unknown) {
      setMessage(describeInvokeError(error, "The browser link did not change"));
    } finally {
      setBusy(false);
    }
  }, []);

  const pair = useCallback(async (): Promise<void> => {
    setMessage(null);
    try {
      const code = await startBrowserPairing();
      setNow(Date.now());
      setStatus((current) => (current === null ? current : { ...current, pairingLocked: false }));
      setPairing(code);
    } catch (error: unknown) {
      setMessage(describeInvokeError(error, "Could not create a pairing code"));
    }
  }, []);

  const cancel = useCallback(async (): Promise<void> => {
    setPairing(null);
    await cancelBrowserPairing().catch(() => undefined);
  }, []);

  const forget = useCallback(async (origin: string): Promise<void> => {
    setMessage(null);
    setConfirmingForget(null);
    try {
      setStatus(await forgetBrowser(origin));
    } catch (error: unknown) {
      setMessage(describeInvokeError(error, "Could not forget that browser"));
    }
  }, []);

  const copySteps = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(EXTENSION_STEPS);
      setStepsCopied(true);
    } catch {
      setMessage("Could not copy the steps");
    }
  }, []);

  const enabled = status?.enabled ?? false;
  const locked = status?.pairingLocked === true;

  return (
    <div>
      <label className="flex cursor-pointer items-start justify-between gap-3">
        <span>
          <span className="block text-xs font-semibold text-stone-800 dark:text-stone-200">Developer tools</span>
          <span className="mt-0.5 block text-[12px] leading-4 text-stone-500 dark:text-stone-400">
            Connect the CapKit Inspector browser extension for exact page elements, source locations and notes for AI. Off by default.
          </span>
        </span>
        <span className="relative mt-0.5 shrink-0">
          <input
            aria-label="Developer tools"
            checked={enabled}
            className="peer sr-only"
            disabled={busy || status === null}
            role="switch"
            type="checkbox"
            onChange={(event) => void toggle(event.currentTarget.checked)}
          />
          <span className="block h-5 w-9 rounded-full bg-stone-300 transition peer-checked:bg-[var(--snaphub-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-stone-900 peer-focus-visible:ring-offset-2 dark:bg-stone-700 dark:peer-focus-visible:ring-white" />
          <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4 peer-checked:bg-[#171815]" />
        </span>
      </label>

      {status === null ? null : (
        <div aria-live="polite" className="mt-3 space-y-0.5 text-[12px] text-stone-500 dark:text-stone-400">
          {describeState(status).map((line) => <p key={line}>{line}</p>)}
        </div>
      )}

      {enabled && status?.state === "listening" ? (
        <div className="mt-3 rounded-lg border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-[#2b2c29]">
          {pairing === null || codeExpired || locked ? (
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-[12px] leading-4 text-stone-600 dark:text-stone-400">
                {locked ? "Too many wrong codes. Generate a new code." : codeExpired ? "Code expired" : "Pair a browser by entering a one-time code in the extension."}
              </p>
              <button className={buttonClass} type="button" onClick={() => void pair()}>
                {locked || codeExpired ? "New code" : "Pair a browser"}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-stone-500 dark:text-stone-400">Enter this code in the extension popup</p>
                <p aria-label={`Pairing code ${pairing.code.split("").join(" ")}`} className="mt-1 font-mono text-2xl font-semibold tracking-[0.15em] tabular-nums text-stone-900 dark:text-stone-100">{`${pairing.code.slice(0, 3)} ${pairing.code.slice(3)}`}</p>
                <p className="mt-1 text-[12px] tabular-nums text-stone-500 dark:text-stone-400">Expires in {formatCountdown(remaining)}</p>
              </div>
              <button className={buttonClass} type="button" onClick={() => void cancel()}>Cancel</button>
            </div>
          )}
        </div>
      ) : null}

      {status !== null && status.paired.length > 0 ? (
        <ul aria-label="Paired browsers" className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white dark:divide-white/8 dark:border-white/10 dark:bg-[#2b2c29]">
          {status.paired.map((entry) => {
            const isConnected = status.connected.some((browser) => browser.name === entry.browser.name);
            return (
              <li className="flex items-center gap-3 px-3 py-2.5" key={entry.origin}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-stone-800 dark:text-stone-200">{entry.browser.name} {entry.browser.version}</p>
                  <p className="truncate text-[12px] text-stone-500 dark:text-stone-400">{isConnected ? "Connected" : "Not connected"} · {entry.origin}</p>
                </div>
                {confirmingForget === entry.origin ? (
                  <div className="flex shrink-0 items-center gap-2" role="group" aria-label={`Forget ${entry.browser.name}?`}>
                    <p className="text-[12px] text-stone-600 dark:text-stone-300">Forget {entry.browser.name}? It will need a new code.</p>
                    <button className={buttonClass} type="button" onClick={() => void forget(entry.origin)}>Forget</button>
                    <button autoFocus className={buttonClass} type="button" onClick={() => setConfirmingForget(null)}>Keep</button>
                  </div>
                ) : (
                  <button aria-label={`Forget ${entry.browser.name}`} className={buttonClass} type="button" onClick={() => setConfirmingForget(entry.origin)}>Forget</button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="mt-3 flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-[#2b2c29]">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-stone-800 dark:text-stone-200">Get the extension</p>
          <p className="mt-0.5 text-[12px] leading-4 text-stone-500 dark:text-stone-400">{EXTENSION_STEPS}</p>
        </div>
        <button className={buttonClass} type="button" onClick={() => void copySteps()}>{stepsCopied ? "Copied" : "Copy steps"}</button>
      </div>

      {message === null ? null : <p className="mt-2 text-[12px] text-red-600 dark:text-red-400" role="alert">{message}</p>}
    </div>
  );
}
