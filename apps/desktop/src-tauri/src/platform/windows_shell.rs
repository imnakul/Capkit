use std::{ffi::OsStr, os::windows::ffi::OsStrExt, path::Path};

use windows::{
    Win32::UI::{
        Shell::{SE_ERR_NOASSOC, ShellExecuteW},
        WindowsAndMessaging::SW_SHOWNORMAL,
    },
    core::PCWSTR,
};

use crate::error::SnaphubError;

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
