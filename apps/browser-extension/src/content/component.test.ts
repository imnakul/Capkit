import { describe, expect, it } from "vitest";
import { componentName, debugSource, debugStack, describeComponent, findFiber, isMinifiedName } from "./component";

function Button(): null {
  return null;
}
function Form(): null {
  return null;
}

describe("component names", () => {
  it("reads displayName, name, render and memo types", () => {
    expect(componentName(Button)).toBe("Button");
    expect(componentName({ displayName: "Styled" })).toBe("Styled");
    expect(componentName({ render: { name: "Forwarded" } })).toBe("Forwarded");
    expect(componentName({ type: { name: "Memoed" } })).toBe("Memoed");
    expect(componentName("div")).toBeNull();
  });

  it("flags minified names", () => {
    expect(isMinifiedName("a")).toBe(true);
    expect(isMinifiedName("Zx")).toBe(true);
    expect(isMinifiedName("Card")).toBe(false);
  });
});

describe("describeComponent", () => {
  it("builds the owner path with the nearest component last", () => {
    const app = { type: function App(): null { return null; } };
    const form = { type: Form, _debugOwner: app };
    const host = { type: "button", _debugOwner: { type: Button, _debugOwner: form } };
    expect(describeComponent(host)).toEqual({ name: "Button", ownerPath: ["App", "Form", "Button"] });
  });

  it("falls back to walking .return when there is no debug owner", () => {
    const host = { type: "div", return: { type: "span", return: { type: Form } } };
    expect(describeComponent(host)).toEqual({ name: "Form", ownerPath: ["Form"] });
  });

  it("reports minified production builds", () => {
    const host = { type: "div", _debugOwner: { type: function a(): null { return null; } } };
    expect(describeComponent(host)).toBe("minified");
  });

  it("returns null without any owner", () => {
    expect(describeComponent({ type: "div" })).toBeNull();
  });
});

describe("fiber access", () => {
  it("finds a fiber on the nearest ancestor", () => {
    const parent = document.createElement("div");
    const child = document.createElement("span");
    parent.append(child);
    Object.assign(parent, { __reactFiber$abc: { type: "div" } });
    expect(findFiber(child)).toEqual({ type: "div" });
    expect(findFiber(document.createElement("p"))).toBeNull();
  });

  it("reads React 18 debug source and React 19 debug stack", () => {
    expect(debugSource({ _debugSource: { fileName: "src/a.tsx", lineNumber: 4, columnNumber: 2 } })).toEqual({
      file: "src/a.tsx",
      line: 4,
      column: 2,
    });
    expect(debugSource({})).toBeNull();
    expect(debugStack({ _debugStack: { stack: "Error\n at x" } })).toBe("Error\n at x");
    expect(debugStack({})).toBeNull();
  });
});
