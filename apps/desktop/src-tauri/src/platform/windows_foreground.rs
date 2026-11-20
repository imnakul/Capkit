//! Names a capture after what is on screen.

use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};

/// Title of the window that has focus, which for a browser is the page title and
/// for other apps the document and app name. `None` when nothing has focus or the
/// window has no title.
pub(crate) fn foreground_window_title() -> Option<String> {
    // SAFETY: both calls only read window state; the buffer outlives the call and its
    // length is passed, so Windows cannot write past it.
    unsafe {
        let window = GetForegroundWindow();
        if window.is_invalid() {
            return None;
        }
        let mut buffer = [0_u16; 256];
        let length = usize::try_from(GetWindowTextW(window, &mut buffer)).ok()?;
        let title = String::from_utf16_lossy(buffer.get(..length)?);
        (!title.trim().is_empty()).then_some(title)
    }
}
