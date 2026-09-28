import { describe, expect, it } from "vitest";
import config from "../../src-tauri/tauri.conf.json";

/**
 * Recordings play from the asset protocol (`http://asset.localhost/…`), so
 * `media-src` must allow it. Without this, `<video>` falls back to
 * `default-src` and every recording shows 0:00.
 */
describe("content security policy", () => {
  it("allows video from the asset protocol", () => {
    const csp = (config as { app: { security: { csp: string } } }).app.security.csp;
    const media = /(?:^|;)\s*media-src\s+([^;]*)/.exec(csp)?.[1] ?? "";
    expect(media).toContain("http://asset.localhost");
  });
});
