import { describe, expect, it } from "vitest";
import { buildPicksText, cleanComment, pickItem, pickText, type PickItem } from "./format";

function el(html: string): Element {
  document.body.innerHTML = html;
  const first = document.body.firstElementChild;
  if (first === null) throw new Error("no element");
  return first;
}

describe("pickText", () => {
  it("prefers visible text", () => {
    expect(pickText(el("<button>  Send   message </button>"))).toBe("Send message");
  });

  it("falls back to placeholder, then aria-label", () => {
    expect(pickText(el('<input placeholder="Search docs" aria-label="Search">'))).toBe("Search docs");
    expect(pickText(el('<button aria-label="Close"></button>'))).toBe("Close");
  });

  it("reads button-type input values but never typed input values", () => {
    expect(pickText(el('<input type="submit" value="Sign in">'))).toBe("Sign in");
    expect(pickText(el('<input type="text" value="secret">'))).toBe("");
  });
});

describe("cleanComment", () => {
  it("keeps line breaks, trims, caps length", () => {
    expect(cleanComment("  first\r\nsecond  ")).toBe("first\nsecond");
    expect(cleanComment("x".repeat(1200))).toHaveLength(1000);
  });
});

describe("pickItem", () => {
  it("uses the component name and page coordinates", () => {
    const button = el('<form id="contact"><button class="primary">Send</button></form>').querySelector("button");
    if (button === null) throw new Error("no button");
    const item = pickItem(
      button,
      { name: "SubmitButton", ownerPath: ["ContactForm", "SubmitButton"] },
      { file: "src/Contact.tsx", line: 42, column: 7 },
      { x: 0, y: 500 },
      "Make it bigger",
    );
    expect(item).toMatchObject({
      name: "SubmitButton",
      tag: "button",
      text: "Send",
      selector: "form#contact > button.primary",
      source: "src/Contact.tsx:42",
      comment: "Make it bigger",
    });
    expect(item.box.y).toBe(500);
  });

  it("falls back to a short label without a component", () => {
    const item = pickItem(el('<a href="/x">Docs</a>'), null, null, { x: 0, y: 0 }, "");
    expect(item.name).toBe('link "Docs"');
    expect(item.source).toBeNull();
  });
});

describe("buildPicksText", () => {
  const base: PickItem = {
    name: "SubmitButton",
    tag: "button",
    text: "Send",
    selector: "form#contact > button.primary",
    source: "src/Contact.tsx:42",
    box: { x: 120, y: 860, width: 320, height: 40 },
    comment: "Make it bigger",
  };

  it("writes one compact plain-text item per pick, without inspect-only details", () => {
    const text = buildPicksText("https://example.com/contact", [base, { ...base, name: "Logo", text: "", source: null, comment: "" }]);
    expect(text).toBe(
      [
        "Notes on elements of https://example.com/contact",
        "Each item names one element, then my note. Under it: source file, tag, selector, text, size and page position (CSS px). An item without a note just points the element out.",
        "",
        "1. SubmitButton: Make it bigger",
        '   src/Contact.tsx:42 · button · form#contact > button.primary · "Send" · 320×40 at 120,860',
        "",
        "2. Logo",
        "   button · form#contact > button.primary · 320×40 at 120,860",
        "",
      ].join("\n"),
    );
    expect(text).not.toMatch(/Styles|Classes|Role|^#|\*\*/mu);
  });

  it("keeps a multi-line note inside its item", () => {
    const text = buildPicksText("https://example.com", [{ ...base, comment: "Bigger\nAnd blue" }]);
    expect(text).toContain("1. SubmitButton: Bigger\n   And blue\n   src/Contact.tsx:42");
  });
});
