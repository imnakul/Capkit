# Current Implementation Status

**Checkpoint date:** 2026-07-18

**Overall state:** Phase 1 vertical slice in progress

This document records what exists in the runtime today. The roadmap remains the source of truth for intended scope; this page prevents planned features, settings, or extension interfaces from being mistaken for completed behavior.

## Working reference slice

### Application shell and lifecycle

- **Implemented:** Tauri 2, Rust, React, strict TypeScript, Vite, Tailwind CSS, ESLint, Vitest, and pnpm workspace foundation.
- **Implemented:** Lightweight native system tray with capture, dashboard, and quit actions.
- **Implemented:** Capture/editor windows are created on demand and torn down after completion or cancellation.
- **Implemented:** Escape cancels capture and returns control to the normal desktop.
- **Implemented:** A local settings dashboard with Dashboard, Cloud, Showcase, and Settings navigation. Only Settings currently contains a product surface.
- **Implemented:** Self-hosted Plus Jakarta Sans for interface text and JetBrains Mono for shortcuts, dimensions, color values, and technical data.

### Capture and selection

- **Implemented:** Configurable primary global capture shortcut with conflict feedback.
- **Implemented:** Frozen-screen capture surface for the primary Windows display.
- **Implemented:** Smooth free-rectangle selection, selection resize handles, and click-drag movement after selection.
- **Implemented:** Window hover highlighting and click selection.
- **Implemented:** Toggleable crosshair, dimensions, magnifier, snapping, window detection, overlay tint, and custom capture cursor preferences.
- **Implemented:** Adaptive toolbar placement near the selected region, including edge-of-screen handling.

### In-place annotation and completion

- **Implemented:** Versioned, serializable annotation scene model with undo and redo.
- **Implemented:** Line, arrow, curved arrow, rectangle, ellipse, highlighter, spotlight, counter, blur preview, pixelation preview, blackout, and text tools.
- **Implemented:** Contextual quick colors, default color, stroke size, and grouped tool choices.
- **Implemented:** Copy image, save image, basic pin, and cancel completion actions.
- **Implemented:** Rust-side export composition that combines the immutable capture with the annotation scene.

### Pinning and preferences

- **Implemented:** Always-on-top pinned capture window with visible image content, resize, rotation, opacity, lock, and close controls.
- **Implemented:** Locally persisted appearance and capture preferences validated at the TypeScript boundary.
- **Implemented:** Light and dark dashboard themes, selectable accent, up to five quick colors plus custom colors, toolbar slot visibility/defaults, shortcut editing, overlay tint, startup behavior, and cursor settings.

### Quality coverage

- **Implemented:** Frontend tests for settings, selection behavior, toolbar interaction, geometry, scene history, and scrolling-image stitching.
- **Implemented:** Rust tests covering capture/export helpers, platform contracts, settings, pins, scrolling stitching, and related native behavior.
- **Implemented:** Type checking, ESLint, production build, Rust formatting, Clippy, and Rust test commands are part of the required checkpoint verification.

## Partial implementations and Phase 1 gaps

- **Partial:** Capture currently targets the primary display. Selecting the display under the cursor, full multi-monitor coverage, mixed-DPI coordinate validation, and HDR/SDR handling remain.
- **Partial:** Window detection works; optional inner UI-region detection is represented in settings and architecture but does not yet have the Windows UI Automation implementation.
- **Partial:** The rotate tool exists in the tool model and pinned-window controls, but selection-level rotate editing is not complete.
- **Partial:** Blur and pixelation have interactive previews and export support, but secure-redaction golden-image coverage across scaling modes remains required before making a security guarantee.
- **Partial:** Capture-and-copy and capture-and-save shortcuts can be configured in Settings, but native registration and direct completion behavior remain to be connected.
- **Partial:** Pinning lacks finished image-copy, save, duplicate, and click-through actions. Its current copy control copies the backing path rather than bitmap data.
- **Partial:** The scrolling overlap/stitching engine and tests exist, but automatic scrolling, manual fallback capture, sticky-region handling UI, retry, and unsupported-application messaging are not end-to-end.
- **Partial:** Keyboard and semantic behavior exists for the current React controls; full screen-reader, high-contrast, reduced-motion, and capture-surface accessibility acceptance remains.
- **Unverified budget:** Idle RAM/CPU, capture latency, installed size, and sustained annotation performance have not yet been benchmarked against the documented budgets.

## Intentionally outside the current runtime

- **Phase 2:** Combined image editor and visual asset Studio.
- **Phase 3:** Local capture library, organization, and search.
- **Phase 4:** Accounts, Cloudflare R2 storage, share URLs, view analytics, quotas, and billing.
- **Think Later:** OCR area capture, QR-code detection, color detection, recording, AI, and collaboration.

## Recommended next milestone

Complete **Phase 1 Core Hardening** before expanding into Studio or Cloud:

1. Capture the monitor under the pointer and validate multi-monitor, mixed-DPI, and HDR/SDR behavior.
2. Register all three native shortcut workflows and make shortcut conflicts recoverable.
3. Complete secure redaction exports, rotate, and annotation golden-image coverage.
4. Finish pin copy/save/click-through behavior and scrolling capture end to end.
5. Profile cold trigger latency, pointer/drawing responsiveness, idle RAM/CPU, and teardown behavior.

## Related specifications

- [Feature roadmap](feature-roadmap.md)
- [Capture UX specification](capture-ux-spec.md)
- [Technical architecture](technical-architecture.md)
- [Performance and quality budgets](performance-quality.md)
- [Decision log](decision-log.md)
