# CapKit Privacy Policy


Last updated: 27 October 2026


CapKit is developed by Nakul Srivastava and published by JagatBandhu. This policy describes CapKit 0.3.0 for Windows and its local capture, editing, recording and export features.


## What CapKit processes
CapKit processes screen pixels, selected images, annotations, file paths and settings on your computer. If you enable recording inputs, it can also process microphone audio, speaker/system audio, camera video, and cursor position or click information. Device access is subject to Windows privacy settings and available device permissions. No CapKit account is required for these features.


## Screenshots and temporary files
The normal screenshot destination is the CapKit folder in your Windows Pictures folder, unless you choose another location. Frozen-screen selection temporarily writes a full-display source image under `%TEMP%\CapKit\{session-id}`, even if you later select and export only a smaller region. Temporary pin images, scrolling-capture outputs and thumbnails can also be created. Normal-session cleanup is best effort; crashes or interrupted sessions can leave temporary files behind. CapKit does not promise secure deletion or that screen content is never written to disk.


## Recordings
The normal recording destination is the CapKit folder in your Windows Videos folder, unless changed. A recording folder can contain screen video, separate microphone or system-audio tracks, a camera-video track, cursor/click data, and source thumbnails. Optional inputs are used when you enable them. Keep recordings only in folders you trust and review them before sharing.


## Settings and editing data
Native folder preferences are stored in a local CapKit configuration file, normally `%APPDATA%\CapKit\storage.json`. WebView local application storage keeps settings, recording-library metadata, Studio scenes, Showcase styles and compositions, and Screen Draw state. These are ordinary local data stores; CapKit does not claim they are encrypted. Windows packaged-app storage paths may differ or be redirected.


## Clipboard
Copy actions write the resulting image to the Windows clipboard. User-initiated paste into Showcase can read an image from the clipboard. This release does not provide background clipboard-history collection. Windows and other applications can access or synchronize clipboard contents according to their own settings.


## Network and third-party components
Core screenshot capture, editing, drawing, recording and export run locally and do not require a CapKit cloud account. This release does not include a built-in capture-upload service, application analytics, or automatic remote diagnostic uploads in the inspected production application. Microsoft Edge WebView2 and Windows are external components with their own update, diagnostic and privacy settings. Files saved in a folder managed by OneDrive or another synchronization service may be synchronized by that service. Those services operate under their own terms and controls.


## Your choices and deletion
Choose capture and recording folders in Settings, disable optional recording inputs, and stop capture or recording when you no longer need it. Close CapKit before manually removing its local data. Delete unwanted screenshots, recording folders and temporary CapKit files through File Explorer. Removing a recording from CapKit's library currently removes its library entry, not necessarily the underlying recording files; delete those files separately if required. Clearing local application/WebView storage removes saved preferences and editing metadata but does not by itself delete exported media. Uninstalling should not be relied on to remove every output, temporary file or setting. Editing or redacting an export does not guarantee that original or temporary sources have been securely erased.


## Questions
Contact the developer at https://github.com/imnakul/Capkit/issues. Do not post private screenshots, recordings, device information or logs containing sensitive content in a public issue.


This policy will be updated when CapKit's data handling changes.

