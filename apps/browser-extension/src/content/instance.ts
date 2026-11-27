/** Tears down one content-script instance: its tools and its message listener. */
export type Dispose = () => void;

declare global {
  var __capkitDispose: Dispose | undefined;
}

/**
 * Runs `install` and records its teardown, first tearing down any earlier instance.
 *
 * After the extension reloads or updates, the old content script stays in open tabs but
 * can no longer receive messages, while its globals survive in the same isolated world.
 * A "skip if already loaded" flag would then block the new script forever (until the
 * page reloads). The background injects only when its ping gets no answer, so a live
 * instance is never replaced.
 */
export function replaceInstance(install: () => Dispose, scope: typeof globalThis = globalThis): void {
  const previous = scope.__capkitDispose;
  scope.__capkitDispose = undefined;
  if (previous !== undefined) {
    try {
      previous();
    } catch {
      // An orphaned instance's chrome.* calls can throw; its DOM cleanup already ran.
    }
  }
  scope.__capkitDispose = install();
}
