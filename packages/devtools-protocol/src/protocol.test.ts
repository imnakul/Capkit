import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_BYTES, parseAppMessage, parseExtensionMessage } from "./protocol";

const rect = { x: 0, y: 0, width: 10, height: 10 };

describe("protocol", () => {
  it("accepts a valid pair message", () => {
    const raw = JSON.stringify({ v: 1, type: "pair", code: "123456", browser: { name: "Chrome", version: "130" }, extensionVersion: "0.1.0" });
    expect(parseExtensionMessage(raw)?.type).toBe("pair");
  });

  it("rejects unknown fields, bad codes and wrong versions", () => {
    const base = { v: 1, type: "pair", code: "123456", browser: { name: "Chrome", version: "1" }, extensionVersion: "1" };
    expect(parseExtensionMessage(JSON.stringify({ ...base, extra: 1 }))).toBeNull();
    expect(parseExtensionMessage(JSON.stringify({ ...base, code: "12345" }))).toBeNull();
    expect(parseExtensionMessage(JSON.stringify({ ...base, v: 2 }))).toBeNull();
  });

  it("rejects non-JSON and oversize frames", () => {
    expect(parseAppMessage("nope")).toBeNull();
    expect(parseAppMessage(" ".repeat(MAX_MESSAGE_BYTES + 1))).toBeNull();
  });

  it("inspect needs exactly one of point or area", () => {
    const base = { v: 1, type: "inspect", id: "a", windowTitle: "t", viewport: rect };
    expect(parseAppMessage(JSON.stringify({ ...base, point: { x: 1, y: 2 } }))?.type).toBe("inspect");
    expect(parseAppMessage(JSON.stringify({ ...base }))).toBeNull();
    expect(parseAppMessage(JSON.stringify({ ...base, point: { x: 1, y: 2 }, area: rect }))).toBeNull();
  });
});
