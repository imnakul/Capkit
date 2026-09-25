# Selected-region Copy & Save — spec

- Tier: complex · Snapshot: `b575b90` (`git rev-parse --short HEAD`), 2026-09-25 15:35 IST · Status: draft
- This document specifies implementation only. No feature code is changed by this task.

## Goal and user story

As a person editing a selected screenshot, I want one action that puts the finished image on my clipboard and saves that same image to my configured folder, so I can paste immediately and keep a local copy without completing two captures.

## Scope

- Add a **Copy & Save** button to the standard selected-region completion rail, between Copy and Save. Add a configurable in-overlay, unmodified single-key shortcut in Settings, default `A`.
- Extend the selected-region completion IPC and native service. Copy to the clipboard first, then atomically save the same rendered `RgbaImage` as a PNG in the existing configured directory. Preserve the selected-region session on any failure and emit the saved-capture event only after a committed save.
- Resolve the current Arrow tooltip advertising `A` while `A` becomes the completion shortcut: remove the Arrow `A` hint from the capture toolbar catalog. Do not make `A` select Arrow. Leave Arrow available by its button.

## Out of scope

- Direct global Capture & copy / Capture & save, full-display quick capture, scrolling capture and its preview actions, Pin, Save As, Screen Draw, a new save location, a new renderer, and a new dashboard entry type.
- Changing other annotation tool shortcuts, global shortcut registration, or save naming beyond what correctness of this operation requires.

## Current behavior and evidence

- The product's selected-region completion rail is Copy, Save, and Pin; `Escape` cancels. Completion and failure must preserve the direct overlay workflow (`docs/capture-ux-spec.md:28-32`, `docs/capture-ux-spec.md:83-92`, `docs/capture-ux-spec.md:123-133`).
- `CompletionToolbar` offers those three actions and calls completion on both `onPointerUp` and `onClick`; it has a `busy` disabled state (`apps/desktop/src/components/CompletionToolbar.tsx:19-52`, `apps/desktop/src/components/ToolButton.tsx:21-39`). This can submit twice before React commits `busy`.
- `App.handleComplete` has a state-based `busy` check, sets a message, calls `completeCapture`, and clears the session on success; it retains the overlay on catch. Keyboard dispatch checks Copy before Save and ignores editable text targets, but does not exclude scrolling mode (`apps/desktop/src/App.tsx:446-511`). The rail is mounted only after a selection and receives current shortcut values (`apps/desktop/src/App.tsx:603-635`). Scrolling preview is a separate component (`apps/desktop/src/App.tsx:639-648`).
- Settings schema/defaults store `captureModeCopy: C` and `captureModeSave: S`; old saved preferences receive schema defaults (`apps/desktop/src/domain/settings.ts:157-165`, `apps/desktop/src/domain/settings.ts:229-257`). Settings records keys through a shared shortcut flow, and the capture-mode rows are under “While in capture mode” (`apps/desktop/src/components/dashboard/SettingsView.tsx:87-116`, `apps/desktop/src/components/dashboard/SettingsView.tsx:357-373`). `updateGlobalShortcuts` sends only five global fields to Rust; capture-mode keys remain local (`apps/desktop/src/lib/tauri.ts:43-70`).
- Arrow advertises `A` from `toolbarCatalog` and shows that hint in the annotation toolbar, although the capture keyboard handler does not select tools (`apps/desktop/src/components/toolbarCatalog.ts:32-48`, `apps/desktop/src/components/AnnotationToolbar.tsx:195-202`, `apps/desktop/src/App.tsx:474-505`).
- Frontend completion actions are `copy`, `save`, `save-as`, and `pin`; the IPC result validates `{action, outputPath}` (`apps/desktop/src/domain/capture.ts:58-59`, `apps/desktop/src/lib/tauri.ts:38-41`, `apps/desktop/src/lib/tauri.ts:131-143`). Native Serde uses kebab-case actions (`apps/desktop/src-tauri/src/domain.rs:172-195`).
- Native `CaptureService::complete` validates the session and scene, renders once, performs one output operation, then removes the session (`apps/desktop/src-tauri/src/services/capture.rs:162-216`). `render_output` crops in physical pixels and rasterizes annotations (`apps/desktop/src-tauri/src/services/capture.rs:570-590`); `save_atomic` writes a partial PNG then renames it (`apps/desktop/src-tauri/src/services/capture.rs:946-952`). The command hides the overlay and emits `snaphub://capture-saved` for Save/Save As (`apps/desktop/src-tauri/src/lib.rs:239-261`, `apps/desktop/src-tauri/src/lib.rs:767-769`).
- Existing tests cover selected-region rail visibility and Escape, default settings/migration, settings resets, Rust crop/redaction, and scrolling actions, but not combined completion (`apps/desktop/src/App.test.tsx:11-57`, `apps/desktop/src/domain/settings.test.ts:4-49`, `apps/desktop/src/components/dashboard/DashboardPanel.test.tsx:85-100`, `apps/desktop/src-tauri/src/services/capture.rs:1012-1070`, `apps/desktop/src/components/ScrollingCapturePanel.test.tsx:31-72`).

## Proposed behavior and invariants

1. `copy-and-save` is a fifth `CompletionAction`, accepted by the TypeScript schema and Rust Serde enum. It is available only through the selected-region overlay. `CompletionResult.outputPath` is non-null on success. The frontend demo completion returns a representative path for this action, as it does for Save.
2. Validate session ID, scene version, selection, and session ownership before side effects. Render exactly once from the current immutable capture and current selection/scene. Hand that same in-memory raster to `ClipboardBackend::copy_image` and then `save_atomic` through the existing save-directory/naming service. Secure redactions are therefore identical in both outputs; never send pixel data through JSON IPC.
3. If render or clipboard fails, do not attempt a file write, emit an event, remove the session, or hide the overlay. If save fails after clipboard succeeds, report explicitly that the image **was copied but could not be saved**, keep the selection, scene and temporary source available, and emit no saved event. No final PNG should appear; clean up any `.partial` file. The clipboard write cannot be rolled back.
4. A retry after partial success must retry **save only** from the retained rendered raster. It must not rerender or write the clipboard a second time. Until retry/cancel, freeze the selection and annotation editing for that pending output; the user may instead cancel the session. Successful retry uses the same raster and completes normally. Clear the pending raster when the session is cancelled, completed, or destroyed. A save-only retry must be impossible for a different session.
5. There is at most one completion operation per session at a time. Acquire a synchronous frontend guard before invoking IPC and a native session-level in-flight guard before rendering or side effects. Pointer-up plus click, rapid shortcut repeats, and a second command from any caller cannot create two saves or clipboard writes. While pending, all completion controls and completion shortcuts are disabled. Escape remains available and must be safe if invoked during native work: cancellation marks the session for disposal, waits for the in-flight operation boundary, hides the overlay, and cannot produce a later visible stale UI update. If an output already committed before cancellation, it remains valid and receives exactly one saved event.
6. Emit `snaphub://capture-saved` exactly once per successful committed PNG, after atomic rename. Keep the existing dashboard listener/refresh contract (`apps/desktop/src/lib/tauri.ts:246-255`). Do not emit on Copy, clipboard failure, failed save, or an uncommitted partial file. If hiding the surface fails after a committed save, do not reclassify it as a save failure or offer a retry that can save twice; force recovery/hide and report a cleanup error separately.
7. The Settings value is a single unmodified `A`-`Z` or `0`-`9` key, stored uppercase. Copy, Save, and Copy & Save keys must be pairwise distinct case-insensitively. `Escape`, `Enter`, modifier chords, whitespace, and multi-key strings are rejected for these three fields. While recording, a collision shows “That key is already used by [action]. Choose another key.” and preserves all previous values. Existing persisted settings missing the new field default to `A`; existing invalid/duplicate capture-mode values are normalized on load to a deterministic distinct trio, preferring existing valid Copy, then Save, then Copy & Save, and assigning the first unused key from `C`, `S`, `A`, then alphabetical order. Apply the same validation on programmatic settings writes. Global shortcuts are unaffected.
8. The in-overlay key fires only after a usable selected region exists, with no modifiers, outside text input/contenteditable and outside scrolling capture setup/progress/preview. `A` must not trigger Arrow. `Enter` retains its existing Copy behavior. The configured key is shown on the new button and in its `aria-keyshortcuts`; changing Settings updates the active overlay through the existing settings subscription.

## States and transitions

| State | Event | Next state | User sees / side effects |
| --- | --- | --- | --- |
| No selection or drafting | `A` / rail query | Same | No Copy & Save action or output. |
| Selected, idle | Button or configured key | Rendering/copying | “Copying & saving…”; completion controls disabled; editing frozen. |
| Rendering/copying | Render or clipboard error | Selected, idle | Actionable “Could not copy this capture. Try again.” plus native diagnostic; no save or event; session intact. |
| Copied, saving | Atomic save error | Copied, save-pending | “Copied, but could not save. Retry save or press Esc to cancel.” with diagnostic; clipboard remains, no final file/event; rendered raster retained. |
| Copied, save-pending | Retry save | Saving | No new render or clipboard write; controls disabled. |
| Saving | Save error again | Copied, save-pending | Same retry state, no final file/event. |
| Saving | Atomic rename succeeds | Completed | Emit one saved event, hide surface, clear session, show subtle success/path feedback without focus theft. |
| Any in-flight phase | Duplicate button/key/IPC request | Same | Ignored/rejected; no second operation. |
| Any phase | Escape | Cancelled after safe boundary | Hide surface and release temporary resources; do not delete an already committed output. |

## Ordering contracts

- Start: frontend synchronous guard → native per-session guard → validate request and live session → render once → clipboard copy → save path → partial PNG write → atomic rename → saved event → hide and release session → frontend clears state. No event or session release before a committed save.
- Render/clipboard failure: release in-flight guard, preserve session, return a typed stage/error outcome; no pending raster is needed.
- Save failure after copy: remove failed partial, retain the raster with its session ID in native session state, release the in-flight guard, return a typed partial-success outcome. The frontend shows a retry-save state, not a generic completion failure. Retry obtains the guard, reads the retained raster, saves atomically and never calls `render_output` or `copy_image`.
- Cancellation and close: serialize against the native guard. If cancellation wins first, later completion is rejected before side effects. If completion wins, let its current atomic step finish; cancellation then closes and releases state. Ignore responses from an earlier frontend session ID/generation after closure or a new capture starts. If saving committed, emit once even when cancellation races the hide.
- Do not hold the general sessions mutex across slow rendering, clipboard, or filesystem work. A per-session state/guard should own the in-flight flag and pending raster; release it on every success/error path. Avoid holding a mutex across an `await`. Consider the service's current render-then-output-then-remove sequence (`apps/desktop/src-tauri/src/services/capture.rs:172-216`) as the starting point, not sufficient concurrency protection.

## Acceptance criteria

- **AC-1:** Given a standard selected region with annotations, when Copy & Save is clicked or its configured key is pressed, then one rendered raster is copied first, the identical pixels are saved as one PNG in the configured folder, the capture overlay closes, and exactly one saved event carries that path.
- **AC-2:** Given no selection, an in-progress selection, a focused editable field, modifiers, or scrolling capture, when the configured key is pressed, then Copy & Save does nothing. The global direct actions remain unchanged.
- **AC-3:** Given default settings, when the completion rail appears, then Copy & Save displays `A`; Settings shows the row and can record/reset it. Arrow shows no `A` tooltip and remains clickable.
- **AC-4:** Given any two of the three capture completion keys collide in mixed case, when Settings records or programmatically saves them, then the collision is rejected with the named conflict and prior values remain. Legacy settings without the new field get `A`; legacy conflicts resolve deterministically to distinct keys.
- **AC-5:** Given rendering or clipboard failure, when Copy & Save runs, then there is no save, no saved event, and the selected session remains editable and retryable with an actionable error.
- **AC-6:** Given clipboard success and save failure, when Copy & Save runs, then the clipboard contains the finished image, no final PNG/event exists, the overlay and scene remain, and Retry save reuses the exact raster without another clipboard write. Repeated save failures remain retryable and leave no `.partial` file.
- **AC-7:** Given pointer-up plus click, rapid repeated `A`, or two IPC completions for the same session, when the first is in flight, then only one render, one clipboard write, one committed file, and one saved event can occur. Resolving the existing `onPointerUp`/`onClick` double activation must preserve one successful mouse, touch, and keyboard (Enter and Space) activation for every completion rail button: Copy, Copy & Save, Save, and Pin.
- **AC-8:** Given Escape during render, clipboard, save, or partial-success retry, when work reaches a safe boundary, then the overlay closes, temporary data is released, and no stale response reopens or mutates a new session. A committed file and its event remain if commit won the race.
- **AC-9:** Given a valid source with blackout/pixelation and a non-unit display scale, when Copy & Save succeeds, then clipboard and PNG dimensions/pixels match the same native render and protected pixels are permanently rasterized.
- **AC-10:** Given an atomic save succeeded but overlay hide fails, then the file and one saved event remain, the app attempts safe surface dismissal, and the UI never presents a save retry that can create a duplicate.

## Implementation plan

1. `apps/desktop/src/domain/capture.ts:58-59`, `apps/desktop/src/lib/tauri.ts:38-41,131-143`, `apps/desktop/src-tauri/src/domain.rs:172-195`: add the action to both contracts and preserve runtime validation. Use an explicit stage/partial-success response or typed error for copy-success/save-failure; do not force the UI to infer it from a string.
2. `apps/desktop/src-tauri/src/services/capture.rs:39-61,162-216,473-498,946-952`: add per-session in-flight and pending-output ownership, combined completion, save-only retry, cleanup on cancel/remove, and partial-file cleanup. Reuse `render_output`, configured save path, and `save_atomic`; make filename collision handling safe if concurrent saves produce the same millisecond name. Keep quick capture and scrolling branches unchanged.
3. `apps/desktop/src-tauri/src/lib.rs:239-261,767-769`: expose the retry through a scoped command if needed, emit only after committed save and exactly once, and separate post-commit hide failure from output failure. Register any new command in the existing invocation list. Preserve the current capture-window recovery contract.
4. `apps/desktop/src/App.tsx:59-84,423-511,603-653`, `apps/desktop/src/components/CompletionToolbar.tsx:5-53`: put the new button between Copy and Save, route keyboard and click through one synchronous guard, model copy/save/retry/error states, and use the rail placement to prevent the fourth button from clipping at viewport edges. Keep Escape working. Remove duplicate `onPointerUp` submission or ensure it and `onClick` are one logical activation, without breaking mouse, touch, or keyboard activation of any rail action. Keep status/error accessible and do not leave “Finishing capture” as the only failure message.
5. `apps/desktop/src/domain/settings.ts:157-165,229-277,303-318`, `apps/desktop/src/components/dashboard/SettingsView.tsx:87-116,151-202,357-373`: add `captureModeCopyAndSave`, migration and pairwise validation, capture-mode recording error copy, row, inline reset, and section reset. Ensure local keys never enter native global shortcut registration (`apps/desktop/src/lib/tauri.ts:54-70`).
6. `apps/desktop/src/components/toolbarCatalog.ts:32-37`: remove Arrow's `shortcut: "A"` so the tooltip stops claiming that key. Do not remove the Arrow tool.
7. Update the relevant capture/product docs, local feature inventory, current status, decision log, and changelogs when implementing, per `AGENTS.md` and `docs/README.md`. This spec task itself changes only this file.

## UI details

- Rail: `Copy`, `Copy & Save`, `Save`, `Pin`, with the new key badge. Reuse `ToolButton`, existing rail styling, focus ring, and icon system; give the combined action a distinct icon or composition rather than borrowing Copy or Save unchanged. Its accessible name is “Copy & Save”; its shortcut must be exposed using valid `aria-keyshortcuts`.
- Settings row: label “Copy & Save selection”; description “Copy and save the edited capture, then exit”. Put it after Copy selection and before Save selection. Reset label: “Reset Copy & Save selection shortcut”. Validation appears in the existing polite shortcut message region and names the conflicting action.
- Pending text: “Copying & saving…”; partial error: “Copied, but could not save. Retry save or press Esc to cancel.”; retry button: “Retry save”. Include the native diagnostic in readable text, with no private pixels or clipboard content in logs. A complete save gives subtle feedback and does not steal focus.
- While in progress, disable the completion buttons and prevent their keyboard actions; keep Escape. In partial-success state, freeze selection/annotation controls and make Retry save the primary action. Focus moves to the retry action when the error appears; visible focus and a polite live status are required. Respect reduced motion; use the existing tokens and placement. Check 320 px and near-edge selections for no clipping.

## Skills to load

`spec-implement`, `desktop-app`, `frontend-ui`, `api-integration`, and `testing`. Read the repository instructions and relevant docs before changing behavior.

## Test matrix

| AC / risk | Level | Test file | Deterministic scenario |
| --- | --- | --- | --- |
| AC-1, AC-9 | Rust service | `apps/desktop/src-tauri/src/services/capture.rs` tests | Fake capture, clipboard, and save directory; annotated/scale-sensitive source; assert operation order, one render via a test seam, and clipboard pixels equal decoded PNG pixels. |
| AC-2, AC-3 | React feature | `apps/desktop/src/App.test.tsx`, `apps/desktop/src/components/AnnotationToolbar.test.tsx` | Select via pointer events; verify rail/key; press key without selection, during draft, in editable, with modifiers, and with scrolling preview; verify Arrow tooltip lacks `A`. |
| AC-3, AC-4 | Settings | `apps/desktop/src/domain/settings.test.ts`, `apps/desktop/src/components/dashboard/DashboardPanel.test.tsx` | Missing field defaults, all pairwise/mixed-case collisions, invalid keys, persisted conflict repair, record/reset and error message. |
| AC-5, AC-6 | Rust + React feature | service tests and `App.test.tsx` | Fake render/clipboard/save errors; assert no wrong side effect, retained session/scene, retry-save only and no partial PNG. Use deferred promises for UI state. |
| AC-7 | React + Rust | `App.test.tsx`, service tests | For each Copy, Copy & Save, Save, and Pin button, simulate mouse pointer-up/click, touch pointer-up/click, and keyboard Enter/Space; assert one activation per gesture. Fire repeated `A` before deferred IPC settles and invoke service concurrently through a barrier; assert one output chain. |
| AC-8, AC-10 | React + Rust command/service | `App.test.tsx`, native tests | Resolve cancellation before/after controlled commit; stale promise after new session; injected hide error after commit; assert event count, cleanup and no duplicate retry. |

Tests should exercise the user action boundary, not merely schema helpers. Use temporary per-test directories and fake backends; do not depend on the real OS clipboard or display.

## Verification

Implementer must run the repository's required checks after code changes:

```powershell
pnpm.cmd typecheck
pnpm.cmd lint:fix
pnpm.cmd test
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm.cmd build
```

Run focused relevant tests during development with `pnpm.cmd --filter @snaphub/desktop test -- <test path>` only if that package script supports arguments; otherwise use `pnpm.cmd test` from the Commands table. Build is required because this changes rendering, settings, and IPC. Do not weaken checks.

## Manual checks

- On Windows 11, capture a selected region on a mixed-DPI or secondary display, annotate and redact it, invoke the new button and key, paste into an image app, and compare dimensions/pixels with the saved PNG. Confirm the folder/dashboard lists one item after success.
- Use keyboard-only navigation and a screen reader for the rail, Settings recording conflict, busy state, partial-success announcement, Retry save, and Escape. Check the rail near all screen edges and at 320 px equivalent width; check reduced motion.
- Force an unwritable save directory and clipboard failure separately in a safe test environment. Confirm retry behavior, no stray `.partial`, no blocking overlay after Escape, and no duplicate entries. These hardware/accessibility checks remain unverified by this spec-only task.

## Facts, decisions, assumptions

- **Confirmed:** Current selected-region action and native export architecture are as cited above. Existing Copy and Save in-overlay defaults are `C` and `S`; the configured native save folder and saved event already exist.
- **Confirmed for this feature:** Copy & Save applies only to the standard selected-region overlay; its default key is `A`; copy precedes atomic save; one rendered image feeds both outputs; failure retains the session.
- **Provisional implementation decision:** A partial save failure retains the raster and exposes a save-only retry, preventing duplicate clipboard writes. The native session owns this transient image, and cancellation releases it. This satisfies the existing retry contract (`docs/capture-ux-spec.md:130-133`).
- **Provisional implementation decision:** Remove Arrow's nonfunctional `A` tooltip instead of assigning a replacement tool key. Reject collisions among the three completion keys rather than silently reassigning a user's other action. This keeps key behavior and labels aligned.
- **Provisional implementation decision:** Normalized unmodified alphanumeric keys make keyboard dispatch and Settings recording deterministic. Existing invalid/duplicate stored settings are repaired in the stated priority order on load.

## Open questions

None blocking. If the implementer finds that the command cannot distinguish a committed save from a hide failure, preserve the committed output and event and report the smallest required contract adjustment before changing unrelated workflows.

## Implementer report format

For each AC-1 through AC-10: done / partial / not done, with final `file:line` or test name. Then list deviations, open questions, checks with pass/fail and reason, files changed, and manual checks still required.

## Exact handoff prompt

```text
Read docs/specs/capture-copy-and-save.md at snapshot b575b90. Load the skills listed in it and the spec-implement skill. Implement the spec exactly in the selected checkout, first checking for changes since the snapshot. Follow AGENTS.md and relevant docs. Do not broaden the feature to global direct capture or scrolling capture. Run the verification commands in the spec and report in the format at its end.
```

## Handoff retro

Fill in after implementation: what the implementer got wrong or asked about, and which gap in this spec caused it.
