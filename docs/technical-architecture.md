# Technical Architecture

## Stack

- Tauri 2 desktop host
- Rust resident core and platform integration
- React, strict TypeScript, Vite, and Tailwind CSS capture surface
- Konva-backed typed annotation scene
- Zod validation at TypeScript IPC boundaries and Serde types in Rust
- pnpm workspace and Cargo crate

The OS webview is created for active UI and destroyed or hidden out of the resident path after completion. No bundled Chromium runtime is planned.

## Runtime responsibilities

### Resident core

- Tray lifecycle
- Global shortcut registration
- Single-instance enforcement
- Settings loading
- Capture-session orchestration
- Structured logging and crash-safe cleanup

### On-demand workers

- Display/window capture
- Scrolling capture and stitching
- Raster export and secure redaction
- Pinned windows
- On-screen presentation overlay with lazy, first-use magnifier/blur snapshot; screen capture and image encoding stay outside the common toggle path
- Later OCR, library indexing, and upload

## State machine

`Idle -> Triggered -> SnapshotReady -> Selecting -> Editing -> Exporting -> Completed | Cancelled | Failed`

Transitions are explicit and validated. Terminal states release capture windows, image buffers, hooks, and temporary files before returning to `Idle`.

## Platform interfaces

- `CaptureBackend`: displays, snapshots, windows, and capture capabilities
- `GlobalShortcutBackend`: register, unregister, update, and conflict details
- `TargetDetectionBackend`: cached windows and optional semantic UI Automation regions at a point; pixel-color inference is excluded from the interactive hover path
- `ClipboardBackend`: image output and compatibility reporting
- `PinnedWindowBackend`: create and control pinned image windows
- `PermissionBackend`: inspect, request, and open platform permission settings
- `ScrollingCaptureBackend`: automatic/manual input and frame acquisition
- `ScreenRecordingBackend`: recordable sources, capability probe, and session start; sessions expose pause, resume, stats, and stop
- `AudioDeviceBackend`: capture-device enumeration and the default loopback endpoint
- `PointerTrackBackend`: cursor and click sampling for the duration of a recording
- `WindowCaptureExclusionBackend`: mark a window invisible to screen capture

Recording backends are registered as their own service rather than extending the capture backend, so the screenshot path and its tests stay unaware of recording.

Windows uses Windows Graphics Capture or DXGI as appropriate, Win32 shortcut/window APIs, and optional UI Automation. macOS will use ScreenCaptureKit. Linux will use XDG portals/PipeWire on Wayland and an X11 fallback.

The Windows scrolling worker is on-demand: it hides the capture WebView, sends bounded wheel input at the selected region, samples only that region, detects unchanged frames, removes a repeated sticky prefix from later frames, and performs overlap stitching off the UI thread. Manual fallback uses the same immutable frame/stitch pipeline but gives the user a short overlay-hidden interval to move the underlying scroll container. Temporary stitched previews remain within the scoped CapKit session directory and are runtime-validated before completion.

The on-screen presentation mode is a distinct `onscreen` Tauri window with a small native lifecycle state (`Idle`, `Preparing`, or `Active`). The shared global-shortcut registry toggles it. Live desktop is the default and reveals the transparent WebView without capture work; magnifier and blur lazily request and reuse one raster when first invoked. The optional frozen-frame mode captures and preloads one validated monitor snapshot while the window remains hidden, then renders that frame beneath the vector annotations. Spotlight and the press-and-hold presentation laser remain transient WebView layers in both modes; laser samples never enter scene history and are discarded together on pointer release/cancel. Exit by the same shortcut, `Escape`, or a native close request destroys the window, cancels the temporary capture session, and deletes any snapshot.

The recorder is a distinct `recorder` Tauri window carrying both its setup phase and its in-recording dock, so source and device state never cross a window boundary. It is transparent, always on top, and excluded from screen capture through `SetWindowDisplayAffinity` with `WDA_EXCLUDEFROMCAPTURE`, applied next to its reveal because the affinity does not survive window recreation; if the call fails the dock hides for the duration rather than being recorded silently. A separate fullscreen `record-region` window per display selects an area or window over live content, which the frozen-snapshot `capture` window cannot do. Capture itself acquires a whole display through a Windows Graphics Capture frame pool and applies the chosen region as a crop, because the sink writer cannot change input media type mid-stream and a padded or zoomed-out composition needs pixels from outside the target window. A fixed-rate pacer resubmits the most recent frame when the screen is static, since the frame pool only delivers on change. The first encoded frame's timestamp is the single origin that the audio and cursor tracks are expressed against. Pause/resume tells the pacer to keep its schedule but write nothing, so paused time is absent from the output rather than duplicated into it. A `camera` window mirrors the recorder's exclusion treatment so the webcam preview cannot end up inside the screen recording alongside its own track.

Studio is a dashboard section, not a separate window: it is a heavy editing surface that belongs beside Showcase rather than in the resident tray process. It reuses Showcase's scene model (`src/domain/showcase.ts`) for background, padding, radius, and shadow, extended by `src/domain/scene.ts` with a structured `BackgroundPaint` form that a `<canvas>` can render directly, since Showcase's CSS-string form only renders in the DOM. `src/lib/videoCompositor.ts` exposes one `paintFrame` function used by both the live preview (drawn every animation frame from the source `<video>` element) and the exporter (drawn once per encoded frame), so preview and export cannot diverge. Cursor smoothing (`src/domain/cursorTrack.ts`: teleport splitting, Ramer-Douglas-Peucker simplification, centripetal Catmull-Rom resampling, zero-phase exponential smoothing) and automatic zoom-on-click (`src/domain/zoomKeyframes.ts`: click clustering, hold-and-pan between nearby clusters, focus clamped inside the source frame) are pure functions operating on the recorded cursor track, independent of rendering. Export renders through `VideoEncoder` (WebCodecs) into `mp4-muxer` for MP4, or a small hand-written GIF89a/LZW writer for GIF, by seeking the source video frame-by-frame rather than playing it in real time.

## Shared models

Every capture contains physical bounds, logical bounds, scale factor, display identity, rotation, cursor inclusion, pixel format, color space, and immutable raster identity.

The versioned annotation scene uses discriminated unions. Shapes store source-space coordinates so scaling the preview does not alter export geometry. Raster filters reference regions and parameters; they do not mutate the source before export.

## Image transport

Do not send large captures as JSON or base64. A session registers an in-memory raster resource with an opaque identifier and exposes it through a scoped custom protocol. The webview renders that resource while commands exchange small typed metadata. Export returns an opaque result identifier or writes directly through the Rust backend.

## Storage

- Pinned windows load plain `index.html`, route by their native `pin-*` window label, and resolve their image through an in-memory native registry; filesystem paths are never transported as application-URL query strings.
Phase 1 stores settings and user-requested exports only. A small native storage preference persists the default save directory so resident shortcut workflows do not depend on a running WebView. Toolbar Save, scrolling Save, pinned-image Save, and Capture & save all resolve unique PNG filenames through this same service. The dashboard enumerates the configured directory only when opened or when a native save event arrives, and generates bounded thumbnails under the temporary CapKit directory; it does not poll or create a database. Temporary session resources are memory-backed where possible and deleted on terminal state. The later full local library will use SQLite metadata while originals remain normal files.

The WebView bundles Caveat Variable for inline annotation editing, while Rust embeds the matching OFL-licensed TTF at compile time so native Copy, Save, and Pin exports do not depend on a user-installed font. Dashboard windows remain hidden through lazy frontend bootstrap and invoke a native ready command after their first styled frame.

Windows UI Automation scans run on a blocking worker rather than Tauri's UI/IPC thread, following Microsoft's threading guidance. Results are cached as plain rectangles for one capture session and ranked smallest-first within the actual topmost underlying window.

When accessibility metadata is absent or too coarse, a dependency-free visual fallback flood-fills bounded, near-uniform regions around several cursor-adjacent seeds in the immutable raster. It rejects tiny, sparse, screen-sized, and over-budget regions, caches successful rectangles and quantized misses for the session, and never runs while idle. This improves browsers and custom canvases without adding OpenCV-sized resident or package overhead.

Dashboard shell actions canonicalize every requested image against the configured save directory before opening or deleting it. Windows `ShellExecuteW` launches the default viewer and retries with the Open With verb when no association exists. Delete remains an explicit, confirmed, permanent local operation.

Scrolling overlap detection uses a bounded coarse search followed by single-pixel refinement around the best candidate. Each score samples at most a fixed row/column grid, avoiding the previous quadratic work as selection height increases.

## Security and privacy

- No capture pixels leave the device in Phase 1.
- No account or telemetry is required.
- Logs exclude pixels, recognized text, paths unless necessary, and clipboard contents.
- IPC capabilities are scoped to the capture window and active session.
- Export paths are validated and writes are atomic.
- Secure redaction is rasterized before any output leaves the export pipeline.

## Packaging and rollout

Build a complete Windows reference behind shared traits, then implement macOS and Linux adapters without changing domain contracts. The root `bundle:windows` script produces the Windows NSIS installer; `bundle:store` assembles the Tauri executable as a full-trust Desktop Bridge MSIX and `.msixupload` using the reserved Partner Center identity; generic `bundle` builds the formats configured for the host OS. Native bundles must be built, signed where the distribution channel requires it, and acceptance-tested on their target platform. CI eventually builds and tests each platform; hardware and compositor matrices remain required before claiming support.
