# Decision Log

## 2026-09-26 - Screen Draw defaults to Select

- **Confirmed:** Screen Draw opens with the Select tool active, returns to Select after Clear, and recovers to Select after a snapshot-tool failure. This supersedes the 2026-07-25 Presentation Pointer default below; the pointer trail remains one click away for gesture-first presenting.
- **Confirmed:** Select uses the normal arrow cursor and edits committed drawings in place: rectangle, ellipse and blur move, resize from 8 handles and delete; arrows move, drag either endpoint and delete; text moves, rescales 12–120 from the bottom-right handle and deletes; pencil moves and deletes. Delete/Backspace, arrow-key nudge (1px, 10 with Shift) and a clamped Delete button apply; Escape deselects first and only closes when nothing is selected. Clicking empty space deselects; the overlay keeps capturing input.
- **Confirmed:** Select's shortcut is a fixed `V`, not configurable in Settings; digits stay configurable for the other tools and `S` stays Save screen.
- **Think Later:** Click-through to the desktop from empty space, scaling pencil strokes, and editing the words of existing text.
- **Rationale:** Presenters spend Screen Draw time adjusting what they already drew; a default that can move, resize and delete removes the erase-and-redraw loop without changing any drawing tool.

## 2026-09-26 - Monitor-sized overlays avoid full-screen treatment

- **Confirmed:** Windows treats a borderless overlay whose physical rectangle exactly matches a monitor as a full-screen application; on the user's 120 Hz display this capped the capture cursor at 60 Hz. The `a49f689` release build became smooth when its height was extended one physical pixel, with the frozen snapshot still aligned.
- **Confirmed:** Add one physical pixel at the bottom when that edge is free; if another monitor touches the bottom, use the right edge when free; when both edges touch another monitor, keep the exact size.
- **Rejected:** Re-enabling the undecorated shadow, because Windows insets the client area and shifts the frozen image; extending the top or left edge, because that changes the window origin and coordinate alignment.
- **Known limitation:** If adjacent monitors occupy both the bottom and right edges, the overlay remains exact-size and can still receive full-screen treatment.
- **Rationale:** The extra pixel keeps the original monitor origin and leaves the snapshot and selection content at the exact display bounds while avoiding Windows' exact-monitor-size classification where an edge is available.

## 2026-09-26 - Capture exits hide instantly and reveal in 90 ms

- **Confirmed:** Capture cancellation hides the surface before native session cleanup, avoiding a fade and keeping deletion or in-flight output work off the visible path.
- **Confirmed:** The 180 ms reveal is shortened to 90 ms, preserving the fade that masks a possible black WebView2 first frame while the frozen snapshot is decoded and painted.
- **Think Later:** The first Windows Graphics Capture capture after launch measured about 218 ms; consider GDI or pre-warming only after the new debug timings are reviewed.
- **Rejected:** Changing the capture backend or pre-warming it now; the first-capture measurement is isolated and needs repeatable application timings.

## 2026-09-26 - Screen Draw saves the composited monitor

- **Confirmed:** Save screen captures the active Screen Draw monitor with its committed annotations, background, blur, and spotlight visible. The dock, text editor, statuses, and transient laser layer are hidden for two animation frames before capture; the session and drawings remain open afterwards.
- **Confirmed:** The native command only accepts the `onscreen` window, captures the active display center in physical pixels through the shared quick-save service, and emits the existing saved-capture event.
- **Rejected:** Rendering every Screen Draw object again in Rust over a clean capture; a second renderer for ten object types could drift from the visible screen.
- **Provisional:** xcap/WGC includes the transparent Screen Draw WebView in the monitor capture. Manual check D-M1 verifies this on Windows.
- **Rationale:** Capturing the composed display keeps the PNG aligned with what the presenter saw and reuses the established collision-safe save path.

## 2026-09-25 - Monitor-sized overlays disable the undecorated shadow

- **Confirmed:** Tauri defaults `shadow` to true; on Windows an undecorated shadow insets the WebView client area, offsetting and squeezing a monitor-sized frozen snapshot and drifting export coordinates.
- **Confirmed:** Screen Draw's frozen-frame `onscreen` window is also monitor-sized and must disable the shadow to keep its background, blur, and magnifier aligned.
- **Rejected:** replacing the frozen snapshot with a live overlay; the freeze is the confirmed capture model.

## 2026-09-25 - Selected-region Copy & Save owns one raster and a save-only retry

- **Confirmed:** Copy & Save is available only in the standard selected-region overlay. It renders the immutable capture and current scene once, copies that `RgbaImage` first, then atomically saves the same raster as PNG in the configured folder.
- **Confirmed:** The native session owns a per-session in-flight state and a transient save-pending raster. A post-copy file failure cannot roll back the clipboard, so the UI reports that exact partial outcome and retries only the file write from the retained raster.
- **Confirmed:** A committed PNG emits `snaphub://capture-saved` exactly once after rename. A post-commit hide or cleanup failure is returned as a warning on the completed result and cannot expose a duplicate-saving retry.
- **Confirmed:** Frontend and native synchronous guards reject pointer/click duplication, repeated shortcuts, and concurrent IPC. Escape serializes at the native boundary, while stale renderer responses are ignored by session generation.
- **Provisional:** Physical mixed-DPI, screen-reader, real clipboard, unwritable-folder, and packaged-window acceptance remain manual validation; deterministic service and component tests cover the same state and ordering contracts without OS side effects.

## 2026-07-27 - Studio ships as a Canvas2D compositor, not a second export path

- **Confirmed:** `src/domain/scene.ts` adds a structured `BackgroundPaint` form (solid/linear/radial/layers/image) alongside Showcase's CSS-string `backgroundValue`, so the same background can be rendered on the DOM (Showcase) and on a canvas (Studio) without a second implementation drifting from the first. `paintToCss` round-trips every built-in preset byte-for-byte, verified against `showcase.test.ts`'s existing string assertions.
- **Confirmed:** `src/lib/videoCompositor.ts`'s `paintFrame` is the *only* renderer for video: the live preview calls it every animation frame and the exporter calls it once per encoded frame. This is deliberate — a second renderer for export is exactly how "the export doesn't match the preview" bugs happen.
- **Confirmed:** MP4 export renders through `VideoEncoder` (WebCodecs) into `mp4-muxer` (~13 KB, the only new dependency), by seeking the source `<video>` element frame-by-frame rather than playing it in real time. A long export is bounded by encode speed, not the recording's own duration, and no frame can be skipped because the machine was briefly busy.
- **Confirmed:** GIF export uses a hand-written ~180-line GIF89a/LZW writer rather than a dependency, capped at 12 fps and 640px wide. A screen recording exported at full rate and resolution produces a file far too large to be the shareable artefact anyone asking for a GIF actually wants.
- **Confirmed:** Zoom-on-click keyframes hold the zoom and pan between two click clusters inside 1.5 s of each other, rather than pulling out and back in. Popping in and out between nearby actions was identified as the most amateur-looking artefact an automatic zoom can produce.
- **Confirmed:** Recording pause/resume omits paused time from the output entirely — the pacer keeps its schedule but writes nothing — rather than freezing a duplicated frame into the file.
- **Confirmed:** The webcam preview window is excluded from screen capture the same way the recorder dock is. Without that, the camera would appear twice in an export: once live in the screen recording, once again as its own track.
- **Measured:** Release executable grew from 10.48 MB to 10.51 MB adding pause/resume and the camera window; the full recorder-to-Studio feature set now costs 0.26 MB total against the 10.25 MB post-M0 baseline.
- **Unresolved:** End-to-end MP4/GIF export was verified through the GIF byte format (signature, trailer, NETSCAPE2.0 loop block) and the compositor's draw logic (background-before-media ordering, cursor/camera gating), both runnable in the existing jsdom test suite. Encoding a real recording through `VideoEncoder` inside the packaged app's WebView2 has not been done — the sandboxed browser used for earlier spikes cannot dynamically import arbitrary app modules (confirmed: even already-shipped, previously-working modules fail identically), so this needs a manual pass in the built app.
- **Rationale:** Every one of these is a case where the visually obvious approach (a second renderer, a real-time GIF, popping the zoom, freezing a duplicate frame, letting the camera preview get recorded) produces something worse than the alternative, so each is recorded rather than left implicit in the code.

## 2026-07-27 - Recording lands as capture, encode, cursor, and audio

- **Confirmed:** Capture uses a Windows Graphics Capture frame pool created with `CreateFreeThreaded`. The plain constructor requires a `DispatcherQueue` on the calling thread, which a worker thread does not have, and that mismatch is the usual way this integration fails.
- **Confirmed:** A fixed-rate pacer drives the encoder rather than frame arrival. The frame pool only delivers when the screen changes, so an arrival-driven loop produces a file with no frames in it whenever the desktop is still. Repeated frames are counted and reported as a health signal, not an error.
- **Confirmed:** The encoder declares `MFVideoFormat_ARGB32` input to match the BGRA capture texture and lets the pipeline insert a GPU video processor for the conversion to NV12. Declaring NV12 directly caused the sink writer to reject every sample.
- **Confirmed:** A DXGI-backed media buffer reports a current length of zero until it is set from `IMF2DBuffer::GetContiguousLength`, and the sink writer rejects a zero-length sample. This is set on every frame.
- **Confirmed:** Cursor positions are polled at 250 Hz with `GetAsyncKeyState` for button transitions. `SetWindowsHookEx(WH_MOUSE_LL)` is rejected: it runs inside every process's input path and Windows silently unhooks it on timeout, which is the usual cause of a recorder making the pointer feel laggy. No real click is short enough to be missed at 250 Hz.
- **Confirmed:** The cursor track is recorded on every recording regardless of which editor features are enabled, because it cannot be reconstructed afterwards. The hardware cursor is excluded from the video for the same reason.
- **Confirmed:** System audio and microphone are written as separate AAC sidecars rather than extra tracks in the MP4. Most players surface only the first audio track, and the editor has to balance the two independently. Loopback silence is zero-filled from the elapsed clock, because a loopback endpoint delivers no packets at all while the machine is quiet and the track would otherwise end short and drift.
- **Measured:** 121 frames encoded with 0 dropped at 2560x1440; a 640x480 crop honoured exactly; 1157 cursor samples over five seconds; 82 KB of AAC for five seconds of system audio; `WDA_EXCLUDEFROMCAPTURE` accepted on a live window.
- **Measured:** Release executable grew from 10.25 MB to 10.48 MB. The entire recorder costs 0.23 MB, against the 12-40 MB a bundled encoder would have added.
- **Unresolved:** The dock's absence from a real recording has been verified only at the API level. A frame-by-frame check against a recording made from the shipped application is still outstanding.
- **Rationale:** Every one of these is a case where the obvious implementation silently produces a broken file rather than an error, so each is recorded as a decision rather than left as a comment.

## 2026-07-27 - Cloud is removed and the shell makes room for recording

- **Confirmed:** The dashboard navigation is Dashboard, Record, Showcase, Studio, and Settings. Showcase stays image-only; Studio is the video editor, so video-specific controls have somewhere to live without diluting the image panels.
- **Confirmed:** Record and Studio render the shared placeholder section until their milestones land.
- **Superseded:** The 2026-07-22 navigation decision that fixed the sections as Dashboard, Cloud, Showcase, and Settings with Cloud held at `Coming Soon...`.
- **Rejected:** Keeping an inert Cloud entry as a roadmap signal. It was a label and one permanently disabled context action with no implementation behind it, and it occupied the slot recording needs now.
- **Rationale:** Cloud sharing remains a Phase 4 intention, but advertising it in the shell for a release it cannot appear in costs a navigation slot and sets an expectation the build does not meet.

## 2026-07-27 - Recording encodes through OS codecs, not a bundled encoder

- **Confirmed:** Capture runs in Rust through Windows Graphics Capture into a Media Foundation `IMFSinkWriter` with `MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS`, keeping frames on the GPU from capture to encode with no CPU-side copy.
- **Confirmed:** Editing and export run in the frontend through WebCodecs and a Canvas2D compositor, so preview and export share one `paintFrame` implementation and cannot diverge.
- **Confirmed:** Recording sits behind a `ScreenRecordingBackend` trait alongside the existing platform traits, so a non-Windows backend can be added without touching the editor or the UI.
- **Rejected:** Bundling FFmpeg. Its 12-40 MB lands against the same installed-size gate that `technical-architecture.md` invokes when it requires colour and region work "without adding OpenCV-sized resident or package overhead", and x264's GPL terms attach a licence audit to a paid Store product. The OS already ships the codecs.
- **Rejected:** MediaRecorder to WebM as a primary format. It does not open in Windows Photos, PowerPoint, or Premiere without transcoding, and offers no keyframe control or frame-accurate seeking.
- **Confirmed:** Measured 2026-07-27 in a Chromium 148 pane: H.264 High encodes at 113 fps at 1080p, and the Canvas2D compositor exceeds 120 fps at both 1080p and 4K. The projected 1.5 MB of added install size proved pessimistic; the shipped recorder cost 0.23 MB.
- **Unresolved:** The same WebCodecs measurement has not yet been repeated inside the app's WebView2 runtime. If `VideoEncoder` is unavailable there, export falls back to shipping composited frames over IPC into the same sink writer used for recording.
- **Rationale:** The choice that keeps the install small is also the fastest one, because the hardware encoder and the capture surface are already in the operating system; bundling an encoder would pay tens of megabytes to be slower.

## 2026-07-27 - Release builds are optimised for size

- **Confirmed:** `[profile.release]` sets `lto = "fat"`, `codegen-units = 1`, `panic = "abort"`, and `strip = "symbols"`. `imageproc` drops its default `fft` and `rayon` features; only `drawing` and `rect` are used.
- **Confirmed:** The release executable falls from 17.70 MB to 10.25 MB, and `rustfft` with its `nalgebra`/`num-complex` weight leaves the graph.
- **Superseded in part:** The 2026-07-18 checkpoint reported a 30.36 MB executable without recording that this was a debug build; it was subsequently read as the release size. `performance-quality.md` now separates the two.
- **Confirmed:** `image`'s `default-features = false` is still defeated by unification, but the remaining cause is `xcap`'s `image` feature, which cannot be dropped without losing `Monitor::capture_image`.
- **Rationale:** The recorder must be designed against a truthful size baseline, and reclaiming 7.45 MB before adding a feature is cheaper than arguing about codecs afterwards.

## 2026-07-25 - Presentation laser follows press-and-hold semantics

- **Confirmed:** The complete presentation-laser trail remains visible while the primary pointer button is held and clears immediately as one transient layer on release or cancellation.
- **Confirmed:** Laser samples never enter persistent drawing history and do not use per-point or expiry timers.
- **Rationale:** A presenter expects the laser gesture to remain readable for the duration of the gesture; time-decaying segments made deliberate pointing disappear before the gesture was complete.

## 2026-07-25 - Screen Draw text reliability and pointer performance

- **Confirmed:** Selecting Text visibly arms placement with a “Click anywhere to type” status. The next canvas click opens a clamped, focused in-place editor; its pointer and focus events cannot re-enter the drawing surface, and each value commits at most once.
- **Confirmed:** Raw pointer movement is coalesced to one cursor or draft render per animation frame. Near-identical presentation-pointer samples are discarded, and static annotations plus the dock are memoized away from transient cursor updates. Spotlight and Magnifier move through compositor transforms; pointer glow uses layered strokes instead of SVG filters, and the live dock avoids backdrop filtering. The original cleanup-timer decision is superseded by the press-and-hold semantics above.
- **Rationale:** Screen Draw must make its two-step text interaction discoverable and must not reconcile the full scene for every high-frequency pointer event.

## 2026-07-25 - Screen Draw background mode

- **Confirmed:** Screen Draw defaults to a live transparent desktop so animations, video, progress, and application updates continue beneath annotations.
- **Confirmed:** Settings can switch Screen Draw to a frozen frame for teaching or markup that requires a stable background.
- **Confirmed:** Live mode keeps snapshot work out of entry. Magnifier and Blur acquire one snapshot only when first selected; frozen mode captures and preloads one frame before the overlay becomes visible and reuses it for those tools.
- **Confirmed:** If frozen-frame acquisition fails, Screen Draw recovers to the live desktop and reports the fallback instead of leaving an opaque or unrecoverable surface.
- **Rationale:** Presentations usually need live context, while careful annotation sometimes needs stability. Making the modes explicit preserves the fast default and gives both workflows predictable semantics.

## 2026-07-25 - Hugeicons is the CapKit interface icon system

- **Confirmed:** CapKit uses the free Hugeicons Stroke Rounded pack through `@hugeicons/react` and `@hugeicons/core-free-icons`; Lucide is no longer a runtime dependency.
- **Confirmed:** Product controls resolve icons through one typed CapKit adapter with a consistent default stroke and current-color behavior.
- **Confirmed:** Distinct actions use distinct symbols. Blur, pixelate, blackout, spotlight, curved arrow, scrolling capture, magnifier, presentation pointer, selection, and pinned-window click-through may not reuse an ambiguous generic icon.
- **Rationale:** The larger free catalog gives compact capture and presentation toolbars more precise semantics while the central adapter preserves visual consistency and keeps icon-library details out of feature components.

## 2026-07-25 - Presentation Pointer is the Screen Draw default

- **Confirmed:** Screen Draw opens with Presentation Pointer selected and returns to it after Clear or recovery from a snapshot-tool failure.
- **Rationale:** A temporary pointer is the safest presentation-first default because the initial gesture disappears automatically instead of leaving an accidental permanent annotation.

## 2026-07-25 - Screen Draw toggle latency and continuity

- **Confirmed:** The Screen Draw window is created on demand and revealed without first capturing or encoding the monitor.
- **Confirmed:** Magnifier and Blur lazily acquire their shared snapshot on first use; other tools have no capture dependency.
- **Confirmed:** Settings offers optional annotation persistence across toggle cycles. Persisted scenes are runtime-validated before rendering.
- **Confirmed:** Undo and Redo execute on their first click, and a shared moving highlight provides continuity while hovering between tools.
- **Rationale:** Presentation drawing is primarily a live overlay. Making every invocation pay for snapshot-only tools harmed its defining instant-toggle behavior.

## 2026-07-25 - Presentation appearance belongs in Settings

- **Confirmed:** The on-screen dock shows tools and history actions only; drawing color and size controls do not appear during presentation.
- **Confirmed:** Settings persists one drawing color, stroke width, and independent spotlight radius for every on-screen session.
- **Superseded:** The dock remains larger and lifted above the bottom system edge, but the original roughly 360 ms trail decay is replaced by the press-and-hold semantics recorded above.
- **Rationale:** Presenters need a stable, glanceable tool dock. Appearance is deliberate setup rather than a repeated in-session decision, while spotlight radius has different semantics from annotation stroke width.

## 2026-07-25 - On-screen presentation mode

- **Confirmed:** On-screen drawing is a separate on-demand overlay, not a capture-editor state and not a resident dashboard feature.
- **Confirmed:** One configurable global shortcut toggles the mode. `Escape` remains a mandatory recovery path.
- **Confirmed:** The toolbar is a compact bottom-center dock; unique optional number keys select tools and are shown on their icons.
- **Superseded in part:** Spotlight keeps the desktop visible under a dim veil and Clear remains undoable. Automatic pointer decay is replaced by release-triggered clearing as recorded above.
- **Confirmed:** Magnifier and blur reuse one entry snapshot instead of continuously recapturing or polling the desktop. The overlay WebView and temporary snapshot are destroyed on exit.
- **Rationale:** This provides a useful teaching and presentation workflow without adding a continuous screen-reading worker or weight to the resident tray process and without changing the screenshot fast path.

## 2026-07-19 - Microsoft Store packaging

- **Confirmed:** The Microsoft Store product uses the immutable Partner Center identity `JagatBandhu.SnapHub`, publisher `CN=8A6295E4-CFC2-4019-B7E3-C5FE35587B52`, package family `JagatBandhu.SnapHub_s98vdgsmvcg9t`, and publisher display name `JagatBandhu`; the visible product name is now `CapKit`.
- **Confirmed:** The Store build is a manually assembled x64 Desktop Bridge MSIX with `packagedClassicApp`, `mediumIL`, and `runFullTrust`, preserving Win32 access required by capture, tray, global shortcuts, clipboard, scrolling input, and pin windows.
- **Confirmed:** Store artifacts are generated as `.msix` and `.msixupload`; the Store submission uses `.msixupload` and Microsoft supplies the certified production signature.
- **Provisional:** ARM64 packaging follows after the x64 packaged-runtime acceptance matrix passes.
- **Unresolved:** The existing Tauri autostart plugin must be physically validated across a Store update because MSIX installation paths are versioned. Use a manifest-declared startup task if registry-based startup does not survive updates.
- **Confirmed:** Windows release binaries use PE GUI subsystem `2`; debug binaries keep console output. Store packaging validates this header so an installed release cannot regress to opening a terminal window.

## 2026-07-23 - Product renamed to CapKit

- **Confirmed:** The visible product name and casing is now `CapKit`; the tagline is “The lightweight desktop toolkit to capture, record, and showcase.”
- **Confirmed:** User-facing titles, save folders, generated filenames, installer labels, and documentation use CapKit.
- **Confirmed:** The immutable Microsoft Store identity and internal migration/protocol identifiers remain unchanged to preserve installed-app continuity.
- **Rationale:** CapKit communicates the broader capture, recording, and showcase toolkit while avoiding a split identity between the product UI and its launch messaging.

## 2026-07-23 - Showcase first slice

- **Confirmed:** Showcase opens as an on-demand three-column scene builder: saved captures on the left, a live composition stage in the center, and compact inspector tabs on the right.
- **Confirmed:** The first slice supports solid/gradient/wallpaper/custom backgrounds, padding, corner radius, browser/glass/mobile/laptop/desktop frames, zoom, X/Y movement, tilt, depth, shadow, clean/soft/mono/grain effects, title/note layers, and local preset save/reset.
- **Provisional:** Raster export, non-destructive scene persistence, reusable mockup assets, and richer annotation layers will follow in the Studio implementation.
- **Rationale:** This gives people a useful visual enhancement workflow immediately without loading the full editor into the resident capture path or pretending that a CSS preview is already a final export pipeline.

## 2026-07-19 - Product renamed during early development

- **Superseded:** The temporary development name was `Snaphub`; CapKit is now the visible product name.
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
- Product name: CapKit, subject to public brand clearance.
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
- The app dashboard is a separate, normal desktop window and is never loaded into the capture fast path. Its initial navigation is Dashboard, Cloud, Showcase, and Settings; Dashboard and Settings are populated in Phase 1, Cloud remains `Coming Soon...`, and Showcase now opens the first Studio scene builder.
- Phase 1 settings are local-only and cover capture palette, annotation defaults, accent color, toolbar slots, shortcuts, target detection, overlay tint, startup behavior, and capture cursor preferences.
- Startup launch is quiet: when enabled, CapKit starts into the resident tray state rather than interrupting login with the dashboard.
- Dashboard appearance supports persistent light and dark modes. Both use the same compact, flat industrial hierarchy with small typography and restrained corner radii.
- The sidebar follows the selected appearance rather than remaining permanently dark. Dark mode uses layered neutral charcoal surfaces inspired by Codex, avoiding near-black page and panel backgrounds.
- CapKit uses self-hosted Plus Jakarta Sans for interface typography and JetBrains Mono only for technical values such as shortcuts, dimensions, counters, and color codes.

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
