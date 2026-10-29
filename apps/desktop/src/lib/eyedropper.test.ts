import { describe, expect, it } from "vitest";
import { eyedropperFormat } from "./eyedropper";

const plain = { key: "i", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false };

describe("eyedropperFormat", () => {
  it("copies hex on I and rgb on Shift+I", () => {
    expect(eyedropperFormat(plain, ["C", "S", "A"], true)).toBe("hex");
    expect(eyedropperFormat({ ...plain, key: "I", shiftKey: true }, ["C", "S", "A"], true)).toBe("rgb");
  });

  it("ignores other keys and modifier chords", () => {
    expect(eyedropperFormat({ ...plain, key: "c" }, [], false)).toBeNull();
    expect(eyedropperFormat({ ...plain, ctrlKey: true }, [], false)).toBeNull();
    expect(eyedropperFormat({ ...plain, altKey: true }, [], false)).toBeNull();
  });

  it("yields to a capture-mode shortcut bound to I while a selection is ready", () => {
    expect(eyedropperFormat(plain, ["I", "S", "A"], true)).toBeNull();
    expect(eyedropperFormat(plain, ["I", "S", "A"], false)).toBe("hex");
    expect(eyedropperFormat({ ...plain, shiftKey: true }, ["I"], true)).toBe("rgb");
  });
});
