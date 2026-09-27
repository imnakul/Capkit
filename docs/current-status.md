# Current Implementation Status

**Checkpoint date:** 2026-09-26

**Overall state:** Phase 1 vertical slice in progress

**Latest Windows artifact:** CapKit `0.1.1` x64 NSIS installer built 2026-07-27 at 3.57 MiB. The optimized executable is 11.01 MiB; this local artifact is not code-signed.

This document records what exists in the runtime today. The roadmap remains the source of truth for intended scope; this page prevents planned features, settings, or extension interfaces from being mistaken for completed behavior.

**Confirmed product name:** CapKit. Tagline: “The lightweight desktop toolkit to capture, record, and showcase.” Windows 11 is the only currently supported and physically tested platform; macOS, Ubuntu, and Fedora remain provisional rollout targets.

## Working reference slice

### Application shell and lifecycle

- **Implemented:** Tauri 2, Rust, React, strict TypeScript, Vite, Tailwind CSS, ESLint, Vitest, and pnpm workspace foundation.
- **Implemented:** Lightweight native system tray with capture, dashboard, and quit actions.
- **Implemented:** Capture/editor windows are created on demand and torn down after completion or cancellation.
- **Implemented:** Escape cancels capture and returns control to the normal desktop.
- **Implemented:** A local dashboard that indexes compatible images in the configured save folder, displays its path, and uses cached local thumbnails. Users can open the folder, open an image through its Windows default handler (with Open With fallback), and right-click for View, disabled-until-configured Cloud upload, Showcase navigation, or confirmed permanent deletion. Clipboard-only captures are never indexed.
- **Implemented:** The dashboard sidebar is ordered Screenshots, Showcase, Record, Settings. Screenshots is the renamed saved-capture library; Record holds both the recording library and the video Studio, so Edit opens the editor in place and Back returns to the recordings. Studio is not a section of its own.
- **Implemented:** The resident service creates `Pictures/CapKit` on startup, migrates the prior default folder when present, and uses `CapKit_` filenames for toolbar, scrolling, pinned, and direct save workflows.
- **Implemented:** Cloud remains a centered `Coming Soon...` placeholder; Showcase now opens a full-width scene builder with saved-capture selection, independently adjustable top/right/bottom/left padding (plus linked mode), background and frame visibility toggles, live background/radius controls, browser/glass/device frames, direct image dragging plus zoom/position/tilt/depth, shadows, effects, title/note layers, and local preset save/reset.
- **Implemented:** A repeatable x64 Microsoft Store pipeline builds a full-trust Desktop Bridge `.msix`, symbols, and `.msixupload` with the reserved Partner Center identity. MakeAppx semantic validation and the initial Windows App Certification Kit run pass overall; interactive packaged-runtime checks remain required through a locally trusted build or private Store flight.
- **Implemented:** Release executables use the Windows GUI subsystem, preventing an empty terminal window from appearing when an installed build starts. Debug builds retain console output, and the Store packager rejects any future console-subsystem executable.
- **Implemented:** Self-hosted Plus Jakarta Sans for interface text and JetBrains Mono for shortcuts, dimensions, color values, and technical data.
- **Implemented:** The dashboard window remains native-hidden through WebView bootstrap and is revealed only after its first styled React frame, preventing the repeated white startup flash.

### Capture and selection

- **Implemented:** Configurable primary global capture shortcut with conflict feedback.
- **Implemented:** Frozen-screen capture surface for the Windows display under the pointer, including negative-origin monitor selection.
- **Implemented:** Smooth free-rectangle selection, selection resize handles, and click-drag movement after selection.
- **Implemented:** Window hover highlighting and click selection.
- **Implemented, physical validation pending:** Optional inner-control detection uses Windows UI Automation in applications that expose accessibility rectangles. A bounded, cached screenshot-only visual-region fallback now highlights stable browser/page rectangles when DOM/CSS is not exposed; it deliberately returns geometry rather than pretending to know live browser semantics. Browsers and custom canvases still need physical tuning.
- **Implemented:** Toggleable crosshair, dimensions, magnifier, snapping, window detection, overlay tint, and custom capture cursor preferences. The configured high-contrast cursor remains active inside the selected frame and over capture controls instead of falling back to an invisible white hand cursor.
- **Implemented:** Adaptive toolbar placement near the selected region, including edge-of-screen handling.

### In-place annotation and completion

- **Implemented:** Versioned, serializable annotation scene model with undo and redo.
- **Implemented:** Line, smooth curved arrow, rectangle, ellipse, highlighter, freehand pencil, spotlight, counter, live source-backed blur and pixelation previews, blackout, and inline text tools.
- **Implemented:** Existing annotations are selectable in capture mode, show a boundary and local delete action, and can be dragged to a new position without undoing the scene.
- **Implemented:** Text placeholders select on first click, edit in place on the next click, commit before a subsequent placeholder is created, and expose a local delete action; Caveat is bundled for matching live and native exports.
- **Implemented:** User-configurable Individual and Group toolbar modes. Individual mode exposes every tool as its own toggle. Group mode uses ordered rows as enabled toolbar slots, treats the first tool as the group default, and supports drag/reorder, row add/remove, and a disabled-tool pool.
- **Implemented:** Hover-revealed grouped tools with consistently white submenu icons, animated primary indicators, an options-first contextual rail, separated quick-color rings, default color/stroke size, and a submenu that glides horizontally between toolbar slots while flipping/clamping at viewport edges.
- **Implemented:** Copy image, selected-region Copy & Save, save image, scrolling capture, pin, and cancel completion actions.
- **Implemented:** Configurable `C`/`A`/`S` capture-mode shortcuts complete Copy/Copy & Save/Save from the selected region; global shortcuts and scrolling-capture actions remain separate. Invalid or duplicate persisted local keys are repaired deterministically, while new writes reject collisions.
- **Implemented:** Completion buttons show configured capture-mode keys as compact badges, use one native click activation for mouse, touch, Enter, and Space, and expose a combined action with a distinct icon composition and valid `aria-keyshortcuts`.
- **Implemented, physical validation pending:** Copy & Save renders once in Rust, copies before atomically saving identical pixels, emits one saved event after rename, serializes duplicate completion and Escape against the native session, and retains only the rendered raster for save-only retry after a post-copy file failure.
- **Implemented:** Rust-side export composition that combines the immutable capture with the annotation scene.

### Pinning and preferences

- **Implemented:** Always-on-top pinned capture window with explicit routing, visible image content, resize, rotation, opacity, lock, bitmap copy, save, Escape/button close, and temporary-file cleanup.
- **Implemented:** Locally persisted appearance and capture preferences validated at the TypeScript boundary.
- **Implemented:** Light and dark dashboard themes, selectable accent, up to five quick colors plus custom colors, Individual/Group toolbar composition with WebView-safe pointer dragging and keyboard reordering, shortcut editing, overlay tint, startup behavior, and cursor settings.
- **Implemented:** Settings is split into four task tabs — General (startup, save location, theme accent), Screenshots (capture toolbar, colors and default size, detection and overlay, capture cursor, scrolling), Screen Draw (on-screen toolbar) and Shortcuts — behind a sticky sliding-pill tab bar. Each tab opens with its first section expanded and the rest collapsed, any number of sections can be open at once, and the tab and section state resets when the dashboard window reloads.
- **Implemented:** Cursor choices use the exact capture cursor while hovering their Settings cards, including the selected size and accent color.
- **Implemented, physical validation pending:** A configurable global shortcut toggles an on-demand transparent on-screen presentation layer on the display under the pointer. Live desktop is the default; Settings can instead preload a frozen frame, with automatic recovery to live mode if capture fails. Its bottom dock includes pencil, text, rectangle, ellipse, arrow, spotlight, magnifier, a press-and-hold presentation laser, Save screen (`S`), eraser, snapshot-backed blur, undo, redo, and undoable Clear. Save screen captures the composed monitor with annotations while keeping the session open; its own controls are hidden briefly. Settings owns unique optional number keys and Ring/Laser/Precision/Crosshair cursor presets. The same shortcut or `Escape` destroys the overlay and cleans its temporary snapshot.
- **Implemented:** Screen Draw Text visibly arms placement, opens a focused in-place editor on the next canvas click, isolates editor events from the drawing surface, and commits once. Screen Draw opens with a Select tool that moves, resizes and deletes committed drawings. Cursor/draft rendering is animation-frame coalesced; the laser dot and trail update SVG elements without per-move React renders, and released trails fade out. Static scene and dock layers avoid cursor-only rerenders. Capture waits for its frozen backdrop to decode and paint before revealing the surface, with a bounded fallback.

### Quality coverage

- **Implemented:** Frontend tests for settings migration/conflicts, selection behavior, combined completion states, keyboard exclusions, duplicate activation, stale-response handling, toolbar interaction, geometry, scene history, and scrolling-image stitching.
- **Implemented:** Rust tests covering combined render/clipboard/save ordering, identical decoded pixels at non-unit scale, secure redaction, render/clipboard/save failures, repeated save-only retry, duplicate IPC, cancellation races, partial cleanup, collision-safe naming, capture/export helpers, platform contracts, settings, pins, scrolling stitching, and related native behavior.
- **Implemented:** Type checking, ESLint, production build, Rust formatting, Clippy, and Rust test commands are part of the required checkpoint verification.

## Partial implementations and Phase 1 gaps

- **Partial:** Capture now targets the display under the pointer and has geometry tests for negative origins and shared monitor edges. Physical mixed-DPI hardware validation, cross-monitor selection, and HDR/SDR handling remain.
- **Partial:** Blur and pixelation have interactive previews and export support, but secure-redaction golden-image coverage across scaling modes remains required before making a security guarantee.
- **Implemented:** Capture, capture-and-copy, and capture-and-save shortcuts are registered together, execute distinct native workflows, and atomically restore prior bindings after a conflict.
- **Implemented:** A persistent native default save directory is shared by toolbar Save, scrolling Save, pinned-image Save, and the direct Capture & save shortcut. The setting uses a native folder picker and survives dashboard/WebView teardown and application restarts.
- **Partial:** Pinning loads the application entry by native `pin-*` window label, renders/copies/saves bitmap data, and routes taskbar Close, in-window Close, and Escape through registry cleanup plus native force-destroy. Pinned images can be moved via a corner drag handle (with mouse drag and keyboard arrow keys); click-through was removed because it had no reachable recovery path. Duplicate remains, and the corrected dynamic-window bootstrap/lifecycle require physical verification against development and packaged builds.
- **Implemented, hardware validation pending:** Scrolling can default to Automatic, Manual, or Always ask. The chooser appears beside the selected region only in Always ask mode and states that choosing a card starts immediately. Automatic capture uses shorter settling and coarse-to-fine sampled overlap matching instead of quadratic full-row comparison. The capture window is restored on worker failures and native diagnostic text is shown while retaining the stitched preview. Browser, code-editor, chat, native-list, animation, and unsupported-app acceptance matrices remain.
- **Partial:** Keyboard and semantic behavior exists for the current React controls; full screen-reader, high-contrast, reduced-motion, and capture-surface accessibility acceptance remains.
- **Partial benchmark:** A hidden development tray process measured 33.18 MB working set and 0% CPU over a five-second idle sample. Release install size, capture latency, and sustained annotation performance still require repeatable benchmarks.
- **Partial benchmark:** A hidden development tray process measured 33.18 MB working set and 0% CPU over a five-second idle sample. Shortcut activation no longer blocks on a duplicate frozen-image preload; release install size, end-to-end capture latency, and sustained annotation performance still require repeatable benchmarks.

## Intentionally outside the current runtime

- **Phase 2:** Combined image editor and visual asset Studio.
- **Phase 3:** Full local-library metadata, organization, tags, search, retention controls, and folder watching. The current dashboard is deliberately a lightweight on-demand view of the configured save directory, not this full library.
- **Phase 4:** Accounts, Cloudflare R2 storage, share URLs, view analytics, quotas, and billing.
- **Implemented, frame-by-frame validation pending:** Screen recording. Display, window, and drawn-region sources (the region overlay asks for an area per session and never persists it); countdown; a content-sized floating dock excluded from the video through `WDA_EXCLUDEFROMCAPTURE`; H.264 through the Media Foundation sink writer with no CPU-side frame copy; system-audio and microphone AAC sidecars with per-device selection and fallback warnings; and a 250 Hz cursor and click track written alongside every recording. The recordings list overlays the cursor track on the letterboxed video. Verified by three ignored-by-default integration tests that need an interactive desktop; run them with `cargo test -- --ignored`.
- **Implemented:** The camera window grants access on the dock click through WebView2 and clears a persisted deny, with a centred recovery panel (settings link, retry, close) when Windows blocks access or no camera exists.
- **Implemented, manual export validation pending:** The video Studio. Non-destructive trim, the Showcase treatment applied to video (background/padding/radius/shadow/effects via a shared `scene.ts`), cursor smoothing and automatic zoom-on-click (a `src/domain/zoomKeyframes.ts` keyframe track, mergeable with manual overrides), a mirrored circle/square/rounded webcam track excluded from screen capture, pause/resume that omits paused time from the output, and MP4 (WebCodecs + `mp4-muxer`) or GIF (hand-written encoder) export.
  - Verified by automated tests: 176 frontend tests including GIF byte-format correctness (signature, trailer, loop extension, declared dimensions) and compositor draw-order/gating logic against a fake Canvas2D context.
  - **Not yet verified:** encoding a real recording through `VideoEncoder` inside the packaged app's WebView2. Manual steps: Record a short clip -> Studio -> trim, apply a look, confirm zoom keyframes appear on clicks -> Export MP4 -> confirm it opens in Windows Media Player/PowerPoint/Chrome at the declared resolution with audio in sync -> Export GIF -> confirm it animates and loops.
- **Think Later:** OCR area capture, QR-code detection, color detection, AI, and collaboration.

## Recommended next milestone

Complete **Phase 1 Core Hardening** before expanding into Studio or Cloud:

1. Validate monitor-under-pointer capture on physical mixed-DPI and HDR/SDR hardware, then add cross-monitor selection.
2. Complete secure redaction exports and annotation golden-image coverage.
3. Exercise scrolling capture across the acceptance application matrix, tune overlap/input timing, and add pin duplication.
4. Profile cold trigger latency, pointer/drawing responsiveness, release install size, and teardown behavior.

## Related specifications

- [Feature roadmap](feature-roadmap.md)
- [Capture UX specification](capture-ux-spec.md)
- [Technical architecture](technical-architecture.md)
- [Performance and quality budgets](performance-quality.md)
- [Decision log](decision-log.md)
