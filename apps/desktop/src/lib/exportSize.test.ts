import { describe, expect, it } from "vitest";
import { exportSummary, formatMegabytes, parseSizeTarget, planEncode, retryBitrate, targetBytesFor } from "./exportSize";

const MB = 1024 * 1024;

describe("planEncode", () => {
  it("keeps the stage and quality bitrate without a target", () => {
    expect(planEncode({ width: 1921, height: 1081 }, 60, 30, null)).toEqual({
      width: 1920,
      height: 1080,
      fps: 60,
      bitrate: 10_000_000,
    });
  });

  it("keeps quality when the budget already allows it", () => {
    const plan = planEncode({ width: 1280, height: 720 }, 30, 10, targetBytesFor("under-25mb"));
    expect(plan.bitrate).toBe(6_000_000);
  });

  it("spreads the budget over the duration with a safety margin", () => {
    const plan = planEncode({ width: 1280, height: 720 }, 30, 60, targetBytesFor("under-25mb"));
    expect(plan.bitrate * 60).toBeLessThanOrEqual(25 * MB * 8 * 0.94);
    expect(plan.bitrate * 60).toBeGreaterThan(25 * MB * 8 * 0.93);
    expect(plan).toMatchObject({ width: 1280, height: 720, fps: 30 });
  });

  it("drops to 30 fps, then shrinks the frame, when pixels get too few bits", () => {
    const plan = planEncode({ width: 1920, height: 1080 }, 60, 300, targetBytesFor("under-10mb"));
    expect(plan.fps).toBe(30);
    expect(plan.width).toBeLessThan(1920);
    expect(plan.width).toBeGreaterThanOrEqual(640);
    expect(plan.width % 2).toBe(0);
    expect(plan.height % 2).toBe(0);
    expect(plan.width / plan.height).toBeCloseTo(16 / 9, 1);
  });

  it("never shrinks below 640 px wide", () => {
    const plan = planEncode({ width: 1920, height: 1080 }, 60, 3600, targetBytesFor("under-10mb"));
    expect(plan.width).toBe(640);
  });
});

describe("retryBitrate", () => {
  it("lowers the bitrate in proportion to the overshoot", () => {
    const plan = { width: 1280, height: 720, fps: 30, bitrate: 1_000_000 };
    expect(retryBitrate(plan, 12 * MB, 10 * MB)).toBe(Math.floor(1_000_000 * (10 / 12) * 0.95));
  });
});

describe("formatMegabytes", () => {
  it("shows one decimal", () => {
    expect(formatMegabytes(9.46 * MB)).toBe("9.5 MB");
  });
});

describe("exportSummary", () => {
  it("reports size and dimensions", () => {
    expect(exportSummary({ width: 1280, height: 720 }, 4 * MB, 10 * MB)).toBe("Exported 1280 × 720 · 4.0 MB");
  });

  it("says when a target could not be met", () => {
    expect(exportSummary({ width: 640, height: 360 }, 11 * MB, 10 * MB)).toBe(
      "Exported 640 × 360 · 11.0 MB · over the 10 MB target; trim the clip to fit",
    );
  });
});

describe("parseSizeTarget", () => {
  it("falls back to original for unknown values", () => {
    expect(parseSizeTarget("under-10mb")).toBe("under-10mb");
    expect(parseSizeTarget("huge")).toBe("original");
  });
});
