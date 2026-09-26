# Capkit Design System

Desktop utility: dense, quiet, one user-selectable accent. Windows 11 is supported; macOS, Ubuntu and Fedora are provisional.

This file was created by the navigation-and-settings-tabs change, which needed a `Component patterns` record. Everything below is taken from the components as they exist in `apps/desktop/src/components`; it documents current practice rather than adding new rules.

## Foundations

- **Surfaces:** page `#f4f4f1` (dark `#242523`), sidebar `#ebecea` (dark `#20211f`), cards white at low alpha (dark `white/5`), controls `#30312e` (dark `#2b2c29`).
- **Accent:** `--snaphub-accent`, user-selectable, drives active tools, focus rings, selection handles and new annotations. Record uses `#ff5b4d`; destructive text is red; warnings are amber.
- **Borders:** low-opacity (`stone-300/80`, `white/8`, `white/9`) rather than solid grays, so structure reads without shouting. Dark mode leans on borders instead of shadows.
- **Type:** Plus Jakarta Sans for interface text, JetBrains Mono for shortcuts, dimensions and color values. 11 px uppercase eyebrows with wide tracking, 12–13 px body and controls, 14 px emphasis, 20–22 px page titles with `-0.03em` tracking, one `h1` per view and `h2` section titles.
- **Density:** 4 px base unit, 20–22 px page padding, 12–14 px control padding, `rounded-md` controls and `rounded-lg` cards, concentric nested radii.
- **Focus:** every interactive control uses `outline-none` with `focus-visible:ring-2 focus-visible:ring-[var(--snaphub-accent)]`.
- **Motion:** no animation library in the desktop app, so motion is CSS transitions on `transform` and `opacity` only — interruptible and off the main thread. Press feedback is `active:scale-[0.97]`; indicators glide at 200–220 ms on `cubic-bezier(0.2, 0, 0, 1)`; hover color and opacity stay at 150 ms or less. Every transition has a static cue and is removed under `prefers-reduced-motion: reduce` with `motion-reduce:transition-none`.

## Component patterns

- Dashboard sections use a sliding-pill tab bar (`SettingsTabs`) and disclosure sections; reuse them instead of creating new tab or accordion patterns.
- Settings live in four task tabs — General, Screenshots, Screen Draw, Shortcuts — and any new section or control goes into one of them. Each tab opens with its first section expanded, and the tab bar is sticky under the page header.
- Sidebar items are 13 px semibold rows with a 15 px icon; the active row gets the accent icon color plus `bg-black/7` (dark `white/9`).
- Page headers are an uppercase eyebrow, a 20–22 px title, one line of supporting copy and a right-aligned primary action, closed by a single bottom border.

## Windows

- Minimum window 900×640. Long lists scroll inside their own region rather than the page.
- Escape cancels capture, menus and recording; menus and popovers close on outside pointerdown and on Escape.
