import { afterEach, describe, expect, it, vi } from "vitest";
import { hostShadow } from "../shadow";
import { PickerController, type PickerDeps } from "./controller";

function setup(writeText: PickerDeps["writeText"] = () => Promise.resolve()): { picker: PickerController; shadow: ShadowRoot; target: Element } {
  document.body.innerHTML = '<main><button class="save">Save</button><input placeholder="Email"></main>';
  const deps: PickerDeps = {
    resolve: () => Promise.resolve({ component: { name: "SaveButton", ownerPath: ["SaveButton"] }, source: null }),
    writeText,
    accent: () => Promise.resolve("#d9ff43"),
    fonts: () => undefined,
  };
  const picker = new PickerController(document, deps);
  picker.start();
  const target = document.querySelector("button.save");
  if (target === null) throw new Error("no target");
  return { picker, shadow: hostShadow(document), target };
}

function query(shadow: ShadowRoot, selector: string): Element {
  const found = shadow.querySelector(selector);
  if (found === null) throw new Error(`missing ${selector}`);
  return found;
}

function textarea(shadow: ShadowRoot): HTMLTextAreaElement {
  const found = shadow.querySelector("textarea");
  if (found === null) throw new Error("missing textarea");
  return found;
}

function button(shadow: ShadowRoot, name: string): HTMLButtonElement {
  const found = [...shadow.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent) === name);
  if (found === undefined) throw new Error(`missing button ${name}`);
  return found;
}

async function addComment(picker: PickerController, shadow: ShadowRoot, target: Element, text: string): Promise<void> {
  picker.openCard(target);
  const input = textarea(shadow);
  input.value = text;
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await vi.waitFor(() => {
    expect(shadow.querySelector(".pk-card")).toBeNull();
  });
}

afterEach(() => {
  document.documentElement.querySelector("capkit-inspector-host")?.remove();
});

describe("PickerController", () => {
  it("shows the empty hint with Copy and Clear disabled", () => {
    const { picker, shadow } = setup();
    expect(shadow.textContent).toContain("Click any element to comment on it.");
    expect(button(shadow, "Copy").disabled).toBe(true);
    expect(button(shadow, "Clear").disabled).toBe(true);
    picker.stop();
  });

  it("adds a comment with Enter and lists it", async () => {
    const { picker, shadow, target } = setup();
    await addComment(picker, shadow, target, "Make it green");
    expect(picker.items).toHaveLength(1);
    expect(picker.items[0]).toMatchObject({ name: "SaveButton", text: "Save", comment: "Make it green" });
    expect(query(shadow, ".pk-list ol").textContent).toContain("Make it green");
    expect(shadow.querySelectorAll(".pk-marker")).toHaveLength(1);
    picker.stop();
  });

  it("copies Markdown and keeps the picks", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const { picker, shadow, target } = setup(writeText);
    await addComment(picker, shadow, target, "Make it green");
    button(shadow, "Copy").click();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledOnce();
    });
    const copied: unknown = writeText.mock.calls[0]?.at(0);
    expect(copied).toContain("## Change 1: SaveButton");
    expect(copied).toContain("**Change:** Make it green");
    expect(picker.items).toHaveLength(1);
    expect(await vi.waitFor(() => query(shadow, ".toast"))).toHaveTextContent("Copied 1 comment");
    picker.stop();
  });

  it("keeps picks and tells the user when the copy fails", async () => {
    const { picker, shadow, target } = setup(() => Promise.reject(new Error("denied")));
    await addComment(picker, shadow, target, "x");
    await picker.copy();
    expect(query(shadow, ".toast")).toHaveTextContent("Couldn't copy");
    expect(picker.items).toHaveLength(1);
    picker.stop();
  });

  it("removes one pick and clears all", async () => {
    const { picker, shadow, target } = setup();
    await addComment(picker, shadow, target, "one");
    await addComment(picker, shadow, target, "two");
    button(shadow, "Remove comment 1").click();
    expect(picker.items.map((item) => item.comment)).toEqual(["two"]);
    button(shadow, "Clear").click();
    expect(picker.items).toHaveLength(0);
    picker.stop();
  });

  it("keeps an unsaved draft when another element is clicked", () => {
    const { picker, shadow, target } = setup();
    picker.openCard(target);
    textarea(shadow).value = "draft";
    const other = document.querySelector("input");
    if (other === null) throw new Error("no input");
    picker.openCard(other);
    expect(textarea(shadow).value).toBe("draft");
    picker.stop();
  });

  it("Esc closes the card first, then exits and keeps picks for next time", async () => {
    const { picker, shadow, target } = setup();
    await addComment(picker, shadow, target, "keep me");
    picker.openCard(target);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(shadow.querySelector(".pk-card")).toBeNull();
    expect(picker.isActive).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(picker.isActive).toBe(false);
    expect(shadow.querySelector(".pk-list")).toBeNull();
    picker.start();
    expect(query(shadow, ".pk-list").textContent).toContain("keep me");
    picker.stop();
  });

  it("blocks page clicks while picking", () => {
    const { picker, target } = setup();
    const pageClick = vi.fn();
    target.addEventListener("mousedown", pageClick);
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(pageClick).not.toHaveBeenCalled();
    picker.stop();
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(pageClick).toHaveBeenCalledOnce();
  });
});
