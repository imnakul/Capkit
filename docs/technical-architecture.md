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
- Later OCR, recording, Studio, library indexing, and upload

## State machine

`Idle -> Triggered -> SnapshotReady -> Selecting -> Editing -> Exporting -> Completed | Cancelled | Failed`

Transitions are explicit and validated. Terminal states release capture windows, image buffers, hooks, and temporary files before returning to `Idle`.

## Platform interfaces

- `CaptureBackend`: displays, snapshots, windows, and capture capabilities
- `GlobalShortcutBackend`: register, unregister, update, and conflict details
- `TargetDetectionBackend`: windows and optional UI regions at a point
- `ClipboardBackend`: image output and compatibility reporting
- `PinnedWindowBackend`: create and control pinned image windows
- `PermissionBackend`: inspect, request, and open platform permission settings
- `ScrollingCaptureBackend`: automatic/manual input and frame acquisition

Windows uses Windows Graphics Capture or DXGI as appropriate, Win32 shortcut/window APIs, and optional UI Automation. macOS will use ScreenCaptureKit. Linux will use XDG portals/PipeWire on Wayland and an X11 fallback.

## Shared models

Every capture contains physical bounds, logical bounds, scale factor, display identity, rotation, cursor inclusion, pixel format, color space, and immutable raster identity.

The versioned annotation scene uses discriminated unions. Shapes store source-space coordinates so scaling the preview does not alter export geometry. Raster filters reference regions and parameters; they do not mutate the source before export.

## Image transport

Do not send large captures as JSON or base64. A session registers an in-memory raster resource with an opaque identifier and exposes it through a scoped custom protocol. The webview renders that resource while commands exchange small typed metadata. Export returns an opaque result identifier or writes directly through the Rust backend.

## Storage

- Pinned windows resolve their image through an in-memory native registry keyed by the Tauri window label; filesystem paths are never transported as application-URL query strings.
Phase 1 stores settings and user-requested exports only. Temporary session resources are memory-backed where possible and deleted on terminal state. Later local-library metadata will use SQLite while originals remain normal files.

## Security and privacy

- No capture pixels leave the device in Phase 1.
- No account or telemetry is required.
- Logs exclude pixels, recognized text, paths unless necessary, and clipboard contents.
- IPC capabilities are scoped to the capture window and active session.
- Export paths are validated and writes are atomic.
- Secure redaction is rasterized before any output leaves the export pipeline.

## Packaging and rollout

Build a complete Windows reference behind shared traits, then implement macOS and Linux adapters without changing domain contracts. CI eventually builds and tests each platform; hardware and compositor matrices remain required before claiming support.
