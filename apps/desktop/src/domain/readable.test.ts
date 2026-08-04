import { describe, expect, it } from "vitest";
import { detectReaderMode, parsePipeTable } from "./readable";

describe("readable content detection", () => {
  it("recognizes common structured formats without AI", () => {
    expect(detectReaderMode("# Heading\n\n- One\n- Two")).toBe("markdown");
    expect(detectReaderMode('{"ok":true,"count":2}')).toBe("json");
    expect(detectReaderMode("| Name | State |\n| --- | --- |\n| CapKit | Ready |")).toBe("table");
    expect(detectReaderMode("const active = true;")).toBe("code");
    expect(detectReaderMode("A calm paragraph for reading.")).toBe("plain");
  });

  it("removes the Markdown divider when building a table", () => {
    expect(parsePipeTable("| Name | State |\n| --- | --- |\n| CapKit | Ready |")).toEqual([
      ["Name", "State"],
      ["CapKit", "Ready"],
    ]);
  });
});
