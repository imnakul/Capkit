# Feature Roadmap

Implementation progress is tracked separately in [Current implementation status](current-status.md). Items below describe intended scope and are not proof that a feature is complete.

## Phase 1: fast capture and in-place quick editing

**Confirmed for the initial product:**

- Configurable global shortcuts and conflict reporting
- Free-region, window, fullscreen, and monitor capture
- Window and rectangular UI-region hover detection
- Multi-monitor and mixed-DPI behavior
- Timer, cursor inclusion, and repeat-last-region
- Toggleable crosshair, dimensions, magnifier, snapping, guides, coordinates, aspect ratio, and pixel grid
- Frozen-screen selection with resize, move, and pixel adjustment
- Adaptive edge toolbars with Minimal, Annotation, Tutorial, and Custom layouts
- Resize-selection cropping, grouped arrows, smooth curved arrows, lines, rectangles, and ellipses
- Writing group with highlighter, smoothed freehand pencil, and in-place Caveat text; spotlight, counter, blur, secure pixelation, and blackout
- Contextual color, stroke, opacity, fill, radius, arrow, font, alignment, and redaction controls
- Undo and redo
- Copy, Save, Save As, Pin, Cancel, and optional watermark completion actions
- Pinned-image resize, rotation, opacity, lock, click-through, copy, save, duplicate, and close
- Scrolling capture with automatic and manual modes, overlap stitching, sticky-region handling, preview, retry, and limitation messaging
- On-demand on-screen presentation toolbar with pencil, text, shapes, arrows, spotlight, magnifier, a press-and-hold presentation laser, eraser, blur, clear, undo/redo, configurable tool numbers, and custom cursors

## Provisional next feature: Make it Easy

`Make it Easy` is an on-demand local-first readability layer for dense, tiny, poorly contrasted, or visibly unrendered content. The first version selects a rectangle, prefers accessible text, falls back to Windows OCR, and opens a resizable reader beside the source with Plain text, Markdown, JSON, Code, and Table views. A visual-only magnified/high-contrast fallback remains available when extraction fails.

Deterministic extraction and formatting do not require AI. Optional summarization, explanation, rewriting, and translation remain a later opt-in AI layer. See [Make it Easy specification](make-it-easy-spec.md).

## Phase 2: Studio

**Confirmed phase boundary:** combine the full image editor and visual asset studio rather than shipping separate products.

**Implemented first slice:** Showcase is now an on-demand composition surface. It is intentionally a live scene editor for the first milestone; raster export, editable project files, and a reusable mockup asset library remain subsequent Studio work.

- Non-destructive layer editing and editable project files
- Multiple images, canvases, and pages
- Advanced typography and image adjustments
- Clipart, icons, stickers, reusable assets, and brand kits
- Background removal, backgrounds, gradients, patterns, borders, shadows, and rounded corners
- Device and browser mockups
- Social, presentation, tutorial, comparison, and numbered-step layouts
- Templates and reusable watermark presets
- PNG, JPEG, WebP, PDF, and later PPTX-compatible export

CapKit is not intended to become a general PowerPoint replacement.

## Phase 3: local library

The Phase 1 dashboard's on-demand view of the configured save folder is a convenience surface, not the library. It may open, delete, or route an image toward Showcase. The inert Cloud upload action was removed on 2026-07-27; sharing returns with the Phase 4 account and storage work rather than as a disabled control. Phase 3 begins when CapKit adds durable metadata and organization.

- Local-first capture history
- Tags, folders, favorites, filters, and search
- Retention and storage limits
- Reopen, duplicate, pin, drag, copy, upload, and export
- Annotation-text search and later OCR content search
- No account requirement

## Phase 4: cloud sharing

- One-click upload and automatic share-URL copy
- Private Cloudflare R2 storage
- Share pages, short links, total views, approximate unique views, downloads, and interactions
- Passwords, expiry, self-destruction, download controls, and asset replacement
- Branding, custom watermark, custom domains, collections, and tags
- Teams and comments later within the phase

## Phase 2.5: recording and Studio

**Confirmed scope:** Recording is promoted out of Think Later. CapKit has advertised "capture, record, and showcase" since its first brief, and the encoder decision that makes it affordable is recorded in the decision log.

- Screen, display, region, and window recording with a countdown and a dock excluded from the video
- System-audio and microphone capture as separate, independently balanced tracks
- A cursor and click metadata track recorded alongside the video, which cannot be reconstructed afterwards
- Smooth interpolated cursor motion and automatic zoom on click, editable as keyframes
- The Showcase treatment applied to video: background, padding, corner radius, and shadow
- Webcam as a separate track, croppable to circle, square, or rounded shapes
- MP4 and GIF export

## Think Later

- General-purpose OCR capture and OCR-indexed search beyond the bounded `Make it Easy` reader
- QR-code detection
- On-screen color detection and picker
- Live presentation tools
- AI editing and semantic search
- Team comments and real-time collaboration
- Browser extensions and mobile companion applications
