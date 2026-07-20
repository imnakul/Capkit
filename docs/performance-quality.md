# Performance and Quality

## Development checkpoint measurements (2026-07-18)

- **Observed:** Hidden Windows development tray process working set: 33.18 MB.
- **Observed:** CPU delta over a five-second idle sample: 0 seconds, effectively 0% of one core.
- **Observed:** Debug executable: 30.36 MB; built frontend assets: 0.86 MB.
- **Not a release benchmark:** Debug binaries, warm filesystem caches, and one machine are insufficient for installed-size or latency acceptance. Release packaging and repeated cold/warm samples remain required.

## Performance budgets

**Initial targets, measured on named reference hardware:**

- Pointer geometry updates: at most one render per display frame, with target geometry cached once per capture session.
- Live annotation drafts are coalesced to one update per display frame, and committed scene elements remain memoized while the pointer moves.
- Shortcut reveal excludes PNG compression and nonessential target enumeration; those tasks use a fast temporary bitmap or continue after reveal.
- Idle CPU: effectively 0%; no polling loops.
- Idle memory: 25-35 MB depending on platform.
- Installed size: under 60 MB excluding user captures.
- Shortcut to visible capture surface: approximately 100 ms median.
- Show a preparation state only after 250 ms.
- Release capture/editor buffers and workers after terminal state.
- Scrolling overlap matching samples a bounded grid and refines one neighborhood; post-capture matching must not grow quadratically with frame height.
- Visual-region inference is on-demand, bounded by pixel count, and caches successful regions plus quantized misses for the active session.
- No background network activity except user-enabled update/license checks in future paid builds.

Budgets are gates for dependency and architecture decisions. Measurements record cold/warm state, OS, display count, resolution, scaling, GPU, and build type.

## Functional quality

- Correct physical export bounds at 100%, 125%, 150%, 175%, and 200% scaling.
- Correct placement across negative monitor origins, rotated displays, and mixed scaling.
- Accurate SDR output and explicit HDR-to-SDR behavior.
- Pixel-stable scene serialization and export.
- Clipboard compatibility with browsers, office apps, chat apps, and image editors.
- Atomic saves with collision-safe names.
- Session cancellation leaves no window, file, clipboard mutation, hook, or temporary resource.

## Secure export

- Blackout replaces source pixels with an opaque color.
- Secure pixelation derives output from the protected region and prevents reconstruction through annotation removal.
- Blur is treated as visual obfuscation unless the UI explicitly labels a secure variant.
- Metadata and thumbnails never retain an unredacted derived export under the same identity.

## Accessibility

- Complete keyboard path and visible focus.
- Accessible names, roles, descriptions, and pressed/selected state.
- High-contrast and reduced-motion compatibility.
- Minimum practical targets around small selections.
- Status and failure feedback exposed to assistive technology without stealing focus.

## Reliability and observability

- Structured local logs with session IDs and diagnostic codes but no captured content.
- Panic/error boundaries always trigger capture cleanup.
- Retryable and terminal errors are distinct.
- Crash reports are opt-in and scrub paths and user content.

## Verification matrix

- Unit: geometry, DPI conversion, snapping, ranking, scene history, serialization, filenames, export math.
- Component: handles, toolbar placement, keyboard flows, customization, contextual controls.
- Golden images: all tools at common scaling and color modes.
- Windows integration: shortcuts, clipboard, save, multi-monitor, HDR, pinning, conflicts.
- Scrolling: browsers, editors, chats, native lists, sticky content, animation, unsupported targets.
