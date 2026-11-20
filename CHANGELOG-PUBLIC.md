# What's new

User-facing changes only, grouped by date under Added / Improved / Fixed.

## Unreleased — 2026-11-19

### Added

- The CapKit Inspector extension now uses the accent colour you chose in CapKit.
- Developer tools (off by default): link the CapKit Inspector browser extension to see exact page elements, find sensitive text precisely, and pin numbered notes on a page. Notes copy as Markdown with a screenshot and are kept in a new Notes tab.
- CapKit can update itself. It checks GitHub once when it starts, tells you when a new version is ready, and installs only when you click Install and restart. You can turn the check off in Settings → General.
- Copy any capture from the Screenshots page, and drag it straight into another app.
- Capture toolbar groups open when you click them and remember the last tool you used in each group.
- Settings → Screenshots lets you show or hide each finishing action (Copy, Save, Pin, Showcase and more) and choose whether each tool and action sits in the horizontal or the vertical toolbar.

### Improved

- The capture toolbar is a single card, with the colour and size row only for tools that use them.
- Only one CapKit runs at a time; opening it again brings the existing window forward.
- Shapes, arrows, pen strokes and highlights can be resized: select one and drag any of its eight handles, or focus a handle and use the arrow keys.
- The highlight that follows your pointer before you select now glides smoothly from one area to the next. It jumps instantly when Windows animation effects are off.
- Folder paths in Settings no longer start with `\\?\`.
- The capture overlay fades in and out. The other overlay animations and their setting are gone.
- Drawings stay where they are on screen when you move or resize the capture area.

### Fixed

- Saved notes show their screenshot again in the Notes tab.
- Click a saved note to read all of it: the full screenshot and every pin's comment and details.
- Detection works again when a tiling window manager such as FancyWM is running. Before, it found nothing in tiled windows.
- Screenshots in Aside now highlight exact page elements when the CapKit Inspector extension is linked.
- Detection mode finds parts of web pages in Chrome, Edge and other Chromium browsers again, not just the browser's own buttons.

## Earlier — 2026-10-29

### Added

- Pick a colour while selecting: press I to copy the colour under the pointer as a hex code, or Shift+I for RGB.
- Copy text from a capture. It's read on your PC with Windows' built-in text recognition, so nothing is uploaded.
- Find sensitive text: CapKit spots things like API keys, card numbers, emails and phone numbers in a capture, and you choose which to black out.
- Save & Showcase sends a capture straight to Showcase. Star a style there to apply it to every capture you send.
- Recordings can show the shortcuts you press and your clicks as on-screen labels. It's off by default, and CapKit never records what you type.
- Zoom can follow your typing, so typed text stays readable in recordings.
- Export a recording to fit under 25 MB or 10 MB, for places with upload limits.

### Improved

- Open at startup works in the Microsoft Store version, using Windows' own startup list.
- If you turned CapKit off in Windows' startup settings, CapKit's Settings now tells you so and opens the right Windows page to turn it back on.
- The Store version asks for camera and microphone access through Windows' standard prompts.

## 0.3.0 — 2026-09-28

### Fixed

- Recordings play back with their real duration, in the Record list and in Studio.
- The camera bubble closes when recording stops or is discarded, clips cleanly to its circle, rounded or square shape, and drags anywhere.

### Added

- The camera records as its own track: move it freely in Studio, toggle it, and keep it in MP4 and GIF exports.
- Native frame rate: record at your monitor's refresh rate on fast displays.
- Recordings save to Videos\CapKit, changeable with choose, open and reset in Settings.
- The recorder is a single draggable row that stays where you put it.

### Improved

- The Recordings grid shows four columns on wide windows, like Screenshots.

## 0.2.1 — 2026-09-28

### Fixed

- The recorder opens on the first click.
- The source previews are visible.
- The Screenshots page is full width.
- The cursor shows in recordings.
- Camera access can be retried.

### Added

- Draw an area to record.
- Choose the microphone and speaker.

## 0.2.0 — 2026-09-26

### Added

- Select tool in Screen Draw: move, resize and delete what you've drawn. It's now the default.
- Copy & Save to selected-region completion, with a configurable `A` shortcut by default. It copies the finished image first and saves the same rendered pixels to your configured folder.
- Save the whole screen with your Screen Draw annotations by pressing S.

### Improved

- Capture opens faster and closes instantly.
- Settings are organized into General, Screenshots, Screen Draw and Shortcuts tabs.
- Record now holds your recordings and editing; Dashboard is renamed Screenshots.
- Drag pinned images anywhere with the handle in their corner.

### Fixed

- Closing capture no longer leaves a black screen.
- Text in Screen Draw now appears where you click.
- Recording opens again from Record and its shortcut.
- The capture screen no longer shifts slightly when it opens, and saved screenshots match the selected area exactly.
- Capture no longer flashes dark when it opens.
- The Screen Draw laser follows the cursor smoothly and fades out after you release it.

### Removed

- Click-through for pinned images.

## 2026-09-25

### Added

- Added Copy & Save to selected-region completion, with a configurable `A` shortcut by default. It copies the finished image first and saves the same rendered pixels to your configured folder.
- Save the whole screen with your Screen Draw annotations by pressing S.

### Fixed

- The capture screen no longer shifts slightly when it opens, and saved screenshots match the selected area exactly.
- Capture no longer flashes dark when it opens.
- The Screen Draw laser follows the cursor smoothly and fades out after you release it.
