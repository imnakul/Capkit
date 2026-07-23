# Product Brief

## Product definition

**Confirmed:** CapKit is a lightweight, always-available desktop toolkit to capture, record, and showcase, currently supported on Windows 11.

**Confirmed tagline:** The lightweight desktop toolkit to capture, record, and showcase.

**Provisional:** macOS, Ubuntu, and Fedora are rollout targets after their native adapters, packaging, and acceptance matrices are complete.

Its defining experience is not a main application window. The selected area of the frozen desktop becomes the workspace, and completion returns the user directly to the task they were doing.

## Problem

Built-in screen snipping is immediate but omits common professional actions such as blur, secure pixelation, pinning, rich arrows, counters, and flexible completion behavior. Feature-dense tools solve those needs but create setup, menu, storage, and cognitive overhead that interrupts flow.

CapKit serves the gap between those extremes: a calm system utility with enough depth at the moment it is needed.

## Primary audience

**Confirmed:** Builders and small teams:

- Developers explaining implementation or bugs
- Designers reviewing interfaces
- QA engineers documenting reproduction steps
- Support teams answering customers
- Educators producing visual instructions
- Product and operations teams communicating asynchronously

## Positioning

- **Windows Screen Snip:** match immediacy; add professional annotation, redaction, pinning, and workflow flexibility.
- **Flameshot:** preserve contextual editing; improve visual polish, adaptable layouts, detection, cross-platform consistency, and later presentation assets.
- **CleanShot:** adapt its polished capture-to-share philosophy to a broader platform set, while launching with a smaller local-first core.
- **ShareX:** do not compete on the number of destinations, tasks, or menus. Compete on speed, discoverability, restraint, and predictable defaults.

## Product principles

1. **Stay in context.** Never make users navigate into the application for routine capture.
2. **One obvious next action.** Default behavior must work before customization.
3. **Depth on demand.** Contextual controls appear after choosing a tool.
4. **Local by default.** Capture and editing work offline without an account.
5. **Light while idle.** Resident code registers shortcuts and tray behavior; heavy surfaces load on demand.
6. **Redaction must be real.** Protected pixels cannot be recovered from exported output.
7. **Platform truth over false sameness.** Explain OS permission or compositor limitations instead of silently failing.

## Success measures

- Median time from shortcut to visible capture surface near 100 ms on reference hardware.
- A new user can capture, annotate, and copy without opening settings or documentation.
- Most successful capture sessions finish without opening overflow controls.
- Idle CPU is effectively zero and idle memory stays within the documented budget.
- Cancellation always restores the prior working state without files, clipboard changes, or lingering windows.
