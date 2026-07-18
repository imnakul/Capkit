import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./components/AnnotationCanvas", () => ({
  AnnotationCanvas: function MockAnnotationCanvas(): React.JSX.Element {
    return <div aria-label="Screenshot annotation canvas" role="application" />;
  },
}));

describe("App", () => {
  it("creates an in-place selection and reveals quick actions", async () => {
    render(<App />);

    expect(await screen.findAllByText(/Hover to preview targets/)).not.toHaveLength(0);
    const surface = screen.getByRole("main");
    fireEvent.pointerMove(surface, { clientX: 80, clientY: 90, pointerId: 1 });
    expect(screen.getByLabelText(/Detected window/)).toBeInTheDocument();

    fireEvent.pointerDown(surface, { button: 0, clientX: 80, clientY: 90, pointerId: 1 });
    fireEvent.pointerMove(surface, { buttons: 1, clientX: 520, clientY: 390, pointerId: 1 });
    fireEvent.pointerMove(surface, { buttons: 0, clientX: 700, clientY: 520, pointerId: 1 });

    expect(screen.getByRole("toolbar", { name: "Quick editing tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByText("440 × 300 px")).toBeInTheDocument();

    const shapeFamily = screen.getByRole("button", { name: "Shapes and arrows" });
    fireEvent.pointerDown(shapeFamily, { button: 0, pointerId: 2 });
    fireEvent.click(shapeFamily);
    expect(shapeFamily).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Rectangle" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("440 × 300 px")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("main")).not.toBeInTheDocument();
      expect(screen.queryByRole("toolbar", { name: "Quick editing tools" })).not.toBeInTheDocument();
    });
  });
});
