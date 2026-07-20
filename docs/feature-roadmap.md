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

## Phase 2: Studio

**Confirmed phase boundary:** combine the full image editor and visual asset studio rather than shipping separate products.

- Non-destructive layer editing and editable project files
- Multiple images, canvases, and pages
- Advanced typography and image adjustments
- Clipart, icons, stickers, reusable assets, and brand kits
- Background removal, backgrounds, gradients, patterns, borders, shadows, and rounded corners
- Device and browser mockups
- Social, presentation, tutorial, comparison, and numbered-step layouts
- Templates and reusable watermark presets
- PNG, JPEG, WebP, PDF, and later PPTX-compatible export

Snaphub is not intended to become a general PowerPoint replacement.

## Phase 3: local library

The Phase 1 dashboard's on-demand view of the configured save folder is a convenience surface, not the library. It may open, delete, or route an image toward Showcase, while Cloud upload remains disabled until an account/storage connection exists. Phase 3 begins when Snaphub adds durable metadata and organization.

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

## Think Later

- OCR area capture
- QR-code detection
- On-screen color detection and picker
- Screen and GIF recording
- Webcam, microphone, system-audio, click, and keystroke recording
- Live presentation tools
- AI editing and semantic search
- Team comments and real-time collaboration
- Browser extensions and mobile companion applications
