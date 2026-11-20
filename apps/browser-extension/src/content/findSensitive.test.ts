import { afterEach, describe, expect, it } from "vitest";
import { findSensitiveInArea } from "./findSensitive";

const area = { x: 0, y: 0, width: 800, height: 600 };

function stubRects(target: Element, rect: { x: number; y: number; width: number; height: number }): void {
  const dom = { ...rect, top: rect.y, left: rect.x, right: rect.x + rect.width, bottom: rect.y + rect.height, toJSON: (): object => ({}) };
  target.getBoundingClientRect = (): DOMRect => dom;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("findSensitiveInArea", () => {
  it("finds an email in a paragraph using range rects", () => {
    const p = document.createElement("p");
    p.textContent = "Contact test@example.com today";
    document.body.append(p);
    const rect = { x: 50, y: 20, width: 120, height: 16, top: 20, left: 50, right: 170, bottom: 36, toJSON: (): object => ({}) };
    Range.prototype.getClientRects = (): DOMRectList => Object.assign([rect], { item: (i: number) => (i === 0 ? rect : null) }); // jsdom lacks layout; DOMRectList is array-like
    const matches = findSensitiveInArea(document, area, { scale: 2 });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ kind: "email", rects: [{ x: 100, y: 40, width: 240, height: 32 }] });
    expect(matches[0]?.preview).not.toContain("example");
  });

  it("reports a filled password field and ignores an empty one", () => {
    const filled = document.createElement("input");
    filled.type = "password";
    filled.value = "hunter2hunter2";
    const empty = document.createElement("input");
    empty.type = "password";
    document.body.append(filled, empty);
    stubRects(filled, { x: 10, y: 10, width: 200, height: 30 });
    stubRects(empty, { x: 10, y: 60, width: 200, height: 30 });
    Range.prototype.getClientRects = (): DOMRectList => Object.assign([], { item: () => null }); // no text rects needed here
    const matches = findSensitiveInArea(document, area, { scale: 1 });
    expect(matches).toEqual([{ kind: "password", preview: "••••••••", rects: [{ x: 10, y: 10, width: 200, height: 30 }] }]);
  });

  it("skips fields outside the area", () => {
    const field = document.createElement("input");
    field.type = "password";
    field.value = "secret-password";
    document.body.append(field);
    stubRects(field, { x: 1000, y: 1000, width: 100, height: 30 });
    expect(findSensitiveInArea(document, area, { scale: 1 })).toEqual([]);
  });
});
