import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultToolbarActions,
  type CompletionActionId,
  type SnaphubSettings,
} from "../domain/settings";
import { completionRailItems, type CompletionHandlers } from "./captureActions";
import { CompletionToolbar, type CompletionToolbarState } from "./CompletionToolbar";

const actions: readonly { action: CompletionActionId; label: string }[] = [
  { action: "copy", label: "Copy" },
  { action: "copy-and-save", label: "Copy & Save" },
  { action: "save", label: "Save" },
  { action: "pin", label: "Pin" },
  { action: "showcase", label: "Save & Showcase" },
];

function handlers(onAction: (id: CompletionActionId) => void, canReadText = false): CompletionHandlers {
  return {
    copyShortcut: "C",
    copyAndSaveShortcut: "A",
    saveShortcut: "S",
    disabled: false,
    canReadText,
    onAction,
  };
}

function renderToolbar(
  onAction: (id: CompletionActionId) => void,
  options: {
    canReadText?: boolean;
    actions?: SnaphubSettings["toolbar"]["actions"];
    state?: CompletionToolbarState;
  } = {},
): void {
  const items = completionRailItems(
    options.actions ?? defaultToolbarActions,
    "vertical",
    handlers(onAction, options.canReadText ?? false),
  );
  render(
    <CompletionToolbar
      diagnostic={undefined}
      items={items}
      state={options.state ?? "idle"}
      statusMessage=""
      statusSide="right"
      onRetrySave={() => undefined}
    />,
  );
}

describe("CompletionToolbar", () => {
  afterEach(() => cleanup());

  it.each(actions)("activates $label once for mouse and touch pointer sequences", ({ action, label }) => {
    const onAction = vi.fn();
    renderToolbar(onAction);
    const button = screen.getByRole("button", { name: label });

    fireEvent.pointerUp(button, { pointerType: "mouse" });
    fireEvent.click(button);
    fireEvent.pointerUp(button, { pointerType: "touch" });
    fireEvent.click(button);

    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenNthCalledWith(1, action);
    expect(onAction).toHaveBeenNthCalledWith(2, action);
  });

  it.each(actions)("keeps $label to one native activation for Enter and Space", ({ action, label }) => {
    const onAction = vi.fn();
    renderToolbar(onAction);
    const button = screen.getByRole("button", { name: label });
    button.focus();
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyUp(button, { key: "Enter" });
    button.click();
    cleanup();
    renderToolbar(onAction);
    const spaceButton = screen.getByRole("button", { name: label });
    spaceButton.focus();
    fireEvent.keyDown(spaceButton, { key: " " });
    fireEvent.keyUp(spaceButton, { key: " " });
    spaceButton.click();

    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onAction).toHaveBeenNthCalledWith(1, action);
    expect(onAction).toHaveBeenNthCalledWith(2, action);
  });

  it("shows the text actions only when the OS can read text", () => {
    renderToolbar(() => undefined);
    expect(screen.queryByRole("button", { name: "Copy text" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Find sensitive text" })).toBeNull();
    cleanup();
    const onAction = vi.fn();
    renderToolbar(onAction, { canReadText: true });
    fireEvent.click(screen.getByRole("button", { name: "Copy text" }));
    fireEvent.click(screen.getByRole("button", { name: "Find sensitive text" }));
    expect(onAction).toHaveBeenNthCalledWith(1, "copy-text");
    expect(onAction).toHaveBeenNthCalledWith(2, "find-sensitive");
  });

  it("hides disabled actions and actions moved to the horizontal toolbar", () => {
    renderToolbar(() => undefined, {
      actions: {
        ...defaultToolbarActions,
        pin: { enabled: false, placement: "vertical" },
        save: { enabled: true, placement: "horizontal" },
      },
    });
    expect(screen.queryByRole("button", { name: "Pin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });

  it("drops the empty rail when every action is hidden", () => {
    const hidden = Object.fromEntries(
      Object.keys(defaultToolbarActions).map((id) => [id, { enabled: false, placement: "vertical" }]),
    );
    renderToolbar(() => undefined, { actions: { ...defaultToolbarActions, ...hidden } });
    expect(screen.queryByRole("toolbar", { name: "Capture actions" })).toBeNull();
  });

  it("disables every rail button while a capture is finishing", () => {
    renderToolbar(() => undefined, { state: "working" });
    expect(screen.getByRole("button", { name: "Copy" })).toHaveProperty("disabled", true);
  });
});

describe("completionRailItems", () => {
  it("puts moved actions in the horizontal list with their shortcuts", () => {
    const items = completionRailItems(
      { ...defaultToolbarActions, copy: { enabled: true, placement: "horizontal" } },
      "horizontal",
      handlers(() => undefined),
    );
    expect(items.map((item) => [item.label, item.shortcut])).toEqual([["Copy", "C"]]);
  });
});

describe("CompletionToolbar retry focus", () => {
  it("focuses Retry save in the same commit that shows it", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const props = {
      diagnostic: undefined,
      items: [],
      statusMessage: "",
      statusSide: "right",
      onRetrySave: (): void => undefined,
    } as const;
    const root = createRoot(container);
    act(() => root.render(<CompletionToolbar {...props} state="working" />));

    // Leave act so React schedules effects as it does in the app, then read focus when the DOM
    // mutates — the moment a user (or findByRole) first sees the button.
    const actEnvironment: unknown = Reflect.get(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", false);
    try {
      const focusedAtCommit = await new Promise<Element | null>((resolve) => {
        const observer = new MutationObserver(() => {
          if (container.querySelector("button") === null) return;
          observer.disconnect();
          resolve(document.activeElement);
        });
        observer.observe(container, { childList: true, subtree: true });
        setTimeout(() => root.render(<CompletionToolbar {...props} state="save-pending" />), 0);
      });
      expect(focusedAtCommit).toBe(screen.getByRole("button", { name: "Retry save" }));
    } finally {
      Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", actEnvironment);
      act(() => root.unmount());
      container.remove();
    }
  });
});
