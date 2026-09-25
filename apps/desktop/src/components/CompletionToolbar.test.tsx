import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompletionAction } from "../domain/capture";
import { CompletionToolbar } from "./CompletionToolbar";

const actions: readonly { action: CompletionAction; label: string }[] = [
  { action: "copy", label: "Copy" },
  { action: "copy-and-save", label: "Copy & Save" },
  { action: "save", label: "Save" },
  { action: "pin", label: "Pin" },
];

function renderToolbar(onComplete: (action: CompletionAction) => void): void {
  render(
    <CompletionToolbar
      copyAndSaveShortcut="A"
      copyShortcut="C"
      diagnostic={undefined}
      saveShortcut="S"
      state="idle"
      statusMessage=""
      statusSide="right"
      onComplete={onComplete}
      onRetrySave={() => undefined}
    />,
  );
}

describe("CompletionToolbar", () => {
  afterEach(() => cleanup());

  it.each(actions)("activates $label once for mouse and touch pointer sequences", ({ action, label }) => {
    const onComplete = vi.fn();
    renderToolbar(onComplete);
    const button = screen.getByRole("button", { name: label });

    fireEvent.pointerUp(button, { pointerType: "mouse" });
    fireEvent.click(button);
    fireEvent.pointerUp(button, { pointerType: "touch" });
    fireEvent.click(button);

    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenNthCalledWith(1, action);
    expect(onComplete).toHaveBeenNthCalledWith(2, action);
  });

  it.each(actions)("keeps $label to one native activation for Enter and Space", ({ action, label }) => {
    const onComplete = vi.fn();
    renderToolbar(onComplete);
    const button = screen.getByRole("button", { name: label });
    button.focus();

    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyUp(button, { key: "Enter" });
    button.click();
    cleanup();
    renderToolbar(onComplete);
    const spaceButton = screen.getByRole("button", { name: label });
    spaceButton.focus();
    fireEvent.keyDown(spaceButton, { key: " " });
    fireEvent.keyUp(spaceButton, { key: " " });
    spaceButton.click();

    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenNthCalledWith(1, action);
    expect(onComplete).toHaveBeenNthCalledWith(2, action);
  });
});
