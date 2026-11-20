import { describe, expect, it } from "vitest";
import { buildElementMarkdown, buildNoteMarkdown, toHexColor } from "./markdown";
import type { ElementDetails } from "./protocol";

const rect = { x: 10, y: 20, width: 100, height: 40 };
const styles = {
  color: "rgb(17, 24, 39)",
  backgroundColor: "rgba(0, 0, 0, 0)",
  fontFamily: '"Inter", sans-serif',
  fontSize: "14px",
  fontWeight: "600",
  lineHeight: "20px",
  padding: "8px 12px",
  margin: "0px",
  borderRadius: "6px",
  boxShadow: "none",
  display: "flex",
  gap: "0px",
};
const element: ElementDetails = {
  label: "button",
  tag: "button",
  role: "button",
  accessibleName: "Save",
  text: "Save",
  selector: "form > button.primary",
  component: { name: "SaveButton", ownerPath: ["App", "Form"] },
  source: { file: "src/SaveButton.tsx", line: 12, column: 5 },
  classes: "primary",
  styles,
  cssRect: rect,
  rect,
};

describe("markdown", () => {
  it("converts rgb to hex", () => {
    expect(toHexColor("rgb(17, 24, 39)")).toBe("#111827");
    expect(toHexColor("rgba(0, 0, 0, 0.5)")).toBe("#00000080");
  });

  it("builds element markdown", () => {
    expect(buildElementMarkdown(element)).toBe(
      [
        "## SaveButton",
        "",
        "- Source: `src/SaveButton.tsx:12:5`",
        "- Component: App › Form › SaveButton",
        "- Selector: `form > button.primary`",
        '- Text: "Save"',
        '- Role: button "Save"',
        "- Box: 100×40 at 10, 20 (CSS px)",
        '- Styles: color #111827 · font 600 14px/20px "Inter" · padding 8px 12px · radius 6px',
        "- Classes: `primary`",
        "",
      ].join("\n"),
    );
  });

  it("builds a note document with a fixed offset", () => {
    const markdown = buildNoteMarkdown({
      pageTitle: "Home",
      pageUrl: "https://example.com",
      capturedAt: new Date("2026-11-19T10:30:00Z"),
      utcOffsetMinutes: 330,
      screenshotPath: "C:/shots/a.png",
      cssViewport: { width: 1280, height: 720, devicePixelRatio: 1.5 },
      detail: "extension",
      notes: [{ number: 1, comment: "Too tight", details: [element], isArea: false, fallback: null }],
    });
    expect(markdown).toContain("# CapKit note: Home");
    expect(markdown).toContain("- Captured: 2026-11-19 16:00 (2026-11-19T10:30:00Z)");
    expect(markdown).toContain("- Viewport: 1280×720 CSS px at 1.5×");
    expect(markdown).toContain("## 1. SaveButton\n\nToo tight\n\n- Source:");
  });
});
