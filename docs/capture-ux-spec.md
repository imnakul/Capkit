# Capture UX Specification

## Experience contract

The primary flow is `Shortcut -> select -> edit in place -> complete`. Phase 1 must not navigate to a conventional editor window.

## Trigger and preparation

- Register a configurable global shortcut and show actionable conflict feedback.
- Capture the display under the pointer unless the chosen command targets another display, a window, or all displays.
- Freeze the snapshot before presenting the capture surface.
- If capture permission is unavailable, show one concise recovery panel with a direct Settings action where the OS permits.
- Never leave a transparent or input-blocking window behind after failure.

## Selection

- Dim the frozen screen and preserve accurate colors inside the candidate selection.
- Hover previews the smallest cached window or rectangular UI region under the pointer using a visible rectangular overlay; hover never commits the selection.
- Clicking confirms the currently highlighted rectangular target. Clicking and dragging always draws a free-positioned rectangle, never a freeform shape.
- A completed selection moves only while the primary button is held over its interior; hovering alone never moves it.
- Pointer events from the selected region, annotation tools, contextual properties, and completion actions never start a new background selection.
- Initial target and rectangle selection uses ShotHub's high-contrast accent cursor rather than the operating system's generic crosshair; grab, resize, and drawing cursors remain contextual.
- A modifier temporarily disables detection and snapping.
- Selection is movable and resizable from handles; arrow keys nudge by one physical pixel and modified arrows nudge faster.
- Dimensions are expressed in physical export pixels. Optional coordinates can use logical desktop coordinates.
- Small selections keep handles usable without covering the entire selection.

## Adaptive toolbars

- Default to an annotation bar and a completion bar on separate available edges.
- Copy, Save, and Pin form a vertical rail attached to the nearest free side of the selection; Escape replaces a visible cancel button.
- Rectangle, ellipse, line, arrows, and highlight share a Shape family whose default is Rectangle. Blur, spotlight, pixelation, and blackout share a Focus and Privacy family.
- Color, size, and family variants appear in a compact popover attached directly below the active family icon rather than in a detached bottom bar.
- Spotlight/highlight rectangles use the currently selected accent color in both the live canvas and final raster export.
- Reposition bars when they would cross a monitor edge or cover the selection.
- Collapse the least-used tools into an accessible overflow only when space requires it.
- Support Minimal, Annotation, Tutorial, and user-defined layouts.
- Allow hiding and reordering tools in Settings, not during routine capture.
- Contextual properties appear only for the selected tool or object.

## Settings surface

- The normal desktop dashboard is separate from the on-demand capture surface; opening Settings never adds weight or navigation to the capture flow.
- Dashboard navigation is Dashboard, Cloud, Showcase, and Settings. Dashboard, Cloud, and Showcase remain intentionally empty until their roadmap phases begin.
- Capture colors are limited to five quick-access slots. Users can choose from high-visibility presets or add custom colors, then choose a default color and stroke size.
- Accent, overlay tint, detection, cursor, toolbar-family visibility, family defaults, and shortcut controls use clear groups with section-level reset actions where defaults matter.
- Color selectors pair every hexadecimal value with its visible swatch, and every settings section exposes a consistent reset action.
- Enabling startup launches ShotHub quietly into the tray rather than opening a dashboard during login.
- Dashboard panels provide persistent light and dark appearances with compact typography and controls; the choice does not alter frozen-screen capture fidelity.

## Quick tools

Annotations are non-destructive scene objects until export. Tool defaults remember the last safe choice without changing the global behavior unexpectedly.

- Resizing the selection adjusts the crop; there is no redundant standalone Crop tool.
- Rotate changes output orientation without degrading the immutable source.
- Shape and text tools support keyboard cancellation and property adjustment.
- Counter increments automatically and allows an explicit starting value.
- Blur, pixelation, and blackout previews must clearly distinguish secure export behavior.
- Undo/redo covers annotations, transforms, selection changes, and properties.

## Completion

- `Copy` rasterizes and writes the image to the clipboard.
- `Save` writes atomically to the configured folder using the naming policy.
- `Save As` invokes the native picker.
- `Pin` creates an always-on-top image and closes capture mode.
- `Cancel` changes neither clipboard nor filesystem.
- Success feedback is subtle and must not steal focus.

## Keyboard and accessibility

- `Escape`: cancel current operation, then capture session.
- `Enter`: apply the configured primary completion action.
- `Ctrl+Z` / `Ctrl+Shift+Z`: undo/redo.
- Tool buttons use semantic buttons, accessible names, visible focus, and documented shortcuts.
- Support high contrast, screen magnification, reduced motion, and keyboard-only operation.
- Never communicate tool state using color alone.

## Multi-monitor and platform states

- Coordinate conversions preserve display origin, scale, rotation, and physical pixel bounds.
- Toolbars remain on the display containing the selection's largest area.
- HDR content must not appear washed out; unsupported color paths display a clear SDR conversion note only when needed.
- On Wayland, respect portal-mediated selection and explain capabilities the compositor does not expose.

## Loading and failure

- Capture preparation happens while the capture surface remains hidden.
- The temporary frozen source uses a fast, lossless representation; compression and target enumeration are excluded from the reveal-critical path.
- The window may only become visible after the frozen snapshot has been validated, preloaded, and committed to the overlay.
- No fullscreen idle, loading, preview, or error screen is permitted.
- `Esc` from any screenshot state must discard the temporary capture, force-hide the entire surface, and immediately return ShotHub to its normal tray-only mode, even when session creation is incomplete or failed.
- Export, scrolling stitch, and permission failures retain recoverable session state.
- Retrying does not duplicate saves or clipboard writes.
- Errors contain a human action and a diagnostic code suitable for logs.
