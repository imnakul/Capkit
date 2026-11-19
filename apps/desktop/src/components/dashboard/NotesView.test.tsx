import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteSummary } from "../../lib/tauri";
import { NotesView } from "./NotesView";

const mocks = vi.hoisted(() => ({
  listNotes: vi.fn(),
  copyNote: vi.fn(),
  deleteNote: vi.fn(),
  openNoteUrl: vi.fn(),
  startNoteDrag: vi.fn(),
  cleanupUnsavedNotes: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: mocks.confirm }));
vi.mock("../../lib/tauri", () => ({
  listNotes: mocks.listNotes,
  copyNote: mocks.copyNote,
  deleteNote: mocks.deleteNote,
  openNoteUrl: mocks.openNoteUrl,
  startNoteDrag: mocks.startNoteDrag,
  cleanupUnsavedNotes: mocks.cleanupUnsavedNotes,
  describeInvokeError: (_error: unknown, fallback: string): string => fallback,
}));

function note(index: number, overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    createdAt: "2026-11-19T10:30:00Z",
    pageUrl: `https://example.com/page-${String(index)}`,
    pageTitle: `Page ${String(index)}`,
    imagePath: `C:\\notes\\${String(index)}.png`,
    imageUrl: `asset://${String(index)}.png`,
    pinCount: 2,
    detail: "extension",
    firstComment: `Comment ${String(index)}`,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.listNotes.mockReset();
  mocks.copyNote.mockReset().mockResolvedValue(undefined);
  mocks.deleteNote.mockReset().mockResolvedValue(undefined);
  mocks.openNoteUrl.mockReset().mockResolvedValue(undefined);
  mocks.startNoteDrag.mockReset().mockResolvedValue(undefined);
  mocks.cleanupUnsavedNotes.mockReset().mockResolvedValue(undefined);
  mocks.confirm.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("NotesView", () => {
  it("shows a loading state, then the notes with title, host and pin count", async () => {
    let resolve: (value: readonly NoteSummary[]) => void = () => undefined;
    mocks.listNotes.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<NotesView />);
    expect(screen.getByRole("status", { name: "Loading notes" })).toBeInTheDocument();
    act(() => { resolve([note(1)]); });
    expect(await screen.findByText("Page 1")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("2 pins")).toBeInTheDocument();
    expect(screen.getByText("Comment 1")).toBeInTheDocument();
  });

  it("falls back to the host, then to 'Screen capture', for the title", async () => {
    mocks.listNotes.mockResolvedValue([
      note(1, { pageTitle: null }),
      note(2, { pageTitle: null, pageUrl: null }),
    ]);
    render(<NotesView />);
    expect(await screen.findByRole("heading", { name: "example.com" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Screen capture" })).toBeInTheDocument();
  });

  it("sweeps unsaved images once on mount", async () => {
    mocks.listNotes.mockResolvedValue([]);
    render(<NotesView />);
    await screen.findByText(/No notes yet/);
    expect(mocks.cleanupUnsavedNotes).toHaveBeenCalledTimes(1);
  });

  it("explains how to create the first note", async () => {
    mocks.listNotes.mockResolvedValue([]);
    render(<NotesView />);
    expect(
      await screen.findByText("No notes yet. Use the Note tool (N) in a capture, then Save note."),
    ).toBeInTheDocument();
  });

  it("shows an error with Retry", async () => {
    mocks.listNotes.mockRejectedValueOnce(new Error("db locked")).mockResolvedValueOnce([note(1)]);
    render(<NotesView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Notes could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Page 1")).toBeInTheDocument();
  });

  it("debounces search and ignores a stale response", async () => {
    vi.useFakeTimers();
    mocks.listNotes.mockResolvedValue([]);
    render(<NotesView />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    mocks.listNotes.mockClear();

    let resolveSlow: (value: readonly NoteSummary[]) => void = () => undefined;
    mocks.listNotes.mockReturnValueOnce(new Promise((done) => { resolveSlow = done; }));
    mocks.listNotes.mockResolvedValueOnce([note(2)]);
    const search = screen.getByRole("searchbox", { name: "Search notes" });
    fireEvent.change(search, { target: { value: "ab" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(mocks.listNotes).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(mocks.listNotes).toHaveBeenCalledWith("ab", 60, 0);

    fireEvent.change(search, { target: { value: "abc" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(mocks.listNotes).toHaveBeenLastCalledWith("abc", 60, 0);
    act(() => { resolveSlow([note(1)]); });
    expect(screen.queryByText("Page 1")).not.toBeInTheDocument();
    expect(screen.getByText("Page 2")).toBeInTheDocument();
  });

  it("says when nothing matches the search", async () => {
    vi.useFakeTimers();
    mocks.listNotes.mockResolvedValue([]);
    render(<NotesView />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search notes" }), { target: { value: "zzz" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByText("No notes match 'zzz'")).toBeInTheDocument();
  });

  it("loads more when a full page came back", async () => {
    const firstPage = Array.from({ length: 60 }, (_, index) => note(index + 1));
    mocks.listNotes.mockResolvedValueOnce(firstPage).mockResolvedValueOnce([note(61)]);
    render(<NotesView />);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() => expect(mocks.listNotes).toHaveBeenLastCalledWith("", 60, 60));
    expect(await screen.findByText("Page 61")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("copies a note's Markdown from its card", async () => {
    mocks.listNotes.mockResolvedValue([note(1)]);
    render(<NotesView />);
    fireEvent.click(await screen.findByRole("button", { name: "Copy Markdown for Page 1" }));
    await waitFor(() => expect(mocks.copyNote).toHaveBeenCalledWith(note(1).id));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("deletes through the context menu after confirming", async () => {
    mocks.listNotes.mockResolvedValue([note(1)]);
    render(<NotesView />);
    const card = await screen.findByRole("button", { name: "Open menu for Page 1" });
    fireEvent.contextMenu(card);
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith("Delete this note? This can't be undone.", expect.anything()));
    await waitFor(() => expect(mocks.deleteNote).toHaveBeenCalledWith(note(1).id));
  });

  it("keeps the note when delete is declined", async () => {
    mocks.confirm.mockResolvedValue(false);
    mocks.listNotes.mockResolvedValue([note(1)]);
    render(<NotesView />);
    fireEvent.contextMenu(await screen.findByRole("button", { name: "Open menu for Page 1" }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(mocks.deleteNote).not.toHaveBeenCalled();
  });

  it("disables Open page and Copy URL for a note without a URL", async () => {
    mocks.listNotes.mockResolvedValue([note(1, { pageUrl: null, pageTitle: null })]);
    render(<NotesView />);
    fireEvent.contextMenu(await screen.findByRole("button", { name: "Open menu for Screen capture" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Open page" })).toBeDisabled();
    expect(within(menu).getByRole("menuitem", { name: "Copy URL" })).toBeDisabled();
  });

  it("opens the page from the context menu", async () => {
    mocks.listNotes.mockResolvedValue([note(1)]);
    render(<NotesView />);
    fireEvent.contextMenu(await screen.findByRole("button", { name: "Open menu for Page 1" }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Open page" }));
    await waitFor(() => expect(mocks.openNoteUrl).toHaveBeenCalledWith(note(1).id));
  });

  it("opens the context menu from the keyboard with Shift+F10", async () => {
    mocks.listNotes.mockResolvedValue([note(1)]);
    render(<NotesView />);
    const card = await screen.findByRole("button", { name: "Open menu for Page 1" });
    fireEvent.keyDown(card, { key: "F10", shiftKey: true });
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("starts a file drag only after the pointer moves past 4 px", async () => {
    mocks.listNotes.mockResolvedValue([note(1)]);
    render(<NotesView />);
    const card = await screen.findByRole("button", { name: "Open menu for Page 1" });
    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10, buttons: 1 });
    fireEvent.pointerMove(card, { clientX: 12, clientY: 12, buttons: 1 });
    expect(mocks.startNoteDrag).not.toHaveBeenCalled();
    fireEvent.pointerMove(card, { clientX: 30, clientY: 30, buttons: 1 });
    expect(mocks.startNoteDrag).toHaveBeenCalledWith(note(1).id);
  });
});
