import { afterEach, describe, expect, it, vi } from "vitest";
import { hostShadow } from "../shadow";
import { ProbeController, type ProbeDeps, type ProbeKind } from "./controller";

type Setup = { probe: ProbeController; shadow: ShadowRoot; target: Element; copied: string[] };

function setup(kind: ProbeKind, extra: Partial<ProbeDeps> = {}): Setup {
  document.body.innerHTML =
    '<p class="lead" style="font-family: Georgia, serif; font-size: 18px; color: rgb(255, 0, 0); background-color: rgb(0, 0, 255)">Hello</p>';
  const copied: string[] = [];
  const deps: Partial<ProbeDeps> = {
    writeText: (text) => {
      copied.push(text);
      return Promise.resolve();
    },
    accent: () => Promise.resolve("#d9ff43"),
    fonts: () => undefined,
    pickPixel: null,
    ...extra,
  };
  const probe = new ProbeController(kind, document, deps);
  probe.start();
  const target = document.querySelector("p.lead");
  if (target === null) throw new Error("no target");
  return { probe, shadow: hostShadow(document), target, copied };
}

function button(shadow: ShadowRoot, name: string): HTMLButtonElement | undefined {
  return [...shadow.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent) === name);
}

function tip(shadow: ShadowRoot): HTMLElement {
  const found = shadow.querySelector(".pb-tip");
  if (!(found instanceof HTMLElement)) throw new Error("no tip");
  return found;
}

afterEach(() => {
  document.documentElement.querySelector("capkit-inspector-host")?.remove();
});

describe("Font tool", () => {
  it("previews the hovered element's font", () => {
    const { probe, shadow, target } = setup("font");
    probe.preview(target, 10, 10);
    expect(tip(shadow).hidden).toBe(false);
    expect(tip(shadow).textContent).toContain("Georgia");
    expect(tip(shadow).textContent).toContain("18px");
    expect(tip(shadow).textContent).toContain("#ff0000");
    probe.stop();
  });

  it("copies the font as CSS on click", async () => {
    const { probe, shadow, target, copied } = setup("font");
    await probe.choose(target, 10, 10);
    expect(copied[0]).toContain("font-family: Georgia, serif;");
    expect(copied[0]).toContain("color: #ff0000;");
    expect(shadow.querySelector(".toast")?.textContent).toBe("Copied font CSS");
    probe.stop();
  });

  it("closes with Escape and from its close button", () => {
    const first = setup("font");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(first.probe.isActive).toBe(false);
    const second = setup("font");
    button(second.shadow, "Close Font")?.click();
    expect(second.probe.isActive).toBe(false);
  });
});

describe("Colour tool", () => {
  it("locks the element and copies a chosen colour as HEX", async () => {
    const { probe, shadow, target, copied } = setup("color");
    await probe.choose(target, 10, 10);
    expect(probe.lockedElement).toBe(target);
    button(shadow, "Copy Background #0000ff")?.click();
    await vi.waitFor(() => {
      expect(copied).toEqual(["#0000ff"]);
    });
    expect(shadow.querySelector(".toast")?.textContent).toBe("Copied #0000ff");
    probe.stop();
  });

  it("ignores hover while locked; Escape unlocks before closing", async () => {
    const { probe, shadow, target } = setup("color");
    await probe.choose(target, 10, 10);
    const other = document.createElement("div");
    document.body.append(other);
    probe.preview(other, 0, 0);
    expect(button(shadow, "Copy Background #0000ff")).toBeDefined();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(probe.lockedElement).toBeNull();
    expect(probe.isActive).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(probe.isActive).toBe(false);
  });

  it("hides the eyedropper button when the browser has none", () => {
    const { probe, shadow } = setup("color");
    expect(shadow.querySelector('[aria-keyshortcuts="E"]')).toBeNull();
    probe.stop();
  });

  it("copies a pixel from the eyedropper with E", async () => {
    const pickPixel = vi.fn((): Promise<string | null> => Promise.resolve("#ABCDEF"));
    const { probe, shadow, copied } = setup("color", { pickPixel });
    expect(shadow.querySelector('[aria-keyshortcuts="E"]')).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "e" }));
    await vi.waitFor(() => {
      expect(copied).toEqual(["#abcdef"]);
    });
    probe.stop();
  });

  it("copies nothing when the eyedropper is cancelled", async () => {
    const pickPixel = vi.fn((): Promise<string | null> => Promise.resolve(null));
    const { probe, copied } = setup("color", { pickPixel });
    await probe.pickPixel();
    expect(pickPixel).toHaveBeenCalledOnce();
    expect(copied).toEqual([]);
    probe.stop();
  });
});
