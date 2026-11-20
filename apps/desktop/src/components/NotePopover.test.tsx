import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotePopover, notePopoverWidth, popoverPosition } from "./NotePopover";

function renderPopover(overrides: Partial<React.ComponentProps<typeof NotePopover>> = {}): React.ComponentProps<typeof NotePopover> {
  const props = {
    number: 1,
    anchor: { x: 40, y: 40 },
    container: { width: 800, height: 600 },
    comment: "",
    summary: "Reading element…",
    onChange: vi.fn(),
    onClose: vi.fn(),
    onDiscard: vi.fn(),
    ...overrides,
  };
  render(<NotePopover {...props} />);
  return props;
}

afterEach(cleanup);

describe("popoverPosition", () => {
  it("sits right of and below the pin when it fits", () => {
    expect(popoverPosition({ x: 40, y: 40 }, { width: 800, height: 600 })).toEqual({ left: 56, top: 56 });
  });

  it("flips left and above near the far edges", () => {
    const position = popoverPosition({ x: 780, y: 590 }, { width: 800, height: 600 });
    expect(position.left).toBeLessThan(780 - notePopoverWidth + 1);
    expect(position.top).toBeLessThan(590);
  });

  it("never leaves a small selection", () => {
    const position = popoverPosition({ x: 5, y: 5 }, { width: 200, height: 100 });
    expect(position).toEqual({ left: 0, top: 0 });
  });
});

describe("NotePopover", () => {
  it("focuses the comment field and shows the summary", () => {
    renderPopover();
    expect(screen.getByRole("textbox", { name: "Comment for this spot" })).toHaveFocus();
    expect(screen.getByText("Reading element…")).toBeInTheDocument();
  });

  it("reports typing", () => {
    const props = renderPopover();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Too tight" } });
    expect(props.onChange).toHaveBeenCalledWith("Too tight");
  });

  it("closes on Enter but keeps a newline for Shift+Enter", () => {
    const props = renderPopover({ comment: "Hi" });
    const field = screen.getByRole("textbox");
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("discards an empty note on Esc and keeps a typed one", () => {
    const empty = renderPopover({ comment: "  " });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(empty.onDiscard).toHaveBeenCalledTimes(1);
    expect(empty.onClose).not.toHaveBeenCalled();
  });

  it("keeps a typed comment on Esc", () => {
    const typed = renderPopover({ comment: "Keep me" });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(typed.onClose).toHaveBeenCalledTimes(1);
    expect(typed.onDiscard).not.toHaveBeenCalled();
  });

  it("closes on a click outside but not inside", () => {
    const props = renderPopover();
    fireEvent.pointerDown(screen.getByRole("textbox"));
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("limits the comment to 2000 characters", () => {
    renderPopover();
    expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "2000");
  });
});
