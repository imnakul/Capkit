# What's new

User-facing changes only, grouped by date under Added / Improved / Fixed.

## Unreleased — 2026-11-20

### Fixed

- Reopening CapKit from the system tray after closing it no longer shows a second title bar and a pale, washed-out window.

## 0.5.0 — 2026-11-20

### Added

- Star your favourite screenshots. Hover a screenshot and press the star; it fills in and stays visible. Use the All | Favourites switch at the top of the Screenshots page to see only your favourites.
- Screenshots are now named after the page or app you captured, with the date and time, for example `GitHub - capkit - Google Chrome, Nov 20, 11:52 AM`. Older captures that were all called "CapKit" now show a readable date instead.
- Recordings show a thumbnail of their first frame instead of a black box.
- Copy and favourite buttons have a soft click sound and a gentle press effect. The copy icon turns into a check the moment you press it. Settings switches get the same sound and press effect.
- A new left-hand menu groups your work: Screenshots and Screen record at the top, Showcase under Studio, and Settings at the bottom. A soft highlight glides to whatever you point at.

### Improved

- A fresh glass look across the dashboard: frosted buttons and cards that follow your accent colour in light and dark, Geist and Geist Mono as the fonts everywhere, and one consistent set of icons.
- The custom accent colour can be changed by clicking the swatch, and the CapKit logo and tagline are back on the dashboard.
- Screenshot, recording and note cards are the same size, fill each row evenly and no longer leave an odd gap on the right. Screenshot cards no longer repeat the date twice.
- Notes (now called Page notes) show the title and the website on one line, with a shorter preview.
- Settings content now fades softly under the tabs as you scroll instead of overlapping them.
- The page no longer jumps sideways when you switch between tabs of different length.
- "Record" is now called "Screen record". The minimize, maximize and close buttons are visible in light mode.
- Refresh on the Screenshots page now visibly spins, and the file count is no longer stuck at 200 (up to 1000 are shown).
- Your save folder is now `PicturesCapKit`. If you used the old Snaphub or ShotHub folder, CapKit renames it for you and keeps your files.

## 0.4.0 — 2026-11-20

### Added

- The CapKit Inspector extension now uses the accent colour you chose in CapKit.
- Developer tools (off by default): link the CapKit Inspector browser extension to see exact page elements, find sensitive text precisely, and pin numbered notes on a page. Notes copy as Markdown with a screenshot and are kept in a new Notes tab.
- CapKit can update itself. It checks GitHub once when it starts, tells you when a new version is ready, and installs only when you click Install and restart. You can turn the check off in Settings → General. Install 0.4.0 by hand once; later versions arrive through the app.
- Copy any capture from the Screenshots page, and drag it straight into another app.
- Capture toolbar groups open when you click them and remember the last tool you used in each group.
- Settings → Screenshots lets you show or hide each finishing action (Copy, Save, Pin, Showcase and more) and choose whether each tool and action sits in the horizontal or the vertical toolbar.

### Improved

- The dashboard has a calmer look: one accent-tinted palette in light and dark, glass behind the window on Windows 11, consistent page headers, and quieter motion. Settings sections open from anywhere on their row, show their current value while closed, and animate smoothly.

- Press 1–9 and 0 to pick a tool in the capture toolbar, and V for Select. Each button shows its number in the corner, like C, S and A.
- Copy, Save and Copy & Save (C, S, A) now deliver your note when the capture has pins, so the separate note buttons are gone.
- Click a note pin with the Select tool to edit its comment, and drag the pin to move its comment with it.
- The capture toolbar is a single card, with the colour and size row only for tools that use them.
- Only one CapKit runs at a time; opening it again brings the existing window forward.
- Shapes, arrows, pen strokes and highlights can be resized: select one and drag any of its eight handles, or focus a handle and use the arrow keys.
- The highlight that follows your pointer before you select now glides smoothly from one area to the next. It jumps instantly when Windows animation effects are off.
- Folder paths in Settings no longer start with `\\?\`.
- The capture overlay fades in and out. The other overlay animations and their setting are gone.
- Drawings stay where they are on screen when you move or resize the capture area.

### Fixed

- The CapKit Inspector extension reconnects by itself after CapKit restarts, instead of staying disconnected until you open its popup.
- The show/hide switches in Settings → Screenshots (tools and finishing actions) respond to clicks again.
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
