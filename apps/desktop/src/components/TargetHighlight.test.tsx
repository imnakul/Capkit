import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TARGET_GLIDE, TargetHighlight } from "./TargetHighlight";

function mockReducedMotion(reduce: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), media: query }));
}

describe("TargetHighlight", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("glides to a new target without remounting", () => {
    mockReducedMotion(false);
    const { rerender } = render(<TargetHighlight bounds={{ x: 10, y: 20, width: 100, height: 40 }} label="Detected text: A" />);
    const first = screen.getByTestId("target-highlight");
    expect(first.style.transition).toBe(TARGET_GLIDE);

    rerender(<TargetHighlight bounds={{ x: 200, y: 80, width: 50, height: 30 }} label="Detected text: B" />);
    const second = screen.getByTestId("target-highlight");
    expect(second).toBe(first);
    expect(second).toHaveStyle({ left: "200px", top: "80px", width: "50px", height: "30px" });
    expect(second).toHaveAccessibleName("Detected text: B");
  });

  it("jumps without a transition under reduced motion", () => {
    mockReducedMotion(true);
    render(<TargetHighlight bounds={{ x: 0, y: 0, width: 10, height: 10 }} label="Detected window: X" />);
    expect(screen.getByTestId("target-highlight").style.transition).toBe("");
  });
});
