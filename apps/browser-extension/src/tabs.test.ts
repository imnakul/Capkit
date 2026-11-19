import { describe, expect, it } from "vitest";
import { matchTab, originPattern } from "./tabs";

const tabs = [
  { id: 1, url: "http://localhost:5173/", title: "Vite + React" },
  { id: 2, url: "https://example.com/", title: "Example Domain" },
];

describe("matchTab", () => {
  it("matches the tab whose title starts the window title", () => {
    expect(matchTab("Example Domain - Google Chrome", tabs)?.id).toBe(2);
  });
  it("returns null when no title matches", () => {
    expect(matchTab("Something else - Google Chrome", tabs)).toBeNull();
  });
  it("prefers the longest matching title", () => {
    const extra = [...tabs, { id: 3, url: "https://a.test/", title: "Vite" }];
    expect(matchTab("Vite + React - Microsoft Edge", extra)?.id).toBe(1);
  });
  it("ignores tabs with empty titles", () => {
    expect(matchTab("Anything", [{ id: 4, url: "https://b.test/", title: "" }])).toBeNull();
  });
});

describe("originPattern", () => {
  it("drops the port because match patterns cover every port", () => {
    expect(originPattern("http://localhost:5173/a?b")).toBe("http://localhost/*");
  });
  it("rejects non-web pages", () => {
    expect(originPattern("chrome://extensions")).toBeNull();
    expect(originPattern("not a url")).toBeNull();
  });
});
