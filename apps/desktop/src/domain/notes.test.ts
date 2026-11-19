import { describe, expect, it } from "vitest";
import { buildCaptureNote, nextNoteNumber, noteSummary, notesReducer, type CaptureNote } from "./notes";

const note = (id: string, number: number): CaptureNote => ({
  id,
  counterId: `counter-${id}`,
  number,
  anchor: { x: 10, y: 10 },
  area: null,
  comment: "",
  detail: null,
  fallback: null,
});

describe("notesReducer", () => {
  it("adds notes and never renumbers after a removal", () => {
    let state = notesReducer([], { type: "add", note: note("a", 1) });
    state = notesReducer(state, { type: "add", note: note("b", 2) });
    state = notesReducer(state, { type: "add", note: note("c", 3) });
    state = notesReducer(state, { type: "remove", id: "b" });
    expect(state.map((item) => item.number)).toEqual([1, 3]);
  });

  it("keeps the comment typed on the right note", () => {
    const state = notesReducer([note("a", 1), note("b", 2)], {
      type: "comment",
      id: "b",
      comment: "Padding looks off",
    });
    expect(state.map((item) => item.comment)).toEqual(["", "Padding looks off"]);
  });

  it("lands an out-of-order lookup on its own note", () => {
    const state = notesReducer([note("a", 1), note("b", 2)], {
      type: "lookup",
      id: "a",
      detail: null,
      fallback: { role: "button", name: "Save" },
    });
    expect(state[0]?.fallback).toEqual({ role: "button", name: "Save" });
    expect(state[1]?.fallback).toBeNull();
  });

  it("drops notes whose counter is no longer in the scene", () => {
    const state = notesReducer([note("a", 1), note("b", 2)], {
      type: "sync",
      counterIds: new Set(["counter-b"]),
    });
    expect(state.map((item) => item.id)).toEqual(["b"]);
  });

  it("returns the same array when sync changes nothing", () => {
    const before = [note("a", 1)];
    expect(notesReducer(before, { type: "sync", counterIds: new Set(["counter-a"]) })).toBe(before);
  });

  it("ignores actions for unknown ids", () => {
    const before = [note("a", 1)];
    expect(notesReducer(before, { type: "comment", id: "zzz", comment: "x" })).toBe(before);
  });
});

describe("nextNoteNumber", () => {
  it("starts at 1 and continues after the highest number", () => {
    expect(nextNoteNumber([])).toBe(1);
    expect(nextNoteNumber([note("a", 1), note("c", 3)])).toBe(4);
  });
});

describe("noteSummary and buildCaptureNote", () => {
  const base: CaptureNote = {
    id: "n1", counterId: "c1", number: 1, anchor: { x: 1, y: 1 }, area: null,
    comment: "Too tight", detail: null, fallback: null,
  };

  it("describes pending, failed and fallback lookups", () => {
    expect(noteSummary(base, "pending")).toBe("Reading element…");
    expect(noteSummary(base, { failed: "no extension connected" })).toBe(
      "No element details (no extension connected)",
    );
    expect(noteSummary({ ...base, fallback: { role: "button", name: "Save" } }, "done")).toBe("button: Save");
  });

  it("builds masked Markdown without extension data", () => {
    const result = buildCaptureNote(
      [{ ...base, comment: "token ghp_abcdefghijklmnopqrstuvwxyz0123456789" }],
      "C:\\notes\\a.png",
      new Date("2026-11-19T10:00:00Z"),
    );
    expect(result.detail).toBe("none");
    expect(result.pinCount).toBe(1);
    expect(result.markdown).toContain("C:\\notes\\a.png");
    expect(result.markdown).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
  });
});
