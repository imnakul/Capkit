# Current Implementation Status

**Checkpoint date:** 2026-07-19

**Overall state:** Phase 1 vertical slice in progress

This document records what exists in the runtime today. The roadmap remains the source of truth for intended scope; this page prevents planned features, settings, or extension interfaces from being mistaken for completed behavior.

**Confirmed product name:** Snaphub. Windows 11 is the only currently supported and physically tested platform; macOS, Ubuntu, and Fedora remain provisional rollout targets.

## Working reference slice

### Application shell and lifecycle

- **Implemented:** Tauri 2, Rust, React, strict TypeScript, Vite, Tailwind CSS, ESLint, Vitest, and pnpm workspace foundation.
- **Implemented:** Lightweight native system tray with capture, dashboard, and quit actions.
- **Implemented:** Capture/editor windows are created on demand and torn down after completion or cancellation.
- **Implemented:** Escape cancels capture and returns control to the normal desktop.
- **Implemented:** A local dashboard that indexes compatible images in the configured save folder, displays its path, and uses cached local thumbnails. Users can open the folder, open an image through its Windows default handler (with Open With fallback), and right-click for View, disabled-until-configured Cloud upload, Showcase navigation, or confirmed permanent deletion. Clipboard-only captures are never indexed.
- **Implemented:** Cloud and Showcase navigation lead to restrained, centered `Coming Soon...` placeholders until those product phases begin.
- **Implemented:** A repeatable x64 Microsoft Store pipeline builds a full-trust Desktop Bridge `.msix`, symbols, and `.msixupload` with the reserved Partner Center identity. MakeAppx semantic validation and the initial Windows App Certification Kit run pass overall; interactive packaged-runtime checks remain required through a locally trusted build or private Store flight.
- **Implemented:** Release executables use the Windows GUI subsystem, preventing an empty terminal window from appearing when an installed build starts. Debug builds retain console output, and the Store packager rejects any future console-subsystem executable.
- **Implemented:** Self-hosted Plus Jakarta Sans for interface text and JetBrains Mono for shortcuts, dimensions, color values, and technical data.
- **Implemented:** The dashboard window remains native-hidden through WebView bootstrap and is revealed only after its first styled React frame, preventing the repeated white startup flash.

### Capture and selection

- **Implemented:** Configurable primary global capture shortcut with conflict feedback.
- **Implemented:** Frozen-screen capture surface for the Windows display under the pointer, including negative-origin monitor selection.
- **Implemented:** Smooth free-rectangle selection, selection resize handles, and click-drag movement after selection.
- **Implemented:** Window hover highlighting and click selection.
- **Implemented, physical validation pending:** Optional inner-control detection uses Windows UI Automation in applications that expose accessibility rectangles. The experimental per-pixel visual-region inference was removed because its unstable target changes caused full-window hover flicker; browsers and custom canvases that do not expose semantic bounds fall back to window or free-rectangle selection.
- **Implemented:** Toggleable crosshair, dimensions, magnifier, snapping, window detection, overlay tint, and custom capture cursor preferences. The configured high-contrast cursor remains active inside the selected frame and over capture controls instead of falling back to an invisible white hand cursor.
- **Implemented:** Adaptive toolbar placement near the selected region, including edge-of-screen handling.

### In-place annotation and completion

- **Implemented:** Versioned, serializable annotation scene model with undo and redo.
- **Implemented:** Line, smooth curved arrow, rectangle, ellipse, highlighter, freehand pencil, spotlight, counter, live source-backed blur and pixelation previews, blackout, and inline text tools.
- **Implemented:** Text placeholders select on first click, edit in place on the next click, commit before a subsequent placeholder is created, and expose a local delete action; Caveat is bundled for matching live and native exports.
- **Implemented:** User-configurable Individual and Group toolbar modes. Individual mode exposes every tool as its own toggle. Group mode uses ordered rows as enabled toolbar slots, treats the first tool as the group default, and supports drag/reorder, row add/remove, and a disabled-tool pool.
- **Implemented:** Hover-revealed grouped tools with consistently white submenu icons, animated primary indicators, an options-first contextual rail, separated quick-color rings, default color/stroke size, and a submenu that glides horizontally between toolbar slots while flipping/clamping at viewport edges.
- **Implemented:** Copy image, save image, scrolling capture, pin, and cancel completion actions.
- **Implemented:** Rust-side export composition that combines the immutable capture with the annotation scene.

### Pinning and preferences

- **Implemented:** Always-on-top pinned capture window with explicit routing, visible image content, resize, rotation, opacity, lock, bitmap copy, save, Escape/button close, and temporary-file cleanup.
- **Implemented:** Locally persisted appearance and capture preferences validated at the TypeScript boundary.
- **Implemented:** Light and dark dashboard themes, selectable accent, up to five quick colors plus custom colors, Individual/Group toolbar composition with WebView-safe pointer dragging and keyboard reordering, shortcut editing, overlay tint, startup behavior, and cursor settings.
- **Implemented:** Cursor choices use the exact capture cursor while hovering their Settings cards, including the selected size and accent color.

### Quality coverage

- **Implemented:** Frontend tests for settings, selection behavior, toolbar interaction, geometry, scene history, and scrolling-image stitching.
- **Implemented:** Rust tests covering capture/export helpers, platform contracts, settings, pins, scrolling stitching, and related native behavior.
- **Implemented:** Type checking, ESLint, production build, Rust formatting, Clippy, and Rust test commands are part of the required checkpoint verification.

## Partial implementations and Phase 1 gaps

- **Partial:** Capture now targets the display under the pointer and has geometry tests for negative origins and shared monitor edges. Physical mixed-DPI hardware validation, cross-monitor selection, and HDR/SDR handling remain.
- **Partial:** Blur and pixelation have interactive previews and export support, but secure-redaction golden-image coverage across scaling modes remains required before making a security guarantee.
- **Implemented:** Capture, capture-and-copy, and capture-and-save shortcuts are registered together, execute distinct native workflows, and atomically restore prior bindings after a conflict.
- **Implemented:** A persistent native default save directory is shared by toolbar Save, scrolling Save, pinned-image Save, and the direct Capture & save shortcut. The setting uses a native folder picker and survives dashboard/WebView teardown and application restarts.
- **Partial:** Pinning loads the application entry by native `pin-*` window label, renders/copies/saves bitmap data, and routes taskbar Close, in-window Close, and Escape through registry cleanup plus native force-destroy. It supports click-through with an always-available tray recovery action. Duplicate remains, and the corrected dynamic-window bootstrap/lifecycle require physical verification against development and packaged builds.
- **Implemented, hardware validation pending:** Scrolling can default to Automatic, Manual, or Always ask. The chooser appears beside the selected region only in Always ask mode and states that choosing a card starts immediately. Automatic capture uses shorter settling and coarse-to-fine sampled overlap matching instead of quadratic full-row comparison. The capture window is restored on worker failures and native diagnostic text is shown while retaining the stitched preview. Browser, code-editor, chat, native-list, animation, and unsupported-app acceptance matrices remain.
- **Partial:** Keyboard and semantic behavior exists for the current React controls; full screen-reader, high-contrast, reduced-motion, and capture-surface accessibility acceptance remains.
- **Partial benchmark:** A hidden development tray process measured 33.18 MB working set and 0% CPU over a five-second idle sample. Release install size, capture latency, and sustained annotation performance still require repeatable benchmarks.

## Intentionally outside the current runtime

- **Phase 2:** Combined image editor and visual asset Studio.
- **Phase 3:** Full local-library metadata, organization, tags, search, retention controls, and folder watching. The current dashboard is deliberately a lightweight on-demand view of the configured save directory, not this full library.
- **Phase 4:** Accounts, Cloudflare R2 storage, share URLs, view analytics, quotas, and billing.
- **Think Later:** OCR area capture, QR-code detection, color detection, recording, AI, and collaboration.

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
