use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::domain::{
    AudioDeviceDto, RecordingArtifactsDto, RecordingRequestDto, RecordingSourceDto,
    RecordingStatsDto,
};
use crate::error::SnaphubError;
use crate::platform::{
    AudioDeviceBackend, RecordingSession, ScreenRecordingBackend, WindowCaptureExclusionBackend,
};

/// Owns the one recording that can be in flight at a time.
///
/// Registered separately from `CaptureService` so the screenshot path and its
/// tests stay unaware of recording.
pub struct RecordingService {
    recorder: Arc<dyn ScreenRecordingBackend>,
    audio: Arc<dyn AudioDeviceBackend>,
    exclusion: Arc<dyn WindowCaptureExclusionBackend>,
    active: Mutex<Option<Box<dyn RecordingSession>>>,
    root: PathBuf,
}

impl RecordingService {
    pub fn new(
        recorder: Arc<dyn ScreenRecordingBackend>,
        audio: Arc<dyn AudioDeviceBackend>,
        exclusion: Arc<dyn WindowCaptureExclusionBackend>,
    ) -> Self {
        Self {
            recorder,
            audio,
            exclusion,
            active: Mutex::new(None),
            root: recordings_root(),
        }
    }

    pub fn is_supported(&self) -> bool {
        self.recorder.is_supported()
    }

    pub fn sources(&self) -> Result<Vec<RecordingSourceDto>, SnaphubError> {
        self.recorder.sources()
    }

    pub fn audio_devices(&self) -> Result<Vec<AudioDeviceDto>, SnaphubError> {
        self.audio.capture_devices()
    }

    pub fn set_capture_exclusion(&self, hwnd: isize, excluded: bool) -> Result<(), SnaphubError> {
        self.exclusion.set_excluded(hwnd, excluded)
    }

    /// Starts a recording. The returned names (`"system"` or `"microphone"`)
    /// are requested audio kinds that could not be opened; the video still
    /// records, and the caller reports them.
    pub fn start(&self, request: &RecordingRequestDto) -> Result<Vec<&'static str>, SnaphubError> {
        let mut active = self.lock()?;
        if active.is_some() {
            return Err(SnaphubError::Record(
                "A recording is already in progress".into(),
            ));
        }
        let directory = self.root.join(session_stamp());
        let (session, audio_failures) = self.recorder.start(request, &directory)?;
        *active = Some(session);
        Ok(audio_failures)
    }

    /// Live counters, or `None` when nothing is recording.
    pub fn stats(&self) -> Result<Option<RecordingStatsDto>, SnaphubError> {
        Ok(self.lock()?.as_ref().map(|session| session.stats()))
    }

    pub fn stop(&self) -> Result<RecordingArtifactsDto, SnaphubError> {
        let session = self
            .lock()?
            .take()
            .ok_or_else(|| SnaphubError::Record("No recording is in progress".into()))?;
        session.stop()
    }

    /// Pauses or resumes the recording in flight.
    pub fn set_paused(&self, paused: bool) -> Result<bool, SnaphubError> {
        let active = self.lock()?;
        let session = active
            .as_ref()
            .ok_or_else(|| SnaphubError::Record("No recording is in progress".into()))?;
        session.set_paused(paused);
        Ok(session.is_paused())
    }

    pub fn cancel(&self) -> Result<(), SnaphubError> {
        if let Some(session) = self.lock()?.take() {
            session.cancel();
        }
        Ok(())
    }

    fn lock(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, Option<Box<dyn RecordingSession>>>, SnaphubError> {
        self.active
            .lock()
            .map_err(|_| SnaphubError::Record("The recording registry was poisoned".into()))
    }
}

/// Recordings are large and disposable until exported, so they live beside the
/// other temporary session data rather than in the user's pictures folder.
fn recordings_root() -> PathBuf {
    std::env::temp_dir().join("CapKit").join("recordings")
}

fn session_stamp() -> String {
    chrono::Local::now().format("%Y-%m-%d-%H%M%S").to_string()
}
