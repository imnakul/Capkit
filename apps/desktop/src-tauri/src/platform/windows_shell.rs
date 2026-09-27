use std::{ffi::OsStr, os::windows::ffi::OsStrExt, path::Path};

use windows::{
    Win32::UI::{
        Shell::{SE_ERR_NOASSOC, ShellExecuteW},
        WindowsAndMessaging::SW_SHOWNORMAL,
    },
    core::PCWSTR,
};

use crate::error::SnaphubError;

/// Opens the Windows camera privacy page. The URI is fixed here so no caller
/// can open an arbitrary location.
pub fn open_camera_privacy_settings() -> Result<(), SnaphubError> {
    open_uri("ms-settings:privacy-webcam")
}

fn open_uri(uri: &str) -> Result<(), SnaphubError> {
    let verb = wide(OsStr::new("open"));
    let target = wide(OsStr::new(uri));
    // SAFETY: the buffers are live for the call.
    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(verb.as_ptr()),
            PCWSTR(target.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if result.0 as isize > 32 {
        Ok(())
    } else {
        Err(SnaphubError::Window(format!(
            "Windows could not open {uri} (ShellExecute code {})",
            result.0 as isize
        )))
    }
}

pub fn open_path(path: &Path, offer_open_with: bool) -> Result<(), SnaphubError> {
    let encoded_path = wide(path.as_os_str());
    let open = wide(OsStr::new("open"));
    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(open.as_ptr()),
            PCWSTR(encoded_path.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    let code = result.0 as isize;
    if code > 32 {
        return Ok(());
    }
    if offer_open_with && code == SE_ERR_NOASSOC as isize {
        let open_as = wide(OsStr::new("openas"));
        let fallback = unsafe {
            ShellExecuteW(
                None,
                PCWSTR(open_as.as_ptr()),
                PCWSTR(encoded_path.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        if fallback.0 as isize > 32 {
            return Ok(());
        }
    }
    Err(SnaphubError::Window(format!(
        "Windows could not open {} (ShellExecute code {code})",
        path.display()
    )))
}

fn wide(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(std::iter::once(0)).collect()
}
