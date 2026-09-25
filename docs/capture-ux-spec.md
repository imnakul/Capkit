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
- Initial target and rectangle selection uses CapKit's high-contrast accent cursor rather than the operating system's generic crosshair. The same cursor remains visible inside a completed selection and over capture/annotation controls; only resize handles keep contextual resize cursors.
- A modifier temporarily disables detection and snapping.
- Selection is movable and resizable from handles; arrow keys nudge by one physical pixel and modified arrows nudge faster.
- Dimensions are expressed in physical export pixels. Optional coordinates can use logical desktop coordinates.
- Small selections keep handles usable without covering the entire selection.

## Adaptive toolbars

- Default to an annotation bar and a completion bar on separate available edges.
- Copy, Copy & Save, Save, and Pin form a vertical rail attached to the nearest free side of the selection; Escape replaces a visible cancel button.
- The capture toolbar supports two persisted layouts. **Individual** renders each enabled tool as its own slot. **Group** renders each non-empty Settings row as one slot; tools in rows are enabled, unassigned tools are disabled, row order is submenu order, and the first tool is both the visible icon and default click action.
- Select is always the first fixed recovery tool and cannot be configured away. Group rows may be added or removed, and tool pills can be reordered within or across rows. Settings also provides keyboard alternatives for reorder, cross-row movement, enable, and disable.
- Hovering a group morphs a compact popover beside its icon; clicking is not required to discover variants. It opens below by default, flips above when bottom space is insufficient, and horizontally clamps to the capture viewport. Tool variants always appear before the separator, with colors, size, and other contextual properties afterward. A short pointer bridge delay keeps the menu stable across the gap; both the hover indicator and the complete contextual rail glide horizontally between slots instead of jumping or remounting.
- Spotlight/highlight rectangles use the currently selected accent color in both the live canvas and final raster export.
- Reposition bars when they would cross a monitor edge or cover the selection.
- Collapse the least-used tools into an accessible overflow only when space requires it.
- Support Minimal, Annotation, Tutorial, and user-defined layouts.
- Allow hiding, grouping, choosing defaults, and reordering tools in Settings, not during routine capture.
- Contextual properties appear only for the selected tool or object.

## Settings surface

- The normal desktop dashboard is separate from the on-demand capture surface; opening Settings never adds weight or navigation to the capture flow.
- Dashboard navigation is Dashboard, Cloud, Showcase, and Settings. Dashboard is a lightweight view of explicitly saved files; Cloud and Showcase remain roadmap placeholders.
- Capture colors are limited to five quick-access slots. Users can choose from high-visibility presets or add custom colors, then choose a default color and stroke size.
- Accent, overlay tint, detection, cursor, toolbar composition, and shortcut controls use clear groups with section-level reset actions where defaults matter.
- Color selectors pair every hexadecimal value with its visible swatch, and every settings section exposes a consistent reset action.
- Enabling startup launches CapKit quietly into the tray rather than opening a dashboard during login.
- Dashboard panels provide persistent light and dark appearances with compact typography and controls; the choice does not alter frozen-screen capture fidelity.

## On-screen presentation toolbar

- **Confirmed:** A configurable global shortcut toggles a separate on-screen annotation mode over the display under the pointer. Pressing the same shortcut again exits immediately; `Escape` is the safety exit.
- **Confirmed:** The mode is independent from screenshot capture and never changes the underlying application. Its transparent, always-on-top surface is created on demand and destroyed on exit.
- **Confirmed:** Screen Draw can save the full monitor with its annotations using S or the dock's Save screen button. Screen Draw's own controls are hidden for the capture; the session and drawings remain.
- **Confirmed:** Settings optionally persists annotations across toggle cycles. When disabled, every Screen Draw session starts clean; when enabled, the runtime-validated scene is restored without retaining pointer trails or transient tool state.
- **Confirmed:** Screen Draw defaults to a live transparent desktop. Settings can choose a frozen frame instead; that mode captures and preloads the current monitor before revealing the overlay. A capture failure falls back to the live desktop with a recoverable status message.
- A comfortably sized dock floats above the bottom-center system edge and exposes Pencil, Rectangle, Ellipse, Arrow, Text, Spotlight, Magnifier, Presentation Pointer, Eraser, Blur, Undo, Redo, and a visually distinct Clear action.
- Presentation Pointer is the default active tool when Screen Draw opens and after Clear. This avoids leaving permanent marks from the first presentation gesture; Pencil remains one click or its assigned number away.
- Spotlight follows the pointer, uses its persisted radius, and dims the surrounding desktop without hiding it. Magnifier follows the pointer and shows a 1.85x lens. Presentation Pointer shows its complete luminous trail while the primary pointer button is held, then fades the released trail over 450 ms; reduced motion removes it immediately.
- Pencil, shapes, arrows, text, and blur remain until individually erased, cleared, undone, or the mode exits. Clear participates in history so Undo can restore the previous overlay.
- Selecting Text shows a compact placement instruction. Clicking outside the dock opens a focused in-place editor at a viewport-clamped position; clicking inside that editor cannot create another text object. Losing focus commits the editor once, `Escape` cancels it, and `Ctrl+Enter` commits explicitly.
- Settings assigns unique optional `0`-`9` shortcuts to tools. Assigned numbers are visible on the dock; conflicts move the number to the newly assigned tool.
- Settings also owns the toggle shortcut, persistent drawing color, stroke width, spotlight radius, plus Ring, Laser, Precision, and Crosshair cursors in Small, Medium, and Large sizes. Color and size controls are deliberately omitted from the live dock.
- In live mode, Blur and Magnifier request a validated snapshot only when first selected. Snapshot work is excluded from the default toggle-to-toolbar path so Pencil, Shapes, Spotlight, Pointer, Text, Eraser, Undo, and Redo become available as soon as the on-demand WebView is ready. Frozen mode reuses its entry snapshot.
- Undo and Redo are immediate commands, never selectable drawing modes. The first click after completing an annotation changes history.
- A single accent surface glides between hovered tools instead of remounting or flashing separate button backgrounds.
- Spotlight and Magnifier cursor coordinates and live drafts are coalesced to one visual update per display frame. The laser dot and incrementally built trail update SVG elements directly from coalesced pointer samples at least 1.5 px apart; static annotations and the dock do not rerender for laser movement. Released laser trails have a 600 ms cleanup fallback and never enter persistent scene history.

## Quick tools

Annotations are non-destructive scene objects until export. Tool defaults remember the last safe choice without changing the global behavior unexpectedly.

- Resizing the selection adjusts the crop; there is no redundant standalone Crop tool.
- Shape and writing tools support keyboard cancellation and property adjustment.
- Pencil records a smoothed freehand path. Curved arrows use a sampled quadratic path so the live canvas and native export share the same geometry.
- Text creates a Caveat placeholder at the clicked point. Clicking the same text again opens a native inline textarea at that position. Clicking empty space commits the active edit first and then creates an independent placeholder; previous text must never be reverted, copied into the new object, or repositioned. The selected text object exposes a top-right delete control.
- Counter increments automatically and allows an explicit starting value.
- Blur and pixelation render live against the frozen source while drawing; blackout remains visibly opaque. Final export still performs permanent Rust-side rasterization, and the UI must clearly distinguish secure pixelation/blackout from visual blur.
- Undo/redo covers annotations, transforms, selection changes, and properties.
- While a region is selected, configurable unmodified single-key actions (default `C` to copy, `A` to copy and save, and `S` to save) complete the capture and return to the tray. The three keys remain distinct case-insensitively; text fields consume them normally, and scrolling capture does not run selected-region completion shortcuts.

## Completion

- `Copy` rasterizes and writes the image to the clipboard.
- `Copy & Save` rasterizes once, writes that same raster to the clipboard first, then atomically saves it to the configured folder. It applies only to the standard selected-region overlay.
- If Copy & Save reaches the clipboard but not the file, the overlay keeps the selected scene and rendered raster, explains the partial success, and offers a save-only retry that cannot rewrite the clipboard.
- `Save` writes atomically to the configured folder using the naming policy.
- `Save As` invokes the native picker.
- `Pin` creates an always-on-top image and closes capture mode.
- `Cancel` changes neither clipboard nor filesystem.
- Success feedback is subtle and must not steal focus.

The configured folder defaults to `Pictures/CapKit`, is created when the resident service starts, and is shared by toolbar Save, scrolling Save, pinned-image Save, and the direct Capture & save shortcut. Settings owns the folder picker. The Dashboard shows its path and compatible saved images through on-demand thumbnails; Copy never creates a dashboard entry.

## Scrolling capture

- A completed rectangular selection exposes one Scrolling Capture action; entering it never discards the original capture session until the stitched result is completed or cancelled.
- Settings offers Automatic, Manual, and Always ask. Automatic and Manual begin immediately from the toolbar action. Always ask places a clearly titled two-card chooser beside the selected region; selecting a card starts without a second confirmation button.
- Automatic mode temporarily hides CapKit, places scroll input inside the selected area, captures bounded frames, stops on unchanged content or the frame limit, and restores CapKit directly into a stitched preview.
- Repeated sticky headers are retained in the first frame and removed from later frames before overlap matching.
- Manual fallback captures an initial frame, then offers an explicit “scroll once, then add frame” action. CapKit hides for a short announced interval so the user can scroll the underlying application, samples the same region, and restores the updated preview.
- Preview reports frame count, end/no-progress state, and sticky-header handling, with Retry, Copy, Save, and Pin actions.
- A Copy, Save, or Pin failure preserves the stitched preview, displays the native diagnostic, and leaves all completion actions retryable.
- Applications that ignore synthetic wheel input return a recoverable no-progress state and keep Manual fallback available.

Target hover uses cached windows and optional Windows UI Automation rectangles. Pixel-color region inference is intentionally excluded after physical testing showed unstable full-window flicker. Unsupported browser/custom-canvas content remains easy to capture with free-rectangle selection rather than presenting unreliable targets.

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
- The dashboard also remains hidden through WebView and lazy-module bootstrap, then reveals only after its themed React frame is painted; unstyled white startup frames are not permitted.
- The temporary frozen source uses a fast, lossless representation; compression and target enumeration are excluded from the reveal-critical path.
- **Confirmed:** Monitor-sized overlay windows disable the undecorated window shadow; on Windows it insets the client area and misaligns the frozen snapshot and export coordinates.
- **Confirmed:** To avoid Windows full-screen treatment, capture and Screen Draw windows extend one physical pixel at a free bottom or right edge while their visible content stays at the exact display bounds; when both edges touch another monitor, they remain exact-size.
- The window may only become visible after the frozen snapshot has been validated, preloaded, and committed to the overlay.
- No fullscreen idle, loading, preview, or error screen is permitted.
- `Esc` from any screenshot state must discard the temporary capture, force-hide the entire surface, and immediately return CapKit to its normal tray-only mode, even when session creation is incomplete or failed.
- Export, scrolling stitch, and permission failures retain recoverable session state. A Copy & Save file failure after a successful clipboard write is explicitly a save-pending state and retains only the raster needed for save-only retry.
- Retrying does not duplicate saves or clipboard writes. Cancellation serializes with native output work, and responses from a closed or replaced capture session cannot mutate newer UI state.
- Errors contain a human action and a diagnostic code suitable for logs.
