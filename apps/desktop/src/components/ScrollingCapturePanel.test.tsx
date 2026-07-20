import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollingCapturePanel } from "./ScrollingCapturePanel";

describe("ScrollingCapturePanel", () => {
  afterEach(() => cleanup());

  it("offers automatic capture and a clearly labeled manual fallback", () => {
    const onAutomatic = vi.fn();
    const onManualStart = vi.fn();
    render(
      <ScrollingCapturePanel
        anchor={{ x: 100, y: 80, width: 400, height: 300 }}
        state={{ phase: "setup" }}
        onAutomatic={onAutomatic}
        onClose={() => undefined}
        onComplete={() => undefined}
        onManualAdd={() => undefined}
        onManualStart={onManualStart}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start automatic scrolling capture" }));
    fireEvent.click(screen.getByRole("button", { name: "Start manual scrolling capture" }));

    expect(onAutomatic).toHaveBeenCalledOnce();
    expect(onManualStart).toHaveBeenCalledOnce();
  });

  it("shows stitched preview status, retry, completion, and manual frame controls", () => {
    const onComplete = vi.fn();
    const onManualAdd = vi.fn();
    const onAutomatic = vi.fn();
    render(
      <ScrollingCapturePanel
        anchor={{ x: 100, y: 80, width: 400, height: 300 }}
        state={{
          phase: "preview",
          mode: "manual",
          completionError: "SH-EXPORT-001: The selected folder is unavailable",
          result: {
            outputPath: "C:/Temp/Snaphub/scroll/result.png",
            previewUrl: "asset://result.png",
            frameCount: 4,
            stickyHeaderHeight: 32,
            stoppedReason: "manual-ready",
          },
        }}
        onAutomatic={onAutomatic}
        onClose={() => undefined}
        onComplete={onComplete}
        onManualAdd={onManualAdd}
        onManualStart={() => undefined}
      />,
    );

    expect(screen.getByRole("img", { name: "Stitched scrolling capture preview" })).toHaveAttribute(
      "src",
      "asset://result.png",
    );
    expect(screen.getByText("4 frames stitched")).toBeVisible();
    expect(screen.getByText("Sticky header handled")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("The selected folder is unavailable");
    expect(screen.getByText("The stitched preview is still available. Retry Copy, Save, or Pin below.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Hide Snaphub and capture the next manually scrolled frame" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(onManualAdd).toHaveBeenCalledOnce();
    expect(onAutomatic).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith("copy");
  });
});
