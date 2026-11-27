import { describe, expect, it } from "vitest";
import { firstFamily, fontCssText, readColors, readFont, rgbaToHex, toHex, type FontInfo } from "./read";

const base: FontInfo = {
  family: "Inter",
  stack: '"Inter", sans-serif',
  size: "14px",
  weight: "500",
  lineHeight: "20px",
  letterSpacing: "normal",
  style: "normal",
  color: "#111111",
};

function only<T extends Element>(selector: string, type: new () => T): T {
  const found = document.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`missing ${selector}`);
  return found;
}

describe("colour to HEX", () => {
  it("writes opaque colours as 6 digits and translucent ones as 8", () => {
    expect(rgbaToHex({ r: 217, g: 255, b: 67, a: 1 })).toBe("#d9ff43");
    expect(rgbaToHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe("#00000080");
  });

  it("converts rgb() and rgba()", () => {
    expect(toHex("rgb(255, 0, 0)", document)).toBe("#ff0000");
    expect(toHex("rgba(0, 0, 255, 0.25)", document)).toBe("#0000ff40");
  });
});

describe("font", () => {
  it("takes the first family without quotes", () => {
    expect(firstFamily('"Geist Variable", system-ui')).toBe("Geist Variable");
    expect(firstFamily("Arial")).toBe("Arial");
  });

  it("copies family, size, weight, line height and colour", () => {
    expect(fontCssText(base)).toBe('font-family: "Inter", sans-serif;\nfont-size: 14px;\nfont-weight: 500;\nline-height: 20px;\ncolor: #111111;');
  });

  it("adds letter spacing and style only when set", () => {
    const text = fontCssText({ ...base, letterSpacing: "0.5px", style: "italic" });
    expect(text).toContain("letter-spacing: 0.5px;");
    expect(text).toContain("font-style: italic;");
  });

  it("reads an element's computed font", () => {
    document.body.innerHTML = '<p style="font-family: Georgia, serif; font-size: 18px; color: rgb(10, 20, 30)">Hi</p>';
    const font = readFont(only("p", HTMLParagraphElement));
    expect(font.family).toBe("Georgia");
    expect(font.size).toBe("18px");
    expect(font.color).toBe("#0a141e");
  });
});

describe("readColors", () => {
  it("lists text, background and a visible border", () => {
    document.body.innerHTML = '<div style="color: rgb(255,255,255); background-color: rgb(0,0,0); border: 1px solid rgb(255,0,0)">x</div>';
    expect(readColors(only("div", HTMLDivElement))).toEqual([
      { name: "Text", hex: "#ffffff" },
      { name: "Background", hex: "#000000" },
      { name: "Border", hex: "#ff0000" },
    ]);
  });

  it("uses the background behind a transparent element", () => {
    document.body.innerHTML = '<section style="background-color: rgb(0, 128, 0)"><span style="color: rgb(0,0,0)">x</span></section>';
    expect(readColors(only("span", HTMLSpanElement))).toContainEqual({ name: "Background (behind)", hex: "#008000" });
  });
});
