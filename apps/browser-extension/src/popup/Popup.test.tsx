import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BackgroundRequest } from "../messages";
import { Popup, type Transport } from "./Popup";

const grant = (): Promise<boolean> => Promise.resolve(true);

type Replies = Partial<Record<BackgroundRequest["kind"], unknown>>;

function fake(replies: Replies): { send: Transport; calls: BackgroundRequest[] } {
  const calls: BackgroundRequest[] = [];
  const send: Transport = (request) => {
    calls.push(request);
    return Promise.resolve(replies[request.kind] ?? { ok: true });
  };
  return { send, calls };
}

describe("Popup", () => {
  it("asks the background to reconnect when it opens", async () => {
    const { send, calls } = fake({ retry: { state: "connected" }, siteAccess: { state: "allowed", origin: "http://localhost/*" } });
    render(<Popup send={send} requestPermission={grant} />);
    await screen.findByText("Connected to CapKit");
    expect(calls[0]).toEqual({ kind: "retry" });
  });

  it("shows the pairing input with numeric one-time-code attributes when there is no token", async () => {
    const { send } = fake({ retry: { state: "no-token" } });
    render(<Popup send={send} requestPermission={grant} />);
    const input = await screen.findByLabelText(/6-digit code/i);
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("maxlength", "6");
  });

  it("accepts a pasted code with a space and submits it", async () => {
    const { send, calls } = fake({ retry: { state: "no-token" }, pair: { state: "connected" }, siteAccess: { state: "unavailable" } });
    const user = userEvent.setup();
    render(<Popup send={send} requestPermission={grant} />);
    const input = await screen.findByLabelText(/6-digit code/i);
    await user.click(input);
    await user.paste("123 456");
    expect(input).toHaveValue("123456");
    await user.click(screen.getByRole("button", { name: "Pair" }));
    await waitFor(() => {
      expect(calls).toContainEqual({ kind: "pair", code: "123456" });
    });
    await screen.findByText("Connected to CapKit");
  });

  it("keeps Pair disabled until six digits are entered", async () => {
    const { send } = fake({ retry: { state: "no-token" } });
    const user = userEvent.setup();
    render(<Popup send={send} requestPermission={grant} />);
    const input = await screen.findByLabelText(/6-digit code/i);
    await user.type(input, "12ab3");
    expect(input).toHaveValue("123");
    expect(screen.getByRole("button", { name: "Pair" })).toBeDisabled();
  });

  it("explains an unreachable CapKit and retries", async () => {
    const { send, calls } = fake({ retry: { state: "unreachable" } });
    const user = userEvent.setup();
    render(<Popup send={send} requestPermission={grant} />);
    await screen.findByText(/isn't running or Developer tools is off/i);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(calls.filter((c) => c.kind === "retry")).toHaveLength(2);
  });

  it("shows the rejection reason with a Pair again button", async () => {
    const { send } = fake({ retry: { state: "rejected", reason: "That code expired. Open Developer tools in CapKit for a new one." } });
    render(<Popup send={send} requestPermission={grant} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("That code expired");
    expect(screen.getByRole("button", { name: "Pair again" })).toBeInTheDocument();
  });

  it("shows the wrong-code and too-many-attempts copy", async () => {
    const first = fake({ retry: { state: "rejected", reason: "That code didn't match" } });
    const { unmount } = render(<Popup send={first.send} requestPermission={grant} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("That code didn't match");
    unmount();
    const second = fake({ retry: { state: "rejected", reason: "Too many wrong codes. Generate a new code in CapKit." } });
    render(<Popup send={second.send} requestPermission={grant} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many wrong codes. Generate a new code in CapKit.");
  });

  it("asks Chrome for site access from the popup click, then rereads access", async () => {
    const { send, calls } = fake({
      retry: { state: "connected" },
      siteAccess: { state: "needs-access", origin: "https://example.com/*" },
    });
    const requestPermission = vi.fn((): Promise<boolean> => Promise.resolve(true));
    const user = userEvent.setup();
    render(<Popup send={send} requestPermission={requestPermission} />);
    await user.click(await screen.findByRole("button", { name: "Allow on this site" }));
    expect(requestPermission).toHaveBeenCalledWith(["https://example.com/*"]);
    await waitFor(() => {
      expect(calls.filter((call) => call.kind === "siteAccess").length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByRole("button", { name: "Allow on all sites" })).toBeInTheDocument();
  });

  it("says when the page can't be inspected and disables Inspect page", async () => {
    const { send } = fake({ retry: { state: "connected" }, siteAccess: { state: "unavailable" } });
    render(<Popup send={send} requestPermission={grant} />);
    expect(await screen.findByText("Not available on this page")).toBeInTheDocument();
    expect(screen.getByText("These tools work on web pages (http and https) only.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspect page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pick and comment" })).toBeDisabled();
  });

  it("keeps the popup open with a message when the inspector can't start", async () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => undefined);
    const { send } = fake({ retry: { state: "connected" }, siteAccess: { state: "allowed" }, inspectActiveTab: { ok: false } });
    const user = userEvent.setup();
    render(<Popup send={send} requestPermission={grant} />);
    await screen.findByText("Connected to CapKit");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Inspect page" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "Inspect page" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't start the inspector here.");
    expect(close).not.toHaveBeenCalled();
    close.mockRestore();
  });

  it("offers Inspect page without CapKit (standalone)", async () => {
    const { send } = fake({ retry: { state: "unreachable" }, siteAccess: { state: "needs-access", origin: "https://example.com/*" } });
    render(<Popup send={send} requestPermission={grant} />);
    expect(await screen.findByRole("button", { name: "Inspect page" })).toBeEnabled();
  });

  it("starts the inspector from Inspect page", async () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => undefined);
    const { send, calls } = fake({ retry: { state: "connected" }, siteAccess: { state: "allowed", origin: "http://localhost/*" } });
    const user = userEvent.setup();
    render(<Popup send={send} requestPermission={grant} />);
    await screen.findByText("Connected to CapKit");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Inspect page" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "Inspect page" }));
    expect(calls).toContainEqual({ kind: "inspectActiveTab" });
    await waitFor(() => {
      expect(close).toHaveBeenCalled();
    });
    close.mockRestore();
  });

  it("starts Pick and comment from its button", async () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => undefined);
    const { send, calls } = fake({ retry: { state: "unreachable" }, siteAccess: { state: "needs-access", origin: "https://example.com/*" } });
    const user = userEvent.setup();
    render(<Popup send={send} requestPermission={grant} />);
    const pick = await screen.findByRole("button", { name: "Pick and comment" });
    await waitFor(() => {
      expect(pick).toBeEnabled();
    });
    await user.click(pick);
    expect(calls).toContainEqual({ kind: "pickActiveTab" });
    await waitFor(() => {
      expect(close).toHaveBeenCalled();
    });
    close.mockRestore();
  });

  it("explains when Pick and comment can't start", async () => {
    const close = vi.spyOn(window, "close").mockImplementation(() => undefined);
    const { send } = fake({ retry: { state: "unreachable" }, siteAccess: { state: "allowed" }, pickActiveTab: { ok: false } });
    const user = userEvent.setup();
    render(<Popup send={send} requestPermission={grant} />);
    const pick = await screen.findByRole("button", { name: "Pick and comment" });
    await waitFor(() => {
      expect(pick).toBeEnabled();
    });
    await user.click(pick);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't start Pick and comment here.");
    expect(close).not.toHaveBeenCalled();
    close.mockRestore();
  });
});
