//! Frosted glass behind the dashboard window.
//!
//! The window is transparent; this asks the compositor to blur whatever sits
//! behind it, and the page paints translucent, accent-tinted surfaces on top.
//! Blurring is done by Windows, so it costs this process nothing per frame.
//!
//! It uses the accent policy (`SetWindowCompositionAttribute`) rather than the
//! documented system backdrop (Mica, or `DWMSBT_TRANSIENTWINDOW` acrylic): those
//! drop to a flat colour whenever the window loses focus, and the dashboard is
//! unfocused whenever the user is capturing. The accent policy keeps blurring
//! regardless, on Windows 10 as well as 11.

use std::ffi::c_void;

use windows::{
    Win32::{
        Foundation::HWND,
        System::LibraryLoader::{GetModuleHandleW, GetProcAddress},
    },
    core::{BOOL, s, w},
};

/// `WCA_ACCENT_POLICY`.
const ACCENT_POLICY: u32 = 19;
/// `ACCENT_ENABLE_ACRYLICBLURBEHIND`: blur plus the acrylic noise layer.
const ACCENT_ACRYLIC: u32 = 4;
/// `0xAABBGGRR`, nearly clear. The real tint is painted by the page, so a
/// change of accent or theme is a repaint rather than another call here.
const NEARLY_CLEAR_TINT: u32 = 0x10_10_10_10;

#[repr(C)]
struct AccentPolicy {
    state: u32,
    flags: u32,
    gradient: u32,
    animation: u32,
}

#[repr(C)]
struct CompositionData {
    attribute: u32,
    data: *mut c_void,
    size: usize,
}

type SetWindowCompositionAttribute = unsafe extern "system" fn(HWND, *mut CompositionData) -> BOOL;

/// Blurs the desktop behind `hwnd`. Returns whether the blur took; when it did
/// not, the page keeps its opaque background.
pub(crate) fn apply_blur(hwnd: *mut c_void) -> bool {
    let hwnd = HWND(hwnd);
    // SAFETY: `user32.dll` is always loaded in a GUI process. The export is
    // undocumented, so it is looked up rather than linked, and the transmute
    // matches its long-stable signature
    // `BOOL SetWindowCompositionAttribute(HWND, WINDOWCOMPOSITIONATTRIBDATA*)`.
    // `policy` and `data` outlive the call.
    unsafe {
        let Ok(user32) = GetModuleHandleW(w!("user32.dll")) else {
            return false;
        };
        let Some(proc) = GetProcAddress(user32, s!("SetWindowCompositionAttribute")) else {
            return false;
        };
        let set = std::mem::transmute::<
            unsafe extern "system" fn() -> isize,
            SetWindowCompositionAttribute,
        >(proc);
        let mut policy = AccentPolicy {
            state: ACCENT_ACRYLIC,
            flags: 0,
            gradient: NEARLY_CLEAR_TINT,
            animation: 0,
        };
        let mut data = CompositionData {
            attribute: ACCENT_POLICY,
            data: (&raw mut policy).cast::<c_void>(),
            size: std::mem::size_of::<AccentPolicy>(),
        };
        set(hwnd, &mut data).as_bool()
    }
}
