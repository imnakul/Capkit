import { describe, expect, it } from "vitest";
import { captureDisplayName } from "./captureName";

describe("captureDisplayName", () => {
  it("drops the timestamp and extension, keeping the page or app name", () => {
    expect(captureDisplayName("GitHub - capkit - Google Chrome_2026-11-20_10-16-47-913.png")).toBe(
      "GitHub - capkit - Google Chrome",
    );
    expect(captureDisplayName("CapKit_2026-11-20_10-16-47-913-2.png")).toBe("CapKit");
  });

  it("leaves names without a timestamp alone", () => {
    expect(captureDisplayName("capture.png")).toBe("capture");
    expect(captureDisplayName("_2026-11-20_10-16-47-913.png")).toBe("_2026-11-20_10-16-47-913");
  });
});
