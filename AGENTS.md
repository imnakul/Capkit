# Snaphub Agent Rules

These instructions apply to every change in this repository.

## Source of truth

Read [README.md](README.md) and the relevant document in [docs](docs) before changing behavior. Update documentation in the same change whenever a decision, interface, user flow, feature phase, performance budget, or commercial assumption changes.

Use these labels consistently:

- **Confirmed:** approved product or engineering direction.
- **Provisional:** a working assumption that requires validation.
- **Think Later:** deliberately excluded from the active phase.

## Product boundary

Phase 1 must preserve the direct workflow: shortcut, select, edit in place, complete, disappear. Do not introduce a dashboard, local library, account requirement, cloud dependency, full editor window, or mandatory telemetry into the Phase 1 capture path.

The resident process must remain small. Load capture, editing, scrolling, and export workers only when invoked. Do not add polling loops.

## Engineering rules

- Strict TypeScript. No `any`. Avoid assertions; explain unavoidable assertions inline.
- Explicit return types for functions and React components.
- Runtime-validate IPC and external inputs with Zod on the TypeScript side and typed Serde structures in Rust.
- Keep UI, domain state, and platform integration separate.
- Keep platform-specific code behind Rust traits in `platform` modules.
- Preserve physical-pixel and logical-coordinate distinctions.
- Redaction exports must permanently rasterize protected regions.
- Interactive controls require semantic elements, accessible names, visible focus, and keyboard behavior.
- Use Tailwind utilities for UI styling; reserve CSS for global tokens or capabilities Tailwind cannot express clearly.
- Add tests for geometry, state transitions, serialization, keyboard flows, and platform boundary behavior.

## Required verification

Before declaring a code task complete, run and fix all failures from:

```powershell
pnpm.cmd typecheck
pnpm.cmd lint:fix
pnpm.cmd test
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Also verify affected components, multi-monitor/DPI-sensitive geometry, loading, empty, error, disabled, success, cancellation, and keyboard states.

