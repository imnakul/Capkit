import { describe, expect, it } from "vitest";
import { updateStatusSchema } from "./updates";

describe("updateStatusSchema", () => {
  it("accepts every state the native side can send", () => {
    const states: unknown[] = [
      { state: "unsupported" },
      { state: "idle" },
      { state: "checking" },
      { state: "up-to-date", currentVersion: "0.3.0" },
      { state: "available", currentVersion: "0.3.0", version: "0.4.0", notes: null },
      { state: "installing", version: "0.4.0", percent: 40 },
      { state: "error", currentVersion: "0.3.0", message: "Update failed. CapKit is still on v0.3.0." },
    ];
    for (const state of states) expect(updateStatusSchema.safeParse(state).success).toBe(true);
  });

  it("rejects an unknown state and an out-of-range percent", () => {
    expect(updateStatusSchema.safeParse({ state: "downloading" }).success).toBe(false);
    expect(updateStatusSchema.safeParse({ state: "installing", version: "1", percent: 101 }).success).toBe(false);
  });
});
