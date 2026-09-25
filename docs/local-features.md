# CapKit local feature inventory

**Last reviewed:** 2026-09-25
**Product:** CapKit — *The lightweight desktop toolkit to capture, record, and showcase.*  
**Scope:** This is an inventory of behavior present in the local Windows-first application. It is not a promise that every item is release-ready.

## How to read this document

- **Implemented:** Present in the local runtime and wired to a user flow.
- **Partial:** Present, but still needs physical, packaged-build, accessibility, or fidelity validation.
- **Not local yet:** Deliberately outside the current runtime or still a future phase.

## Product shell and lifecycle

- **Implemented:** Tauri 2 desktop application with a Rust resident core, React/TypeScript UI, Vite, Tailwind CSS, ESLint, Vitest, and pnpm workspace.
- **Implemented:** Lightweight system-tray lifecycle with dashboard, capture, Screen Draw, restore-pins, and quit actions.
- **Implemented:** Dashboard and editor surfaces are created or revealed on demand; capture/editor workers and temporary assets are released after completion or cancellation.
- **Implemented:** Windows GUI-subsystem release builds do not open a terminal window.
- **Implemented:** Plus Jakarta Sans is used for interface text; JetBrains Mono is used for shortcuts, dimensions, color values, and technical data; Caveat is bundled for handwritten annotations.
- **Implemented:** Light and dark dashboard themes, accent color, compact typography, and persisted local preferences.
- **Partial:** Windows 11 is the only physically tested platform. macOS, Ubuntu, and Fedora remain adapter targets.

## Capture and selection

- **Implemented:** Configurable global capture shortcut with conflict reporting.
- **Implemented:** Capture uses the display beneath the pointer, including negative-origin monitor geometry.
- **Implemented:** Frozen-screen capture surface with a free rectangular selection.
- **Implemented:** Selection resize handles and click-drag movement after selection.
- **Implemented:** Hover highlighting and click selection for windows.
- **Implemented:** Optional Windows UI Automation inner-control detection where the target exposes semantic accessibility rectangles, plus a bounded screenshot-only visual-region fallback for browser buttons, cards, and other stable rectangular surfaces.
- **Implemented:** Toggleable crosshair, dimensions, magnifier, snapping, window detection, overlay tint, and custom capture cursor.
- **Implemented:** Adaptive contextual toolbar placement near the selected frame, including edge clamping/flipping.
- **Partial:** Mixed-DPI hardware, HDR/SDR, cross-monitor selection, elevated applications, browser DOM/CSS semantic labels, and custom canvas region fidelity still need physical validation. The visual fallback intentionally returns geometry, not live DOM/CSS metadata.

## Quick annotation editor

The editor is in-place: the selected pixels remain the immutable source while annotations remain editable until export.

- **Implemented:** Rectangle, ellipse, line, straight arrow, curved arrow, arrow heads, highlighter, freehand pencil, spotlight, counter, text, blur, secure pixelation, and permanent blackout.
- **Implemented:** Live source-backed blur and pixelation previews, rather than only drawing a placeholder rectangle.
- **Implemented:** Existing annotations can be selected, bounded, moved, and deleted.
- **Implemented:** Text creates a placeholder, edits in place on the next click, commits before another placeholder is added, and exposes a local delete control.
- **Implemented:** System fonts plus Caveat handwritten text preset.
- **Implemented:** Undo and redo with typed scene history.
- **Implemented:** Individual toolbar mode with per-tool toggles.
- **Implemented:** Group toolbar mode with ordered rows, drag/reorder, default-first tool semantics, add/remove row, and disabled-tool pool.
- **Implemented:** Hover-revealed submenus, options-first ordering, separated color rings, size control, submenu edge flipping, and smooth toolbar/subtoolbar motion.
- **Implemented:** Copy, Copy & Save, Save, Pin, Cancel, scrolling capture, and keyboard `C`/`A`/`S` selected-region completion actions. The combined action renders once for identical clipboard/PNG pixels and retains a save-only retry after a post-copy file failure.

## Export, pinning, and local files

- **Implemented:** Copy edited image to the clipboard.
- **Implemented:** Copy & Save edited image once to the clipboard and atomically to the configured folder, with duplicate-action protection, cancellation serialization, partial-save diagnostics, and save-only retry.
- **Implemented:** Save edited image to the configured folder.
- **Implemented:** Native save-directory picker with a default `Pictures/CapKit` folder created on startup.
- **Implemented:** Toolbar Save, scrolling Save, pinned-image Save, and direct Capture & Save use the same persisted save directory.
- **Implemented:** CapKit filename generation for normal, scrolling, pinned, and direct-save workflows.
- **Implemented:** Always-on-top pinned capture windows with resize, rotate, opacity, lock, copy, save, click-through, Escape/button close, taskbar close routing, and temporary-file cleanup.
- **Partial:** Pin duplication and packaged-build pin lifecycle still require physical validation.
- **Implemented:** Dashboard local workspace indexes explicitly saved images, shows the save path and file count, caches thumbnails, opens the folder, opens images with the Windows default handler/Open With, and supports View, Showcase, disabled Cloud upload, and confirmed Delete context actions.
- **Implemented:** Clipboard-only captures are not indexed.

## Scrolling capture

- **Implemented:** Automatic and manual scrolling capture modes.
- **Implemented:** Settings choice: Automatic, Manual, or Always ask.
- **Implemented:** Automatic scrolling, bounded frame collection, unchanged-frame stopping, overlap matching, sticky-header handling, cleanup, retry, manual fallback, and preview.
- **Implemented:** Chooser appears beside the selected region when Always ask is enabled.
- **Partial:** Browser, code editor, chat, native list, animation, unsupported application, mixed-DPI, and timing acceptance matrices remain.

## Screen Draw / presentation toolbar

- **Implemented:** Separate configurable global shortcut to toggle an on-screen drawing layer without entering screenshot capture.
- **Implemented:** Live desktop mode and optional frozen-frame mode.
- **Implemented:** Bottom-center dock with pencil, text, rectangle, ellipse, arrow, spotlight, magnifier, presentation pointer/laser, eraser, blur, undo, redo, and Clear.
- **Implemented:** Spotlight darkens the surrounding screen while keeping the focused region visible.
- **Implemented:** Presentation laser persists while the primary pointer button is held and clears immediately on release.
- **Implemented:** Text placement opens a focused in-place editor and commits once.
- **Implemented:** Cursor/draft rendering is animation-frame coalesced; static layers avoid cursor-only rerenders.
- **Implemented:** Settings for drawing color, stroke size, spotlight size, cursor preset, unique number-key shortcuts, live/frozen behavior, and drawing persistence.
- **Partial:** Physical latency, accessibility, and broad application compatibility remain validation work.

## Showcase and visual asset studio

- **Implemented:** Full-width Showcase workspace with saved-capture selection.
- **Implemented:** Background enable/disable, solid colors, gradients, wallpapers, custom colors, independent top/right/bottom/left padding, linked padding, roundedness, frames, glass/browser/device treatments, shadows, image effects, title/note layers, local preset save/reset, and export composition.
- **Implemented:** Image dragging, zoom, four-direction positioning, tilt, and perspective/depth controls.
- **Partial:** The full Studio roadmap and broad export fidelity still need manual validation.

## Recording and Studio

- **Implemented:** Display, window, and region recording sources.
- **Implemented:** Countdown, floating dock exclusion from the recording, H.264 Media Foundation capture, system-audio and microphone AAC sidecars, cursor/click track, pause/resume, and recording status.
- **Implemented:** Studio trim, shared Showcase treatment, cursor smoothing, automatic zoom-on-click keyframes, webcam circle/square/rounded track, MP4 WebCodecs export, and GIF export.
- **Partial:** Packaged WebView2 `VideoEncoder` availability and real export playback/audio-sync acceptance remain manual checks.

## Settings and shortcuts

- **Implemented:** Global shortcuts for Start Capture, Capture & Copy, Capture & Save, and Screen Draw.
- **Implemented:** In-capture `C`, `A`, and `S` shortcuts with deterministic legacy repair and case-insensitive conflict rejection across Copy, Copy & Save, and Save.
- **Implemented:** Screen Draw number-key shortcut configuration.
- **Implemented:** Quick colors (up to five), custom colors, default color/size, theme accent, light/dark appearance, toolbar Individual/Group composition, detection toggles, overlay tint, save location, startup behavior, cursor preview/size, and reset controls.
- **Implemented:** Settings values are Zod-validated and stored locally.

## Privacy, storage, and performance behavior

- **Implemented:** Phase 1 capture, editing, Screen Draw, and local export require no account, cloud, telemetry, or network service.
- **Implemented:** Redaction tools permanently rasterize blackout, secure pixelation, and blur on export.
- **Observed:** Hidden development tray process measured 33.18 MiB working set and effectively 0% CPU in an idle sample.
- **Observed:** CapKit 0.1.1 x64 NSIS installer is 3.57 MiB; optimized release executable is 11.01 MiB.
- **Partial:** Repeatable cold-start, capture-latency, sustained drawing, install-footprint, and multi-monitor benchmarks remain.

## Not available locally yet

- Cloudflare R2 uploads, share URLs, view/click analytics, quotas, accounts, billing, and cloud upload context actions.
- Full metadata-backed local library with tags, search, retention, and folder watching.
- QR detection, color detection, AI, and collaboration.
- Cross-platform native permissions, capture, target detection, scrolling, and packaging for macOS and Linux.

## Suggested verification tour

1. Launch CapKit and confirm it remains in the tray with no terminal window.
2. Open Settings and verify global shortcuts, colors, cursor previews, toolbar modes, detection, overlay tint, save directory, and resets.
3. Capture a region, draw each annotation, select/move/delete an annotation, then test Copy, Copy & Save, Save, Pin, and Escape.
4. Test Automatic, Manual, and Always ask scrolling capture on a long browser page.
5. Toggle Screen Draw, hold the presentation laser, place text, use Spotlight, Clear, Undo, and Redo.
6. Open Dashboard and Showcase, verify saved-capture indexing, folder opening, context actions, frames, backgrounds, padding, transforms, and export.
7. Record a short clip, open Studio, trim, apply a Showcase treatment, and validate MP4/GIF playback.

## Source of truth

For detailed behavior and unresolved decisions, cross-check [Current implementation status](current-status.md), [Feature roadmap](feature-roadmap.md), [Capture UX specification](capture-ux-spec.md), [Technical architecture](technical-architecture.md), [Performance and quality](performance-quality.md), and [Decision log](decision-log.md).
