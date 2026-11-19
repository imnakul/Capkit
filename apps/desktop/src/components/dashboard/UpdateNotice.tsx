import type { UpdateController } from "./useUpdateStatus";

/** Sidebar notice for an available, running or failed install. Hidden otherwise. */
export function UpdateNotice({ controller }: { controller: UpdateController }): React.JSX.Element | null {
  const { status, guardMessage, install } = controller;
  const failed = status.state === "error" && status.message.startsWith("Update failed");
  if (status.state !== "available" && status.state !== "installing" && !failed) return null;

  const busy = status.state === "installing";
  const text =
    status.state === "available"
      ? `Update available: v${status.version}`
      : status.state === "installing"
        ? `Downloading… ${String(status.percent)}%`
        : status.message;

  return (
    <div
      aria-busy={busy}
      className="mb-3 rounded-lg border border-stone-300/80 bg-white/70 p-2.5 text-[12px] dark:border-white/10 dark:bg-white/5"
      role="status"
    >
      <p className="font-medium text-stone-800 dark:text-stone-200">{text}</p>
      {guardMessage === null ? null : <p className="mt-1 text-amber-700 dark:text-amber-300">{guardMessage}</p>}
      <button
        className="mt-2 w-full rounded-md bg-[var(--snaphub-accent)] px-2.5 py-1.5 text-[12px] font-semibold text-stone-950 outline-none transition focus-visible:ring-2 focus-visible:ring-stone-900 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-white"
        disabled={busy}
        type="button"
        onClick={install}
      >
        {failed ? "Try again" : "Install and restart"}
      </button>
    </div>
  );
}
