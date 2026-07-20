# Decision Log

## 2026-07-19 - Microsoft Store packaging

- **Confirmed:** The Microsoft Store product uses the immutable Partner Center identity `JagatBandhu.SnapHub`, publisher `CN=8A6295E4-CFC2-4019-B7E3-C5FE35587B52`, package family `JagatBandhu.SnapHub_s98vdgsmvcg9t`, and publisher display name `JagatBandhu`; the visible product name remains `Snaphub`.
- **Confirmed:** The Store build is a manually assembled x64 Desktop Bridge MSIX with `packagedClassicApp`, `mediumIL`, and `runFullTrust`, preserving Win32 access required by capture, tray, global shortcuts, clipboard, scrolling input, and pin windows.
- **Confirmed:** Store artifacts are generated as `.msix` and `.msixupload`; the Store submission uses `.msixupload` and Microsoft supplies the certified production signature.
- **Provisional:** ARM64 packaging follows after the x64 packaged-runtime acceptance matrix passes.
- **Unresolved:** The existing Tauri autostart plugin must be physically validated across a Store update because MSIX installation paths are versioned. Use a manifest-declared startup task if registry-based startup does not survive updates.
- **Confirmed:** Windows release binaries use PE GUI subsystem `2`; debug binaries keep console output. Store packaging validates this header so an installed release cannot regress to opening a terminal window.

## 2026-07-19 - Product renamed to Snaphub

- **Confirmed:** The canonical product name and casing is `Snaphub`.
- **Confirmed:** Application titles, package/crate names, bundle identifier, save/session directories, generated filenames, settings symbols, tests, and documentation use the new name.
- **Confirmed:** Existing local frontend preferences and the persisted native save-directory preference migrate from the previous development name on first use.
- **Confirmed:** Windows 11 remains the only currently supported distribution target. macOS, Ubuntu, and Fedora remain provisional architectural targets until their native adapters and acceptance matrices are complete.
- **Rationale:** A complete rename prevents split identity across installer metadata, runtime UI, storage, logs, and agent-facing documentation while migration avoids unnecessary local configuration loss.

## 2026-07-19 - Configurable capture-toolbar composition

- **Confirmed:** Select is a fixed first-position recovery tool in every capture toolbar configuration.
- **Confirmed:** Individual mode gives every capture tool a separate enable toggle and renders enabled tools directly.
- **Confirmed:** Group mode treats each ordered row as one toolbar slot. Only tools assigned to a row are enabled; the first tool supplies the group icon and default click action; row order controls submenu order.
- **Confirmed:** Group Settings supports adding/removing rows and dragging tools within rows, across rows, or into the Available pool. Equivalent keyboard actions are required for accessibility.
- **Confirmed:** Contextual submenus lead with tool variants, then show colors, stroke size, font, or other properties after a separator. The submenu rail moves between slots with restrained horizontal motion.
- **Confirmed:** Contextual rails measure available viewport space, flip above near the bottom edge, and clamp horizontally. Tool configuration uses Pointer Events instead of browser-native HTML drag-and-drop so reordering remains reliable in WebView2.
- **Confirmed:** Starting a new text annotation synchronously commits any active inline edit before inserting the new placeholder.
- **Confirmed:** The configured high-contrast capture cursor remains active inside the selected frame and on capture controls; resize handles alone keep operating-system resize cursors.
- **Rationale:** Daily users can build compact, muscle-memory-oriented groups, while beginners can choose direct tools without learning hidden families. Keeping Select fixed prevents a custom layout from making the capture surface unrecoverable.

## 2026-07-19 - Writing tools, stable detection, and first-paint behavior

- **Confirmed:** Writing is one hover-revealed family containing highlighter, pencil, and inline text; Shapes contains only geometry and arrows.
- **Confirmed:** Caveat Variable is bundled locally under OFL-1.1 for capture text, including the Rust export path. Plus Jakarta Sans remains the interface family.
- **Confirmed:** Text is created and edited in place. Selection and deletion belong to the text object rather than a detached property input.
- **Confirmed:** The dashboard is native-hidden until its first styled React frame reports ready, eliminating unstyled startup flashes.
- **Rejected:** Per-pixel flat-region inference in the capture hover path. It produced unstable full-window target changes and pointer flicker, so Phase 1 keeps Windows UI Automation plus free-rectangle fallback.
- **Rationale:** Fast capture depends on a visually stable frozen screen. Reliable semantic targets are more useful than heuristic coverage that breaks pointer confidence.

## 2026-07-18 - Pin bootstrap and scrolling capture workflow

- **Confirmed:** Dynamic pinned windows load the normal application entry and route exclusively by their native `pin-*` label. Query strings must not be embedded in `WebviewUrl::App` paths.
- **Confirmed:** Every pin close request is intercepted once, removes its native registry/temp-file entry, and calls Tauri `destroy()` so taskbar Close, Escape, and the visible Close action cannot leave an orphaned pin window.
- **Confirmed:** Save is a one-click action targeting one persisted native folder. Toolbar, scrolling, pinned-image, and direct shortcut saves share it; Copy remains memory-only and is excluded from the dashboard.
- **Confirmed:** The Phase 1 dashboard may show an on-demand thumbnail view of the configured save folder without becoming the Phase 3 library. It has no database, polling loop, tags, search index, or capture-path dependency.
- **Confirmed:** Windows inner-control detection runs UI Automation away from the UI thread, selects the topmost underlying window by z-order, and surfaces native failures in the capture interface.
- **Superseded 2026-07-19:** The lightweight raster heuristic was removed after physical testing exposed unstable hover flicker; see the newer decision above.
- **Confirmed:** Scrolling capture has Automatic, Manual, and Always ask preferences. The chooser exists only for Always ask and is anchored beside the selection.
- **Confirmed:** Dashboard image cards open through Windows file associations and expose a restrained context menu. Cloud upload remains visibly disabled until real cloud configuration exists; Delete is confirmed and permanently removes only a path canonicalized inside the active save folder.
- **Confirmed:** Phase 1 scrolling capture uses an on-demand region worker with bounded automatic Windows wheel input, unchanged-frame stopping, sticky-prefix removal, retry/preview/completion, and a timed overlay-hidden manual fallback.
- **Rationale:** The native label keeps pin routing separate from filesystem data, while an on-demand worker preserves the idle resource budget and gives unsupported scroll containers a recoverable path.

## 2026-07-18 - Selection rotation removed from capture

- **Confirmed:** Phase 1 capture does not include rotating the active selection.
- **Confirmed:** Rotation remains appropriate for pinned captures and the later Studio.
- **Rationale:** Resize handles already provide capture-region cropping, while rotation adds complexity to the immediate capture flow without enough daily value.

## 2026-07-18 - Phase 1 native hardening direction

- **Confirmed:** Standard capture targets the display under the pointer; direct copy/save shortcuts capture that full display without opening the overlay.
- **Confirmed:** All three native shortcuts are registered atomically and conflicts restore the previous working bindings.
- **Confirmed:** Inner UI-region detection uses Windows UI Automation only when enabled and caches a bounded set of rectangles for the active capture session.
- **Confirmed:** Pin close and lock operations receive explicit least-privilege Tauri window capabilities; pins copy bitmap data rather than filesystem paths.
- **Provisional:** HDR output remains labeled conservatively until the Windows capture backend can detect and test advanced-color displays.

## 2026-07-18 - Phase 1 implementation checkpoint

- **Confirmed:** The current runtime is a Phase 1 vertical slice, not a completed Phase 1 release.
- **Confirmed:** Phase 1 Core Hardening is the recommended next milestone before starting Studio, Library, or Cloud work.
- **Confirmed:** Runtime status is tracked in `docs/current-status.md`; the feature roadmap describes intended scope rather than completion.
- **Rationale:** Keeping implementation evidence separate from product intent lets engineering, brand, and marketing agents communicate the product without overstating unfinished native behavior.

## 2026-07-18

### Confirmed

- Capture activation is fail-safe: preparation stays hidden, reveal is a separate final operation, and errors, `Esc`, or close requests force-hide the capture surface.
- Product name: Snaphub, subject to public brand clearance.
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
- The app dashboard is a separate, normal desktop window and is never loaded into the capture fast path. Its initial navigation is Dashboard, Cloud, Showcase, and Settings; Dashboard and Settings are populated in Phase 1, while Cloud and Showcase show explicit `Coming Soon...` placeholders.
- Phase 1 settings are local-only and cover capture palette, annotation defaults, accent color, toolbar slots, shortcuts, target detection, overlay tint, startup behavior, and capture cursor preferences.
- Startup launch is quiet: when enabled, Snaphub starts into the resident tray state rather than interrupting login with the dashboard.
- Dashboard appearance supports persistent light and dark modes. Both use the same compact, flat industrial hierarchy with small typography and restrained corner radii.
- The sidebar follows the selected appearance rather than remaining permanently dark. Dark mode uses layered neutral charcoal surfaces inspired by Codex, avoiding near-black page and panel backgrounds.
- Snaphub uses self-hosted Plus Jakarta Sans for interface typography and JetBrains Mono only for technical values such as shortcuts, dimensions, counters, and color codes.

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
