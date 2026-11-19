//! In-app update state. Checks only run on request (dashboard start or a button
//! click); nothing here polls or sleeps.

use std::sync::{
    Mutex,
    atomic::{AtomicBool, Ordering},
};

use serde::Serialize;
use tauri_plugin_updater::Update;

use crate::error::SnaphubError;

/// Event every window listens to for update state changes.
pub const STATUS_EVENT: &str = "capkit://update-status";

/// Shown when an install is requested while the user is mid-capture.
pub const GUARD_MESSAGE: &str = "Finish your capture or recording first.";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "state",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum UpdateStatusDto {
    Unsupported,
    Idle,
    Checking,
    UpToDate {
        current_version: String,
    },
    Available {
        current_version: String,
        version: String,
        notes: Option<String>,
    },
    Installing {
        version: String,
        percent: u8,
    },
    Error {
        current_version: String,
        message: String,
    },
}

/// A newer release reported by the update endpoint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AvailableUpdate {
    pub version: String,
    pub notes: Option<String>,
}

pub struct UpdateSlot {
    pub status: UpdateStatusDto,
    pub pending: Option<Update>,
}

pub struct UpdateRegistry {
    pub state: Mutex<UpdateSlot>,
    pub auto_checked: AtomicBool,
}

impl UpdateRegistry {
    pub fn new(packaged: bool) -> Self {
        Self {
            state: Mutex::new(UpdateSlot {
                status: if packaged {
                    UpdateStatusDto::Unsupported
                } else {
                    UpdateStatusDto::Idle
                },
                pending: None,
            }),
            auto_checked: AtomicBool::new(false),
        }
    }

    pub fn status(&self) -> UpdateStatusDto {
        self.state
            .lock()
            .map(|slot| slot.status.clone())
            .unwrap_or(UpdateStatusDto::Idle)
    }

    /// True for the first caller in this process only.
    pub fn claim_auto_check(&self) -> bool {
        !self.auto_checked.swap(true, Ordering::SeqCst)
    }

    /// Marks a check as running. Returns the current status instead when a
    /// check or install is already running, or updates are unsupported.
    pub fn begin_check(&self) -> Option<UpdateStatusDto> {
        let mut slot = self.state.lock().ok()?;
        match slot.status {
            UpdateStatusDto::Checking
            | UpdateStatusDto::Installing { .. }
            | UpdateStatusDto::Unsupported => Some(slot.status.clone()),
            _ => {
                slot.status = UpdateStatusDto::Checking;
                None
            }
        }
    }

    /// Stores the outcome of a check and returns the new status.
    pub fn finish_check(
        &self,
        current_version: &str,
        result: Result<Option<(AvailableUpdate, Update)>, String>,
        manual: bool,
    ) -> UpdateStatusDto {
        let (summary, pending) = match result {
            Ok(Some((summary, update))) => (Ok(Some(summary)), Some(update)),
            Ok(None) => (Ok(None), None),
            Err(error) => (Err(error), None),
        };
        let status = status_after_check(current_version, summary, manual);
        if let Ok(mut slot) = self.state.lock() {
            slot.status = status.clone();
            slot.pending = pending;
        }
        status
    }

    pub fn set_status(&self, status: UpdateStatusDto) {
        if let Ok(mut slot) = self.state.lock() {
            slot.status = status;
        }
    }

    /// Starts an install: returns the pending update, or the current status
    /// when there is nothing to install or an install is already running.
    pub fn begin_install(&self) -> Result<Update, UpdateStatusDto> {
        let mut slot = self.state.lock().map_err(|_| UpdateStatusDto::Idle)?;
        if matches!(slot.status, UpdateStatusDto::Installing { .. }) {
            return Err(slot.status.clone());
        }
        let Some(update) = slot.pending.clone() else {
            return Err(slot.status.clone());
        };
        slot.status = UpdateStatusDto::Installing {
            version: update.version.clone(),
            percent: 0,
        };
        Ok(update)
    }
}

/// Refuses an install when the build cannot update itself or the user is busy.
pub fn install_guard(
    packaged: bool,
    capture_visible: bool,
    recording_active: bool,
) -> Result<(), SnaphubError> {
    if packaged {
        return Err(SnaphubError::Update(
            "Updates come from the Microsoft Store.".into(),
        ));
    }
    if capture_visible || recording_active {
        return Err(SnaphubError::Update(GUARD_MESSAGE.into()));
    }
    Ok(())
}

/// Maps a check outcome to a status. A failed automatic check stays silent
/// (idle); a failed manual check reports an error.
pub fn status_after_check(
    current_version: &str,
    result: Result<Option<AvailableUpdate>, String>,
    manual: bool,
) -> UpdateStatusDto {
    match result {
        Ok(Some(update)) => UpdateStatusDto::Available {
            current_version: current_version.to_owned(),
            version: update.version,
            notes: update.notes,
        },
        Ok(None) => UpdateStatusDto::UpToDate {
            current_version: current_version.to_owned(),
        },
        Err(_) if !manual => UpdateStatusDto::Idle,
        Err(_) => UpdateStatusDto::Error {
            current_version: current_version.to_owned(),
            message: "Couldn't check for updates. Try again later.".into(),
        },
    }
}

/// The status shown after a failed download or signature check.
pub fn install_failure(current_version: &str) -> UpdateStatusDto {
    UpdateStatusDto::Error {
        current_version: current_version.to_owned(),
        message: format!("Update failed. CapKit is still on v{current_version}."),
    }
}

/// Whole percent downloaded, or `None` when the total size is unknown.
pub fn download_percent(downloaded: u64, total: Option<u64>) -> Option<u8> {
    let total = total.filter(|total| *total > 0)?;
    let percent = downloaded.saturating_mul(100) / total;
    Some(u8::try_from(percent.min(100)).unwrap_or(100))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn available() -> AvailableUpdate {
        AvailableUpdate {
            version: "0.4.0".into(),
            notes: None,
        }
    }

    #[test]
    fn guard_blocks_packaged_capture_and_recording() {
        assert!(install_guard(false, false, false).is_ok());
        assert!(
            install_guard(true, false, false)
                .unwrap_err()
                .to_string()
                .contains("Microsoft Store")
        );
        for (capture, recording) in [(true, false), (false, true), (true, true)] {
            assert!(
                install_guard(false, capture, recording)
                    .unwrap_err()
                    .to_string()
                    .contains(GUARD_MESSAGE)
            );
        }
    }

    #[test]
    fn check_results_map_to_statuses() {
        assert_eq!(
            status_after_check("0.3.0", Ok(Some(available())), true),
            UpdateStatusDto::Available {
                current_version: "0.3.0".into(),
                version: "0.4.0".into(),
                notes: None,
            }
        );
        assert_eq!(
            status_after_check("0.3.0", Ok(None), false),
            UpdateStatusDto::UpToDate {
                current_version: "0.3.0".into()
            }
        );
        assert_eq!(
            status_after_check("0.3.0", Err("offline".into()), false),
            UpdateStatusDto::Idle
        );
        assert!(matches!(
            status_after_check("0.3.0", Err("offline".into()), true),
            UpdateStatusDto::Error { .. }
        ));
    }

    #[test]
    fn install_failure_names_the_current_version() {
        assert_eq!(
            install_failure("0.3.0"),
            UpdateStatusDto::Error {
                current_version: "0.3.0".into(),
                message: "Update failed. CapKit is still on v0.3.0.".into(),
            }
        );
    }

    #[test]
    fn overlapping_checks_do_not_start_twice() {
        let registry = UpdateRegistry::new(false);
        assert_eq!(registry.begin_check(), None);
        assert_eq!(registry.begin_check(), Some(UpdateStatusDto::Checking));
    }

    #[test]
    fn packaged_builds_never_start_a_check() {
        let registry = UpdateRegistry::new(true);
        assert_eq!(registry.begin_check(), Some(UpdateStatusDto::Unsupported));
    }

    #[test]
    fn automatic_check_is_claimed_once_per_process() {
        let registry = UpdateRegistry::new(false);
        assert!(registry.claim_auto_check());
        assert!(!registry.claim_auto_check());
    }

    #[test]
    fn install_without_a_pending_update_returns_the_status() {
        let registry = UpdateRegistry::new(false);
        assert_eq!(registry.begin_install().err(), Some(UpdateStatusDto::Idle));
        registry.set_status(UpdateStatusDto::Installing {
            version: "0.4.0".into(),
            percent: 10,
        });
        assert!(matches!(
            registry.begin_install().err(),
            Some(UpdateStatusDto::Installing { .. })
        ));
    }

    #[test]
    fn percent_is_clamped_and_needs_a_known_size() {
        assert_eq!(download_percent(50, Some(200)), Some(25));
        assert_eq!(download_percent(300, Some(200)), Some(100));
        assert_eq!(download_percent(10, None), None);
        assert_eq!(download_percent(10, Some(0)), None);
    }

    #[test]
    fn status_serialises_with_a_kebab_tag_and_camel_fields() {
        let json = serde_json::to_value(UpdateStatusDto::UpToDate {
            current_version: "0.3.0".into(),
        })
        .unwrap();
        assert_eq!(json["state"], "up-to-date");
        assert_eq!(json["currentVersion"], "0.3.0");
    }
}
