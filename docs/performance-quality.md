# Performance and Quality

## Development checkpoint measurements (2026-07-18)

- **Observed:** Hidden Windows development tray process working set: 33.18 MB.
- **Observed:** CPU delta over a five-second idle sample: 0 seconds, effectively 0% of one core.
- **Observed:** Debug executable: 30.36 MB; built frontend assets: 0.86 MB.
- **Not a release benchmark:** Debug binaries, warm filesystem caches, and one machine are insufficient for installed-size or latency acceptance. Release packaging and repeated cold/warm samples remain required.

## Release size baseline (2026-07-27)

The 30.36 MB figure above is the **debug** executable and was being read as the release size when sizing the recorder work. Corrected measurements:

- **Observed:** Release executable before optimisation: 17.70 MB.
- **Observed:** Release executable after adding `[profile.release]` (`lto = "fat"`, `codegen-units = 1`, `panic = "abort"`, `strip = "symbols"`) and dropping `imageproc`'s default `fft`/`rayon` features: **10.25 MB**, a 42% reduction. `rustfft` and its `num-complex`/`nalgebra` transitive weight leave the dependency graph entirely.
- **Confirmed:** `image`'s `default-features = false` is defeated by feature unification, but the surviving cause is `xcap`'s `image` feature requiring `image/default`, which cannot be dropped without losing `Monitor::capture_image`. AVIF/EXR/TIFF/WebP encoders therefore remain linked; `imageproc` is no longer a contributor.
- **Headroom:** roughly 48 MB against the 60 MB installed-size budget, which is what the recorder is being designed against.

## Installable Windows build (2026-07-27)

- **Observed:** CapKit `0.1.1` x64 NSIS installer is **3.57 MiB** (`3,741,044` bytes).
- **Distribution note:** The current local installer is unsigned and may trigger Windows SmartScreen. Public distribution requires signing.
- **Superseded:** The 11.01 MiB figure predates the `[profile.release]` size work recorded below; the same tree now builds to 10.25 MB before the recorder and 10.48 MB with it.

## Recording budgets

**Targets for the recorder and Studio, to be measured per milestone:**

- Dropped frames during capture: under 0.1% of expected frames at 1080p60.
- Encode CPU: under 8% of one core at 1080p60, using the hardware Media Foundation transform with no CPU-side frame copy.
- Cursor sampler: under 0.05% of one core at 250 Hz.
- Audio/video drift: under one frame over a 20-minute recording.
- Recorder progress events: at most 1 Hz to the frontend, never per frame.
- **Measured (2026-07-27, spike):** WebCodecs `VideoEncoder` H.264 High at 1080p reached 113 fps; the Canvas2D compositor with gradient, rounded clip, shadow, and vignette reached at least 120 fps at both 1080p and 4K. A 30-second 60 fps export is projected at roughly 16 seconds.
- **Measured (2026-07-27, recorder):** 121 frames encoded with 0 dropped over four seconds at 2560x1440; 1157 cursor samples over five seconds against a 250 Hz target; 82 KB of AAC for five seconds of system audio; a 640x480 crop honoured exactly.
- **Measured (2026-07-27, size):** The recorder adds 0.23 MB to the release executable, taking it from 10.25 MB to 10.48 MB. Windows Graphics Capture, Media Foundation, and WASAPI are all supplied by the operating system.
- **Measured (2026-07-27, Studio):** Pause/resume and the camera window add a further 0.03 MB (10.48 -> 10.51 MB). The frontend gains one dependency, `mp4-muxer` (~13 KB); the built frontend bundle is 1.2 MB total. Full recorder + Studio feature set: 0.26 MB against the 60 MB budget.
- **Unmeasured:** Real `VideoEncoder` throughput and GIF frame timing inside the packaged app's WebView2 (as opposed to the Chromium pane used for the initial spike). The GIF writer's byte-level correctness and the compositor's draw-order logic are covered by automated tests; full encode-a-real-recording verification needs a manual pass, documented in current-status.md.

## Performance budgets

**Initial targets, measured on named reference hardware:**

- Pointer geometry updates: at most one render per display frame, with target geometry cached once per capture session.
- Live annotation drafts are coalesced to one update per display frame, and committed scene elements remain memoized while the pointer moves.
- Screen Draw cursor effects are coalesced to one update per animation frame; its static annotation layer and dock remain memoized during cursor-only movement.
- Presentation-pointer trails sample at most once per 24 ms and discard sub-1.5-pixel overlap. Samples remain transient in memory only while the primary button is held and are released as one operation on pointer up/cancel, with no expiry timers or scene-history writes.
- Spotlight and Magnifier use transform-only movement, the presentation pointer avoids live SVG filter effects, and the Screen Draw dock avoids backdrop filtering over a continuously changing desktop.
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
