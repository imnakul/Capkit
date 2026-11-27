import { describe, expect, it } from "vitest";
import { replaceInstance, type Dispose } from "./instance";

function scope(): typeof globalThis {
  // A fresh object stands in for the isolated world's globals; only __capkitDispose is used.
  return Object.create(null) as typeof globalThis;
}

describe("replaceInstance", () => {
  it("installs when nothing was loaded before", () => {
    const world = scope();
    let installs = 0;
    replaceInstance((): Dispose => {
      installs += 1;
      return (): void => undefined;
    }, world);
    expect(installs).toBe(1);
    expect(world.__capkitDispose).toBeTypeOf("function");
  });

  it("tears down the earlier instance before installing again", () => {
    const world = scope();
    const events: string[] = [];
    replaceInstance((): Dispose => {
      events.push("install 1");
      return (): void => {
        events.push("dispose 1");
      };
    }, world);
    replaceInstance((): Dispose => {
      events.push("install 2");
      return (): void => undefined;
    }, world);
    expect(events).toEqual(["install 1", "dispose 1", "install 2"]);
  });

  it("still installs when the orphaned instance throws on teardown", () => {
    const world = scope();
    replaceInstance((): Dispose => (): void => {
      throw new Error("Extension context invalidated.");
    }, world);
    let installed = false;
    replaceInstance((): Dispose => {
      installed = true;
      return (): void => undefined;
    }, world);
    expect(installed).toBe(true);
  });
});
