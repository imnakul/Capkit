import { useCallback, useEffect, useState } from "react";
import { updateGuardMessage, type UpdateStatus } from "../../domain/updates";
import {
  autoCheckForUpdate,
  checkForUpdate,
  describeInvokeError,
  getUpdateStatus,
  installUpdate,
  listenForUpdateStatus,
} from "../../lib/tauri";

export type UpdateController = {
  status: UpdateStatus;
  /** A refusal from the install command, such as an active capture. */
  guardMessage: string | null;
  check: () => void;
  install: () => void;
};

/**
 * Follows the native update state. `autoCheck` runs the once-per-process
 * launch check when the dashboard mounts; the native side ignores repeats.
 */
export function useUpdateStatus(autoCheck: boolean): UpdateController {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const [guardMessage, setGuardMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void listenForUpdateStatus((next) => {
      if (active) setStatus(next);
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    });
    void getUpdateStatus()
      .then((current) => {
        if (active) setStatus(current);
      })
      .catch(() => undefined);
    return (): void => {
      active = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!autoCheck) return;
    void autoCheckForUpdate()
      .then((next) => setStatus(next))
      .catch(() => undefined);
    // Only the first mount decides; the native side runs one check per process.
  }, []);

  const check = useCallback((): void => {
    setGuardMessage(null);
    void checkForUpdate()
      .then(setStatus)
      .catch(() => setStatus({ state: "error", currentVersion: "", message: "Couldn't check for updates. Try again later." }));
  }, []);

  const install = useCallback((): void => {
    setGuardMessage(null);
    void installUpdate()
      .then(setStatus)
      .catch((error: unknown) => {
        const message = describeInvokeError(error, "Update failed.");
        setGuardMessage(message.includes(updateGuardMessage) ? updateGuardMessage : message.replace(/^SH-[A-Z]+-\d+:\s*/, ""));
      });
  }, []);

  return { status, guardMessage, check, install };
}
