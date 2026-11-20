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
import { Copy, Tick as Check } from "../icons";
import { Button } from "../ui/Button";
import { SettingRow } from "../ui/SettingRow";
import { Switch } from "../ui/Switch";

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
    return status.connected.map((browser) => `Connected to ${browser.name} ${browser.version}`);
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
      <SettingRow
        label="Developer tools"
        hint="Connect the CapKit Inspector browser extension for exact page elements, source locations and notes for AI. Off by default."
      >
        <Switch checked={enabled} disabled={busy || status === null} label="Developer tools" onChange={(next) => void toggle(next)} />
      </SettingRow>

      {status === null ? null : (
        <div aria-live="polite" className="mt-3 space-y-1 text-[12px] text-content/60">
          {describeState(status).map((line) => (
            <p className="flex items-center gap-2" key={line}>
              <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${status.connected.length > 0 && enabled ? "bg-emerald-500" : status.state === "error" ? "bg-danger" : "bg-content/30"}`} />
              {line}
            </p>
          ))}
        </div>
      )}

      {enabled && status?.state === "listening" ? (
        <div className="mt-3 rounded-lg border border-content/10 bg-content/4 p-3">
          {pairing === null || codeExpired || locked ? (
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-[12px] leading-4 text-content/60">
                {locked ? "Too many wrong codes. Generate a new code." : codeExpired ? "Code expired" : "Pair a browser by entering a one-time code in the extension."}
              </p>
              <Button variant="primary" onClick={() => void pair()}>
                {locked || codeExpired ? "New code" : "Pair a browser"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-content/60">Enter this code in the extension popup</p>
                <p aria-label={`Pairing code ${pairing.code.split("").join(" ")}`} className="mt-1 font-mono text-[20px] font-semibold tabular-nums text-content">{`${pairing.code.slice(0, 3)} ${pairing.code.slice(3)}`}</p>
                <p className="mt-1 text-[12px] tabular-nums text-content/60">Expires in {formatCountdown(remaining)}</p>
              </div>
              <Button onClick={() => void cancel()}>Cancel</Button>
            </div>
          )}
        </div>
      ) : null}

      {status !== null && status.paired.length > 0 ? (
        <ul aria-label="Paired browsers" className="mt-3 divide-y divide-content/8 rounded-lg border border-content/10 bg-content/4">
          {status.paired.map((entry) => {
            const isConnected = status.connected.some((browser) => browser.name === entry.browser.name);
            return (
              <li className="flex items-center gap-3 px-3 py-2.5" key={entry.origin}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-content">{entry.browser.name} {entry.browser.version}</p>
                  <p className="truncate text-[12px] text-content/60">{isConnected ? "Connected" : "Not connected"}, {entry.origin}</p>
                </div>
                {confirmingForget === entry.origin ? (
                  <div className="flex shrink-0 items-center gap-2" role="group" aria-label={`Forget ${entry.browser.name}?`}>
                    <p className="text-[12px] text-content/60">Forget {entry.browser.name}? It will need a new code.</p>
                    <Button onClick={() => void forget(entry.origin)}>Forget</Button>
                    <Button autoFocus variant="ghost" onClick={() => setConfirmingForget(null)}>Keep</Button>
                  </div>
                ) : (
                  <Button aria-label={`Forget ${entry.browser.name}`} variant="ghost" onClick={() => setConfirmingForget(entry.origin)}>Forget</Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="mt-3 flex items-center gap-3 rounded-lg border border-content/10 bg-content/4 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-content">Get the extension</p>
          <p className="mt-0.5 text-[12px] leading-4 text-content/60">{EXTENSION_STEPS}</p>
        </div>
        <Button aria-label="Copy steps" onClick={() => void copySteps()}>
          <span className="relative grid size-3 place-items-center" aria-hidden="true">
            <Copy className={`absolute transition-[opacity,transform,filter] duration-200 ease-arrive motion-reduce:transition-none ${stepsCopied ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0"}`} size={12} />
            <Check className={`absolute transition-[opacity,transform,filter] duration-200 ease-arrive motion-reduce:transition-none ${stepsCopied ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]"}`} size={12} />
          </span>
          {stepsCopied ? "Copied" : "Copy steps"}
        </Button>
      </div>

      {message === null ? null : <p className="mt-2 text-[12px] text-danger" role="alert">{message}</p>}
    </div>
  );
}
