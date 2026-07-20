# Snaphub

Snaphub is a lightweight Windows-first screenshot utility designed for cross-platform rollout and built around one uninterrupted workflow:

`Shortcut -> select on a frozen screen -> edit in place -> copy, save, or pin -> return to work`

The product is intentionally narrower and calmer than automation-heavy capture suites. Phase 1 focuses on fast capture, contextual quick editing, pinning, and scrolling capture without opening a conventional editor window.

## Status

- **Confirmed:** Windows-first reference implementation with Windows 11 as the first supported platform.
- **Confirmed:** macOS, Ubuntu, and Fedora remain architectural targets.
- **Confirmed:** Phase 1 is local-first and requires no account, cloud, telemetry, or library.
- **In progress:** The first Windows capture-to-export vertical slice, tray lifecycle, pinning, and settings dashboard are operational; Phase 1 still needs native hardening and completion.
- **Provisional:** Pricing, quotas, update entitlement, final brand clearance, and distribution channels.

See [Current implementation status](docs/current-status.md) for the verified working surface, partial implementations, and remaining gaps.

## Documentation

- [Product brief](docs/product-brief.md)
- [Current implementation status](docs/current-status.md)
- [Feature roadmap](docs/feature-roadmap.md)
- [Capture UX specification](docs/capture-ux-spec.md)
- [Technical architecture](docs/technical-architecture.md)
- [Performance and quality](docs/performance-quality.md)
- [Business and cloud](docs/business-cloud.md)
- [Brand and marketing handoff](docs/brand-marketing-handoff.md)
- [Decision log](docs/decision-log.md)

## Development

Prerequisites:

- Node.js 24+
- pnpm 10+
- Rust 1.95+
- Windows 11 SDK and WebView2 for the Windows reference application

Commands:

```powershell
pnpm.cmd install
pnpm.cmd dev
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd test
pnpm.cmd tauri dev
```

## Installable builds

The current supported build is Windows 11. From a Windows development machine with the prerequisites above installed, create a normal per-user NSIS setup executable with:

```powershell
pnpm.cmd install
pnpm.cmd bundle:windows
pnpm.cmd bundle:store
```

The installer is written to:

```text
apps/desktop/src-tauri/target/release/bundle/nsis/Snaphub_0.1.1_x64-setup.exe
```

`pnpm.cmd bundle:store` creates the Store-ready x64 MSIX package and the recommended `.msixupload` submission artifact under `apps/desktop/src-tauri/target/store`. Its manifest uses the immutable Partner Center identity `JagatBandhu.SnapHub`; package versions use four parts and must end in `.0`. See [Microsoft Store release](docs/microsoft-store-release.md).

Tauri uses the system WebView2 runtime on current Windows 10/11 installations, keeping the installer smaller. Production distribution should add code signing before public release. `pnpm.cmd bundle` builds the native bundle formats configured for the host operating system.

### Platform status

- **Confirmed:** Windows 11 is the only currently supported and physically tested target.
- **Provisional:** macOS, Ubuntu, and Fedora are architectural targets. Shared capture/domain code exists, but native permissions, target detection, scrolling input, packaging, signing, and hardware acceptance are not complete.
- Native installers should be built and tested on their target OS: Windows for NSIS/MSI, macOS with Xcode for `.app`/`.dmg`, and Linux with WebKitGTK/system packaging dependencies for AppImage, Debian, or RPM packages.

Rust checks:

```powershell
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## Source layout

```text
apps/desktop/          React capture surface and Tauri host
apps/desktop/src-tauri Rust resident core and platform adapters
apps/landing-page/     Next.js marketing site (docs/brand-marketing-handoff.md)
docs/                  Product and engineering source of truth
```

## Landing page

The marketing site lives in `apps/landing-page` and is a standalone Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 project, styled per [Brand and marketing handoff](docs/brand-marketing-handoff.md). It ships no product code and is not part of the desktop build.

```powershell
pnpm.cmd --filter @snaphub/landing-page dev
pnpm.cmd --filter @snaphub/landing-page typecheck
pnpm.cmd --filter @snaphub/landing-page lint
pnpm.cmd --filter @snaphub/landing-page build
```
