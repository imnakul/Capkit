# Make it Easy

## Product intent

**Confirmed name:** `Make it Easy`

**Confirmed problem:** Dense, tiny, poorly contrasted, or visibly unrendered content can be technically present on screen while remaining difficult to read. Typical examples include raw Markdown previews, compressed API responses, logs, tables, code, browser developer tools, remote desktops, images of text, and applications with weak zoom controls.

**Confirmed phase:** `Make it Easy` is an on-demand Windows readability tool with its own configurable global shortcut. It adds no OCR, parsing, or AI work to CapKit's resident tray process or normal screenshot path.

The defining interaction is:

`Make it Easy -> select a rectangle -> extract locally -> open a readable card beside the source`

The original application remains unchanged. `Escape` closes selection or the reader, and the same tool can create another reader.

## V1 experience

### Selection

- Add a distinct `Make it Easy` global shortcut (`Alt+Shift+E` by default) and Settings shortcut configuration.
- The action enters free-rectangle selection using the same high-contrast CapKit cursor and monitor/DPI geometry as capture.
- Capture the current monitor before showing the selector and render that frozen image beneath the tint. This avoids opaque-black transparent WebViews and ensures the content remains visible on every supported Windows/WebView2 configuration.
- Show the result beside the selected region, then clamp or flip it at display edges. Do not cover the source by default.

### Local extraction ladder

Use the cheapest and most accurate available path in order:

1. **Accessible text:** Request a bounded text range through Windows UI Automation when the underlying application exposes one.
2. **Local OCR fallback:** Capture only the selected physical-pixel rectangle and recognize it with an installed Windows OCR language.
3. **Visual-only fallback:** If text extraction is unavailable, offer an enlarged, sharpened, high-contrast image reader instead of failing.

The extraction worker loads only after the user selects a region and is released when the reader closes.

### Reader card

The implemented reader is a resizable, pinnable, high-contrast surface with:

- `Auto`, `Plain text`, `Markdown`, `JSON`, `Code`, and `Table` views.
- Larger text, font-size controls, and line-height controls. Comfortable reading width is constrained automatically.
- Line wrapping by default, with horizontal scrolling available for code and tables.
- Light, dark, and high-contrast paper modes independent from the dashboard theme.
- `Original / Readable` comparison.
- Copy extracted or edited text.
- An editable extracted-text state so OCR mistakes can be corrected before re-rendering.
- A concise warning when OCR is unavailable or returns no text. The compatibility Windows OCR API does not expose per-word confidence.

Raw HTML from Markdown is never executed. Links are inert by default and require an explicit open action.

### Automatic structure detection

The local renderer can make both reference cases readable without generative AI:

- Markdown markers become headings, lists, emphasis, tables, quotes, and fenced code blocks.
- Valid JSON becomes an indented, collapsible tree; HTTP status and common error fields receive restrained emphasis.
- Log-like text gets timestamp/level alignment and wrapping.
- Delimited rows can become a table after a reversible preview.
- Plain text receives typography, contrast, spacing, and paragraph reflow only.

When detection is uncertain, default to Plain text and show the other views as explicit choices. Never silently rewrite technical content.

## AI boundary

**Confirmed:** AI is not required for extraction, Markdown rendering, JSON formatting, zoom, contrast, wrapping, or syntax-aware presentation.

**Think Later:** Add a separate, clearly labeled `Explain` action for:

- Summarizing a long region.
- Explaining an error response in plain language.
- Rewriting difficult prose.
- Translating extracted content.
- Turning unstructured notes into steps or a table.

AI must be opt-in per action. The reader shows exactly which extracted text will leave the device before a cloud request. Local model support may be explored later, but no model remains loaded while CapKit is idle.

AI output appears in a separate tab and never replaces the original or deterministic readable view.

## Architecture

### Platform boundary

Introduce an on-demand `ReadableRegionBackend` with:

- Capability probing and installed-language reporting.
- Bounded accessible-text extraction.
- Physical-pixel region OCR.
- Structured lines, words, bounds, confidence, language, and extraction-source metadata.
- Cancellation and a strict time budget.

Windows first uses UI Automation text patterns where available, then the installed Windows OCR runtime. A newer NPU-backed Windows AI OCR path can be an optional capability on supported hardware; it cannot be the compatibility baseline.

macOS later can use Vision text recognition. Linux requires a separately evaluated OCR adapter because bundling a large resident OCR model conflicts with CapKit's package-size and idle-resource goals.

### TypeScript boundary

IPC responses are Zod-validated and distinguish:

- `accessible-text`
- `ocr-text`
- `visual-only`

Rendering and format detection load only with the lazy reader window. Markdown rendering does not enable raw HTML and makes links inert. Source pixels and extracted text stay local.

## Implementation checkpoint — 2026-07-27

- **Confirmed:** The native global shortcut, monitor-local frozen-screen rectangle selector, accessible-text fast path, Windows OCR fallback, temporary raster cleanup, edge-aware reader placement, and same-shortcut dismissal are implemented.
- **Confirmed:** Reader modes include Auto, Plain, Markdown/GFM, JSON, Code, and Table, plus Original/Readable comparison, local editing, copy, typography controls, paper modes, pinning, keyboard cancellation, and new-region selection.
- **Confirmed:** Recognition runs on a blocking native worker; the capture/editor and dashboard paths do not load it.
- **Provisional:** Physical testing is still required across mixed DPI, multiple OCR language packs, browsers, Discord, developer tools, and elevated applications.
- **Think Later:** Collapsible JSON nodes, syntax highlighting, log-specific rendering, explicit reading-width controls, saved readers, and opt-in AI explanation.

## Performance and quality targets

- No idle CPU, RAM, startup, or network cost.
- Reader shell appears immediately after selection with a cancellable extraction state.
- Accessible-text fast path target: under 150 ms for a bounded region on reference hardware.
- OCR target: first readable result under 1.5 seconds for a typical 1080p text region.
- Selection and cancellation remain responsive while recognition runs off the UI thread.
- Retain no OCR raster or extracted text after the reader closes unless the user pins or saves it.
- Provide keyboard operation, screen-reader labels, high contrast, selectable text, and zoom up to at least 300%.

## Acceptance examples

### Raw Markdown attachment

- Detect Markdown conservatively.
- Render headings, lists, emphasis, tables, quotes, and code fences.
- Preserve an editable source tab.
- Never interpret Markdown content as executable HTML.

### Browser developer-tools response

- Enlarge the selected response independently from the browser.
- Detect and pretty-print valid JSON.
- Wrap long string values, expose collapsible nodes, and highlight status/error fields.
- Fall back to a sharpened visual reader if text extraction fails.

## Open validation questions

- Whether `Make it Easy` should also appear in the Screen Draw dock; the dedicated global shortcut is confirmed.
- Default reader placement and maximum width on small/mixed-DPI displays.
- Supported Windows OCR languages at launch and the recovery flow for a missing language pack.
- Whether pinned readers persist extracted text between CapKit sessions.
- Free-tier boundary for deterministic local reading versus optional AI explanation.
