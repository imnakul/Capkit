import { afterEach, describe, expect, it, vi } from "vitest";
import { hitCandidates, hitElements } from "./hitTest";

function box(parent: Element, x: number, y: number, width: number, height: number, style = ""): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("style", style);
  element.getBoundingClientRect = (): DOMRect => ({ x, y, width, height, top: y, left: x, right: x + width, bottom: y + height, toJSON: () => ({}) });
  parent.append(element);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("hit test filtering", () => {
  it("drops tiny elements, display:contents and same-rect parents", () => {
    const card = box(document.body, 0, 0, 300, 200);
    const wrapper = box(card, 10, 10, 100, 40);
    const button = box(wrapper, 10, 10, 100, 40);
    const tiny = box(button, 12, 12, 4, 4);
    const contents = box(card, 0, 0, 300, 200, "display: contents");
    // smallest first, as elementFromPoint returns the deepest element
    const kept = hitCandidates([tiny, button, wrapper, contents, card]);
    expect(kept).toEqual([button, card]);
  });

  it("converts rects to viewport pixels", () => {
    const card = box(document.body, 10.4, 20.6, 100, 40);
    Object.defineProperty(document, "elementFromPoint", { value: () => card, configurable: true });
    const result = hitElements(document, { x: 12, y: 22 }, { scale: 2 }, () => "Card");
    expect(result).toEqual([{ key: expect.any(String) as string, label: "Card", rect: { x: 21, y: 41, width: 200, height: 80 } }]);
  });

  it("returns an empty list when nothing is under the point", () => {
    Object.defineProperty(document, "elementFromPoint", { value: vi.fn(() => null), configurable: true });
    expect(hitElements(document, { x: 0, y: 0 }, { scale: 1 }, () => null)).toEqual([]);
  });
});
