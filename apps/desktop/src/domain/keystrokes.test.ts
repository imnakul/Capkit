import { describe, expect, it } from "vitest";
import { decodeCursorTrack, type CursorEvent, type KeyEvent } from "./cursorTrack";
import {
  defaultKeystrokeSettings,
  keystrokeChipsAt,
  keystrokeEntries,
  keystrokeHoldSeconds,
  keystrokeLabel,
} from "./keystrokes";

function key(time: number, name: string, modifiers: Partial<Pick<KeyEvent, "ctrl" | "shift" | "alt" | "meta">> = {}): KeyEvent {
  return { time, kind: "key", key: name, ctrl: false, shift: false, alt: false, meta: false, ...modifiers };
}

function typed(time: number): KeyEvent {
  return { time, kind: "text", key: "", ctrl: false, shift: false, alt: false, meta: false };
}

const click: CursorEvent = { time: 2, kind: "down", button: "right", x: 10, y: 10 };

describe("keystrokeLabel", () => {
  it("orders modifiers the way Windows writes shortcuts", () => {
    expect(keystrokeLabel(key(0, "S", { shift: true, meta: true }))).toBe("Win + Shift + S");
    expect(keystrokeLabel(key(0, "Esc", { ctrl: true, shift: true }))).toBe("Ctrl + Shift + Esc");
    expect(keystrokeLabel(key(0, "Enter"))).toBe("Enter");
  });
});

describe("keystrokeEntries", () => {
  const keys = [key(1, "C", { ctrl: true }), key(1.5, "Enter"), typed(1.6), key(1.7, "Tab", { shift: true })];

  it("shows only command shortcuts by default and never typed text", () => {
    expect(keystrokeEntries(keys, [], defaultKeystrokeSettings).map((entry) => entry.label)).toEqual(["Ctrl + C"]);
  });

  it("adds named keys in all-keys mode", () => {
    const labels = keystrokeEntries(keys, [], { ...defaultKeystrokeSettings, mode: "all" }).map((entry) => entry.label);
    expect(labels).toEqual(["Ctrl + C", "Enter", "Shift + Tab"]);
  });

  it("merges click labels in time order when enabled", () => {
    const entries = keystrokeEntries([key(3, "V", { ctrl: true })], [click, { ...click, kind: "up" }], {
      ...defaultKeystrokeSettings,
      clickLabels: true,
    });
    expect(entries).toEqual([
      { time: 2, label: "Right click" },
      { time: 3, label: "Ctrl + V" },
    ]);
  });
});

describe("keystrokeChipsAt", () => {
  const entries = [
    { time: 1, label: "Ctrl + Z" },
    { time: 1.4, label: "Ctrl + Z" },
    { time: 1.8, label: "Ctrl + Z" },
    { time: 2, label: "Ctrl + S" },
  ];

  it("shows nothing before the first press", () => {
    expect(keystrokeChipsAt(entries, 0.5)).toEqual([]);
  });

  it("counts repeats instead of stacking copies", () => {
    expect(keystrokeChipsAt(entries, 2.1).map((chip) => chip.label)).toEqual(["Ctrl + Z ×3", "Ctrl + S"]);
  });

  it("counts only the presses that have happened so far", () => {
    expect(keystrokeChipsAt(entries, 1.5).map((chip) => chip.label)).toEqual(["Ctrl + Z ×2"]);
  });

  it("fades in, holds, then disappears", () => {
    const single = [{ time: 1, label: "F5" }];
    expect(keystrokeChipsAt(single, 1)[0]?.opacity).toBe(0);
    expect(keystrokeChipsAt(single, 1.5)[0]?.opacity).toBe(1);
    const fading = keystrokeChipsAt(single, 1 + keystrokeHoldSeconds - 0.1)[0]?.opacity ?? 0;
    expect(fading).toBeGreaterThan(0);
    expect(fading).toBeLessThan(1);
    expect(keystrokeChipsAt(single, 1 + keystrokeHoldSeconds)).toEqual([]);
  });

  it("keeps at most three labels on screen", () => {
    const burst = ["A", "B", "C", "D"].map((name, index) => ({ time: 1 + index * 0.1, label: `Ctrl + ${name}` }));
    expect(keystrokeChipsAt(burst, 1.5).map((chip) => chip.label)).toEqual(["Ctrl + B", "Ctrl + C", "Ctrl + D"]);
  });
});

describe("cursor track decoding", () => {
  it("reads recordings made before keystrokes existed as having none", () => {
    const track = decodeCursorTrack({
      version: 1,
      times: [],
      xs: [],
      ys: [],
      events: [],
      shapes: [],
      displayBounds: { x: 0, y: 0, width: 100, height: 100 },
      scaleFactor: 1,
    });
    expect(track.keysRecorded).toBe(false);
    expect(track.keys).toEqual([]);
  });

  it("rejects an unknown key kind", () => {
    expect(() =>
      decodeCursorTrack({
        version: 1,
        times: [],
        xs: [],
        ys: [],
        events: [],
        shapes: [],
        keysRecorded: true,
        keys: [{ ...key(0, "A"), kind: "chord" }],
        displayBounds: { x: 0, y: 0, width: 100, height: 100 },
        scaleFactor: 1,
      }),
    ).toThrow();
  });
});
