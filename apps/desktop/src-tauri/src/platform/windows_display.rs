use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
};

use crate::{error::SnaphubError, platform::WindowCaptureExclusionBackend};

/// Hides a window from every screen-capture path on Windows.
///
/// `WDA_EXCLUDEFROMCAPTURE` removes the window from Windows Graphics Capture,
/// DXGI desktop duplication, `PrintWindow`, and `BitBlt` while leaving it fully
/// visible and interactive to the user. It requires Windows 10 2004 (build
/// 19041); CapKit already targets Windows 11.
///
/// The affinity belongs to the live window and does not survive destruction, so
/// callers reapply it whenever a window is rebuilt.
pub struct WindowsDisplayBackend;

impl WindowCaptureExclusionBackend for WindowsDisplayBackend {
    fn set_excluded(&self, hwnd: isize, excluded: bool) -> Result<(), SnaphubError> {
        let affinity = if excluded {
            WDA_EXCLUDEFROMCAPTURE
        } else {
            WDA_NONE
        };
        // SAFETY: the handle comes from Tauri's live window registry and is used
        // only for the duration of this call.
        unsafe { SetWindowDisplayAffinity(HWND(hwnd as *mut core::ffi::c_void), affinity) }
            .map_err(|error| SnaphubError::Window(error.to_string()))
    }
}
