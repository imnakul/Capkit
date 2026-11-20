import { describe, expect, it } from "vitest";
import { captureDisplayName } from "./captureName";

describe("captureDisplayName", () => {
  it("drops the timestamp and extension, keeping the page or app name", () => {
    expect(captureDisplayName("GitHub - capkit - Google Chrome_2026-11-20_10-16-47-913.png")).toBe(
      "GitHub - capkit - Google Chrome",
    );
  });

  it("gives older generic names a date so cards can be told apart", () => {
    const name = captureDisplayName("CapKit_2026-11-19_01-11-05-913.png");
    expect(name).toMatch(/^Screenshot, /);
    expect(name).toContain("Nov");
    expect(captureDisplayName("ShotHub_2026-11-19_01-11-05-913-2.png")).toMatch(/^Screenshot, /);
  });

  it("leaves names without a timestamp alone", () => {
    expect(captureDisplayName("capture.png")).toBe("capture");
    expect(captureDisplayName("_2026-11-20_10-16-47-913.png")).toBe("_2026-11-20_10-16-47-913");
  });
});
