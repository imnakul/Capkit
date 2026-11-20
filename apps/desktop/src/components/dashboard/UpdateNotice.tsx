import { Button } from "../ui/Button";
import type { UpdateController } from "./useUpdateStatus";

/** Sidebar notice for an available, running or failed install. Hidden otherwise. */
export function UpdateNotice({ controller }: { controller: UpdateController }): React.JSX.Element | null {
  const { status, guardMessage, install } = controller;
  const failed = status.state === "error" && status.message.startsWith("Update failed");
  if (status.state !== "available" && status.state !== "installing" && !failed) return null;

  const busy = status.state === "installing";
  const text =
    status.state === "available"
      ? "Update ready"
      : status.state === "installing"
        ? `Downloading… ${String(status.percent)}%`
        : status.message;

  return (
    <div
      aria-busy={busy}
      className="mb-2 rounded-md border border-content/10 bg-content/4 px-2.5 py-2 text-[12px]"
      role="status"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent" />
        <p className="min-w-0 flex-1 truncate font-medium text-content" title={text}>{text}</p>
        <Button aria-label={failed ? "Try again" : "Install and restart"} disabled={busy} variant="secondary" onClick={install}>
          {failed ? "Try again" : "Install"}
        </Button>
      </div>
      {guardMessage === null ? null : <p className="mt-1.5 text-warning">{guardMessage}</p>}
    </div>
  );
}
