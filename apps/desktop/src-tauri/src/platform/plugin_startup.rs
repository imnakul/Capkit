use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

use crate::{
    domain::{StartupManager, StartupStateDto, StartupStatus},
    error::SnaphubError,
    platform::StartupBackend,
};

/// The sign-in entry written by `tauri-plugin-autostart` (the per-user Run
/// key on Windows) for builds without package identity. The entry launches
/// CapKit with `--background`. Never use this in the Store build.
pub(crate) struct PluginStartup {
    app: AppHandle,
}

impl PluginStartup {
    pub(crate) fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl StartupBackend for PluginStartup {
    fn state(&self) -> Result<StartupStateDto, SnaphubError> {
        let enabled = self
            .app
            .autolaunch()
            .is_enabled()
            .map_err(SnaphubError::startup)?;
        Ok(StartupStateDto {
            status: if enabled {
                StartupStatus::Enabled
            } else {
                StartupStatus::Disabled
            },
            managed_by: StartupManager::App,
        })
    }

    fn set_enabled(&self, enabled: bool) -> Result<StartupStateDto, SnaphubError> {
        let manager = self.app.autolaunch();
        if enabled {
            manager.enable()
        } else {
            manager.disable()
        }
        .map_err(SnaphubError::startup)?;
        self.state()
    }
}
