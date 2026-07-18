# ShotHub

ShotHub is a lightweight, cross-platform screenshot utility built around one uninterrupted workflow:

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
docs/                  Product and engineering source of truth
```
