# Decision Log

## 2026-07-18 - Phase 1 implementation checkpoint

- **Confirmed:** The current runtime is a Phase 1 vertical slice, not a completed Phase 1 release.
- **Confirmed:** Phase 1 Core Hardening is the recommended next milestone before starting Studio, Library, or Cloud work.
- **Confirmed:** Runtime status is tracked in `docs/current-status.md`; the feature roadmap describes intended scope rather than completion.
- **Rationale:** Keeping implementation evidence separate from product intent lets engineering, brand, and marketing agents communicate the product without overstating unfinished native behavior.

## 2026-07-18

### Confirmed

- Capture activation is fail-safe: preparation stays hidden, reveal is a separate final operation, and errors, `Esc`, or close requests force-hide the capture surface.
- Product name: ShotHub, subject to public brand clearance.
- Primary audience: builders and small teams.
- Primary workflow: shortcut, select, edit in place, complete, return.
- Phase 1 uses contextual editing around the selected frozen-screen region rather than opening an editor.
- Default quick-tool layout uses adaptive edge bars and supports customizable profiles.
- Window and rectangular UI-region detection are part of selection.
- Crosshair, dimensions, magnifier, snapping, and related aids are independently toggleable.
- Phase 1 quick tools include geometry, arrows/shapes, highlighter, spotlight, counter, blur, secure pixelation, blackout, text, undo, and redo.
- Scrolling capture is required for the Phase 1 launch.
- The full image editor and visual asset studio are combined in Phase 2.
- Local library is Phase 3; cloud sharing is Phase 4.
- OCR area capture, QR detection, and color detection are Think Later.
- Tauri 2, Rust, React, strict TypeScript, Vite, and Tailwind CSS are the implementation stack.
- Windows is the reference implementation; macOS, Ubuntu, and Fedora remain targets.
- Canonical project documentation is Markdown optimized for agent handoff.
- The app dashboard is a separate, normal desktop window and is never loaded into the capture fast path. Its initial navigation is Dashboard, Cloud, Showcase, and Settings; only Settings is populated in Phase 1.
- Phase 1 settings are local-only and cover capture palette, annotation defaults, accent color, toolbar slots, shortcuts, target detection, overlay tint, startup behavior, and capture cursor preferences.
- Startup launch is quiet: when enabled, ShotHub starts into the resident tray state rather than interrupting login with the dashboard.
- Dashboard appearance supports persistent light and dark modes. Both use the same compact, flat industrial hierarchy with small typography and restrained corner radii.
- The sidebar follows the selected appearance rather than remaining permanently dark. Dark mode uses layered neutral charcoal surfaces inspired by Codex, avoiding near-black page and panel backgrounds.
- ShotHub uses self-hosted Plus Jakarta Sans for interface typography and JetBrains Mono only for technical values such as shortcuts, dimensions, counters, and color codes.

### Provisional

- Free local tier, USD 29 Desktop Pro, and approximately USD 5/month Cloud Pro.
- One year of updates with perpetual use of the last eligible desktop version.
- 25 GB included cloud storage.
- Cloudflare R2 for private object storage with Postgres metadata.
- Performance targets remain subject to measurement on declared reference hardware.

### Rejected for Phase 1

- ShareX-like menu breadth and workflow automation.
- Conventional main-window editor in the capture fast path.
- Full slide-deck editor.
- Local library, account requirement, cloud dependency, and mandatory telemetry.
- Shipping every platform adapter in parallel before validating the shared core.

### Unresolved

- Exact free/paid feature boundary and licensing provider.
- Final shortcut defaults and OS-level Print Screen onboarding.
- Final font licenses and brand identity.
- Windows Store versus direct installer launch order.
- Supported Linux distribution versions and compositor test matrix.
