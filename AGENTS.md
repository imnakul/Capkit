# Capkit Agent Rules

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

## Project profile

- Preset: 6 — Custom (set 2026-09-24)
- Project types: desktop application, landing page
- Collaboration: solo
- SocratiCode: requested; unavailable and not indexed in the current tooling
- Tests: Y · Logger+IDs: N · Changelog+Decisions: Y · Public changelog: Y · docs/: Y
- Git: auto-commit Y · auto-push N · branches: feature branches + PRs
- Analytics: none · Feature flags: Y · CI on every PR: Y · Error tracking: none · Review bot: none
- Perf suggestions: suggest
- Legacy patterns to avoid: none identified; follow the current repository conventions
- Local-only profile: this repository keeps personal working preferences out of tracked project files.

## Tech stack

- Workspace: pnpm 11.14.0, TypeScript, strict mode
- Desktop: Tauri 2.11, Rust 2024, React 19, Vite 8, Tailwind CSS 4, Zod 4
- Landing page: Next.js 16.2 App Router, React 19, TypeScript 5, Tailwind CSS 4, Framer Motion 12
- Tooling: ESLint 9, Vitest 4, Testing Library, Cargo
- Targets: Windows 11 supported; macOS, Ubuntu, and Fedora provisional
- CI: `ci.yml` on every PR to master; `release.yml` publishes a GitHub Release when the version changes on master

## Commands

| Task               | Command                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Install            | `pnpm.cmd install`                                                                            |
| Desktop dev        | `pnpm.cmd dev`                                                                                |
| Desktop native dev | `pnpm.cmd tauri dev`                                                                          |
| Desktop build      | `pnpm.cmd build`                                                                              |
| Typecheck          | `pnpm.cmd typecheck`                                                                          |
| Lint               | `pnpm.cmd lint`                                                                               |
| Lint and fix       | `pnpm.cmd lint:fix`                                                                           |
| Tests              | `pnpm.cmd test`                                                                               |
| Native format      | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check`                         |
| Native lint        | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings` |
| Native tests       | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`                                |
| Landing dev        | `pnpm.cmd --filter @snaphub/landing-page dev`                                                 |
| Landing build      | `pnpm.cmd --filter @snaphub/landing-page build`                                               |
| Landing typecheck  | `pnpm.cmd --filter @snaphub/landing-page typecheck`                                           |
| Landing lint       | `pnpm.cmd --filter @snaphub/landing-page lint`                                                |
| Store package      | `pnpm.cmd bundle:store`                                                                       |
| Store package test | `pnpm.cmd test:store`                                                                         |
| Version bump       | `pnpm.cmd version:bump minor`                                                                 |
| Version check      | `pnpm.cmd version:check`                                                                      |

## Project docs

| File                                                   | Read when                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| `CHANGELOG.md`                                         | Resuming work or investigating a regression                          |
| `CHANGELOG-PUBLIC.md`                                  | Shipping a user-visible change                                       |
| `docs/DECISIONS.md`                                    | Recording a setup or engineering tradeoff                            |
| `docs/PLAN.md`                                         | Starting or resuming a task                                          |
| `docs/FEATURES.md`                                     | Touching a feature or reviewing feature state                        |
| `docs/NOTES.md`                                        | Debugging unusual behavior or integrating an API                     |
| `docs/DESIGN.md`                                       | Before a UI change                                                   |
| `docs/decision-log.md`                                 | Before a product or architecture decision; canonical product history |
| `docs/feature-roadmap.md` and `docs/current-status.md` | Touching a feature; intended scope and actual implementation         |
| `docs/brand-marketing-handoff.md`                      | Brand and visual-direction work                                      |

The repository `AGENTS.md`, `README.md`, and `docs/README.md` remain the shared source of truth. Follow their stricter requirements when they differ from this local profile.
