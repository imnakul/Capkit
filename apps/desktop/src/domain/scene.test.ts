import { describe, expect, it } from "vitest";
import { backgroundPaint, paintToCss } from "./scene";
import { backgroundValue, spotlightGradient } from "./showcase";

describe("structured background paint", () => {
  it("describes a solid preset as a single colour", () => {
    expect(backgroundPaint({ kind: "preset", id: "paper" })).toEqual({ kind: "solid", color: "#ecebe5" });
  });

  it("describes a gradient preset with its stops", () => {
    const paint = backgroundPaint({ kind: "preset", id: "citrus" });
    expect(paint.kind).toBe("linear");
    if (paint.kind !== "linear") return;
    expect(paint.angleDeg).toBe(135);
    expect(paint.stops.map((stop) => stop.color)).toEqual(["#d9ff43", "#f9f5c7"]);
  });

  it("keeps a bare hex for a single colour, matching the CSS path exactly", () => {
    // Showcase asserts this exact string, so round-tripping must not decorate it.
    expect(paintToCss(backgroundPaint({ kind: "preset", id: "paper" }))).toBe(
      backgroundValue({ kind: "preset", id: "paper" }),
    );
  });

  it("carries a custom colour through unchanged", () => {
    expect(paintToCss(backgroundPaint({ kind: "color", value: "#123456" }))).toBe("#123456");
  });

  it("parses a generated spotlight gradient into paintable layers", () => {
    const css = spotlightGradient(["#c82840", "#1e5aa0"]);
    const paint = backgroundPaint({ kind: "gradient", value: css });
    expect(paint.kind).toBe("layers");
    if (paint.kind !== "layers") return;
    // One base wash plus the radial pools the generator emits.
    expect(paint.layers.some((layer) => layer.kind === "linear")).toBe(true);
    expect(paint.layers.filter((layer) => layer.kind === "radial").length).toBeGreaterThan(0);
  });

  it("fades radial stops to their own colour, not to black", () => {
    const css = spotlightGradient(["#c82840", "#1e5aa0"]);
    const paint = backgroundPaint({ kind: "gradient", value: css });
    if (paint.kind !== "layers") throw new Error("expected layers");
    const radial = paint.layers.find((layer) => layer.kind === "radial");
    if (radial?.kind !== "radial") throw new Error("expected a radial layer");
    // Canvas interpolates in premultiplied space, so a literal `transparent`
    // stop would fade through black and leave a dark halo.
    const last = radial.stops.at(-1)?.color ?? "";
    expect(last).toContain("/ 0%");
    expect(last).not.toBe("transparent");
  });

  it("describes a background image by its url", () => {
    const paint = backgroundPaint({ kind: "image", path: "C:/a.png", url: "asset://a.png" });
    expect(paint).toEqual({ kind: "image", url: "asset://a.png" });
    expect(paintToCss(paint)).toContain("asset://a.png");
  });
});
