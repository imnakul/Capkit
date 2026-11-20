import { describe, expect, it } from "vitest";
import { captureDisplayName } from "./captureName";

describe("captureDisplayName", () => {
  it("keeps the page or app name and adds the date and time", () => {
    const name = captureDisplayName("GitHub - capkit - Google Chrome_2026-11-20_10-16-47-913_CapKit.png");
    expect(name).toMatch(/^GitHub - capkit - Google Chrome, /);
    expect(name).toContain("Nov");
    expect(captureDisplayName("GitHub_2026-11-20_10-16-47-913.png")).toMatch(/^GitHub, /);
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
