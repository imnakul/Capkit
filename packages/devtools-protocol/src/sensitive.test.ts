import { describe, expect, it } from "vitest";
import { findSensitiveSpans, maskPreview, maskSensitiveText, passesLuhn } from "./sensitive";

describe("sensitive text", () => {
  it("finds an email and masks it", () => {
    const spans = findSensitiveSpans("write to jane.doe@example.com now");
    expect(spans.map((s) => s.kind)).toEqual(["email"]);
  });

  it("validates card numbers with Luhn", () => {
    expect(passesLuhn("4242424242424242")).toBe(true);
    expect(passesLuhn("4242424242424241")).toBe(false);
  });

  it("maskSensitiveText replaces secrets and counts them", () => {
    const result = maskSensitiveText("mail jane.doe@example.com\nclean line");
    expect(result.masked).toBe(1);
    expect(result.text).not.toContain("jane.doe@example.com");
    expect(result.text.split("\n")[1]).toBe("clean line");
  });

  it("leaves clean text untouched", () => {
    expect(maskSensitiveText("hello world")).toEqual({ text: "hello world", masked: 0 });
    expect(maskPreview("abc")).toBeTypeOf("string");
  });
});
