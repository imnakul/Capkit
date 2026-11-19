use std::sync::OnceLock;

use windows::{
    ApplicationModel::{
        Activation::ActivationKind, AppInstance, Package, StartupTask, StartupTaskState,
    },
    core::HSTRING,
};

use crate::{
    domain::{StartupManager, StartupStateDto, StartupStatus},
    error::SnaphubError,
    platform::StartupBackend,
};

/// Must match the `desktop:StartupTask` `TaskId` in `msix/AppxManifest.xml`.
const STARTUP_TASK_ID: &str = "CapKitStartup";

/// True when this process runs from an installed MSIX package. Package
/// identity cannot change during a process, so the lookup runs once.
pub(crate) fn is_packaged() -> bool {
    static PACKAGED: OnceLock<bool> = OnceLock::new();
    *PACKAGED.get_or_init(|| Package::Current().is_ok())
}

/// True when Windows started this process through the startup task. That
/// activation cannot carry arguments, so this is the packaged equivalent of
/// the `--background` flag the unpackaged sign-in entry passes.
pub(crate) fn launched_by_startup_task() -> bool {
    is_packaged()
        && AppInstance::GetActivatedEventArgs()
            .and_then(|arguments| arguments.Kind())
            .is_ok_and(|kind| kind == ActivationKind::StartupTask)
}

/// The manifest startup task of the Store build.
///
/// Calls block on WinRT async operations, so run them off the main thread.
pub(crate) struct PackagedStartupTask;

impl PackagedStartupTask {
    fn task() -> Result<StartupTask, SnaphubError> {
        StartupTask::GetAsync(&HSTRING::from(STARTUP_TASK_ID))
            .and_then(|operation| operation.join())
            .map_err(|error| {
                SnaphubError::startup(format!(
                    "Startup task {STARTUP_TASK_ID} is unavailable: {error}"
                ))
            })
    }
}

fn package_state(state: StartupTaskState) -> StartupStateDto {
    StartupStateDto {
        status: StartupStatus::from_task_state(state.0),
        managed_by: StartupManager::Package,
    }
}

impl StartupBackend for PackagedStartupTask {
    fn state(&self) -> Result<StartupStateDto, SnaphubError> {
        Self::task()?
            .State()
            .map(package_state)
            .map_err(SnaphubError::startup)
    }

    fn set_enabled(&self, enabled: bool) -> Result<StartupStateDto, SnaphubError> {
        let task = Self::task()?;
        let current = task.State().map_err(SnaphubError::startup)?;
        // Windows ignores both calls once the user turned CapKit off in
        // Settings or Task Manager, or a policy owns the state.
        if !matches!(
            StartupStatus::from_task_state(current.0),
            StartupStatus::Enabled | StartupStatus::Disabled
        ) {
            return Ok(package_state(current));
        }
        if enabled {
            // Desktop apps get no consent dialog here; the result is final.
            task.RequestEnableAsync()
                .and_then(|operation| operation.join())
                .map(package_state)
                .map_err(SnaphubError::startup)
        } else {
            task.Disable().map_err(SnaphubError::startup)?;
            task.State()
                .map(package_state)
                .map_err(SnaphubError::startup)
        }
    }
}
