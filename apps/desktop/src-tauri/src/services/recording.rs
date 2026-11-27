use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use crate::domain::{
    AudioDeviceDto, RecordingArtifactsDto, RecordingRequestDto, RecordingSourceDto,
    RecordingStatsDto,
};
use crate::error::SnaphubError;
use crate::platform::{
    AudioDeviceBackend, RecordingSession, ScreenRecordingBackend, WindowCaptureExclusionBackend,
};
use crate::services::capture::{
    default_recording_directory, load_recording_directory, persist_recording_directory,
};
use crate::services::paths::display_path;

/// Owns the one recording that can be in flight at a time.
///
/// Registered separately from `CaptureService` so the screenshot path and its
/// tests stay unaware of recording.
/// A camera sidecar being appended from the camera webview.
struct CameraTrack {
    path: PathBuf,
    file: Option<File>,
}

pub struct RecordingService {
    recorder: Arc<dyn ScreenRecordingBackend>,
    audio: Arc<dyn AudioDeviceBackend>,
    exclusion: Arc<dyn WindowCaptureExclusionBackend>,
    active: Mutex<Option<Box<dyn RecordingSession>>>,
    camera: Mutex<Option<CameraTrack>>,
    camera_dir: Mutex<Option<PathBuf>>,
    root: Mutex<PathBuf>,
}

impl RecordingService {
    pub fn new(
        recorder: Arc<dyn ScreenRecordingBackend>,
        audio: Arc<dyn AudioDeviceBackend>,
        exclusion: Arc<dyn WindowCaptureExclusionBackend>,
    ) -> Self {
        let root = load_recording_directory();
        let _ = std::fs::create_dir_all(&root);
        Self {
            recorder,
            audio,
            exclusion,
            active: Mutex::new(None),
            camera: Mutex::new(None),
            camera_dir: Mutex::new(None),
            root: Mutex::new(root),
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
        let root =
            self.root.lock().map(|root| root.clone()).map_err(|_| {
                SnaphubError::Record("The recording location is unavailable".into())
            })?;
        let directory = root.join(session_stamp());
        let (session, audio_failures) = self.recorder.start(request, &directory)?;
        *active = Some(session);
        if let Ok(mut camera_dir) = self.camera_dir.lock() {
            *camera_dir = Some(directory);
        }
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
        let mut artifacts = session.stop()?;
        // The camera file handle closes before the path is read, so a
        // half-flushed track is either a real file or absent.
        artifacts.camera_path = self.finish_camera_track();
        if let Ok(mut camera_dir) = self.camera_dir.lock() {
            *camera_dir = None;
        }
        Ok(artifacts)
    }

    /// Starts the camera sidecar for the recording in flight. Only `"mp4"`
    /// and `"webm"` are accepted; a second begin for the same session is an
    /// error.
    pub fn begin_camera_track(&self, extension: &str) -> Result<(), SnaphubError> {
        if extension != "mp4" && extension != "webm" {
            return Err(SnaphubError::Record(format!(
                "Unsupported camera container: {extension}"
            )));
        }
        if self.lock()?.is_none() {
            return Err(SnaphubError::Record("No recording is in progress".into()));
        }
        let mut camera = self
            .camera
            .lock()
            .map_err(|_| SnaphubError::Record("The camera registry was poisoned".into()))?;
        if camera.is_some() {
            return Err(SnaphubError::Record(
                "A camera track is already started".into(),
            ));
        }
        let directory = self
            .camera_dir
            .lock()
            .map_err(|_| SnaphubError::Record("The camera registry was poisoned".into()))?
            .clone()
            .ok_or_else(|| SnaphubError::Record("No recording is in progress".into()))?;
        let path = directory.join(format!("camera.{extension}"));
        let file = File::create(&path).map_err(|error| SnaphubError::Record(error.to_string()))?;
        *camera = Some(CameraTrack {
            path,
            file: Some(file),
        });
        Ok(())
    }

    /// Appends one recorder chunk. Without an active track it errors, and the
    /// frontend ignores it.
    pub fn append_camera_chunk(&self, bytes: &[u8]) -> Result<(), SnaphubError> {
        let mut camera = self
            .camera
            .lock()
            .map_err(|_| SnaphubError::Record("The camera registry was poisoned".into()))?;
        let Some(track) = camera.as_mut() else {
            return Err(SnaphubError::Record("No camera track is active".into()));
        };
        let Some(file) = track.file.as_mut() else {
            return Err(SnaphubError::Record("No camera track is active".into()));
        };
        if let Err(error) = file.write_all(bytes) {
            track.file.take();
            return Err(SnaphubError::Record(format!(
                "Camera chunk failed: {error}"
            )));
        }
        Ok(())
    }

    /// Drops the file handle and returns the path when it exists and is not
    /// empty.
    fn finish_camera_track(&self) -> Option<String> {
        let track = self.camera.lock().ok()?.take()?;
        drop(track.file);
        std::fs::metadata(&track.path)
            .ok()
            .filter(|meta| meta.len() > 0)?;
        Some(track.path.to_string_lossy().into_owned())
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

    /// The folder new recordings are saved in. It starts as the Videos
    /// default and follows whatever the user picks in Settings.
    pub fn recording_directory(&self) -> Result<PathBuf, SnaphubError> {
        self.root
            .lock()
            .map(|root| root.clone())
            .map_err(|_| SnaphubError::Record("The recording location is unavailable".into()))
    }

    pub fn set_recording_directory(&self, directory: PathBuf) -> Result<PathBuf, SnaphubError> {
        if !directory.is_absolute() {
            return Err(SnaphubError::Record(
                "Choose an absolute folder for recordings".into(),
            ));
        }
        std::fs::create_dir_all(&directory)
            .map_err(|error| SnaphubError::Record(error.to_string()))?;
        let directory = display_path(
            &directory
                .canonicalize()
                .map_err(|error| SnaphubError::Record(error.to_string()))?,
        );
        persist_recording_directory(&directory)?;
        *self
            .root
            .lock()
            .map_err(|_| SnaphubError::Record("The recording location is unavailable".into()))? =
            directory.clone();
        Ok(directory)
    }

    /// A recorded video the user asked to open, only if it sits inside the
    /// recordings folder and is an MP4.
    pub fn validated_recording_video(&self, path: &Path) -> Result<PathBuf, SnaphubError> {
        validated_video(&self.recording_directory()?, path)
    }

    pub fn reset_recording_directory(&self) -> Result<PathBuf, SnaphubError> {
        self.set_recording_directory(default_recording_directory())
    }

    pub fn cancel(&self) -> Result<(), SnaphubError> {
        if let Some(session) = self.lock()?.take() {
            session.cancel();
        }
        if let Ok(mut camera) = self.camera.lock() {
            camera.take();
        }
        if let Ok(mut camera_dir) = self.camera_dir.lock() {
            *camera_dir = None;
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

fn session_stamp() -> String {
    chrono::Local::now().format("%Y-%m-%d-%H%M%S").to_string()
}

/// Canonical path of `path` when it is an existing MP4 inside `root`.
fn validated_video(root: &Path, path: &Path) -> Result<PathBuf, SnaphubError> {
    let missing = |_| SnaphubError::Record("This recording file no longer exists".into());
    let root = root.canonicalize().map_err(missing)?;
    let candidate = path.canonicalize().map_err(missing)?;
    if !candidate.starts_with(&root) || !candidate.is_file() {
        return Err(SnaphubError::Record(
            "This recording is outside the recordings folder".into(),
        ));
    }
    let is_mp4 = candidate
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("mp4"));
    if !is_mp4 {
        return Err(SnaphubError::Record("This file is not a recording".into()));
    }
    Ok(candidate)
}

#[cfg(test)]
mod video_path_tests {
    use super::validated_video;
    use std::fs;
    use std::path::PathBuf;

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("capkit-open-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(dir.join("recordings").join("one")).expect("scratch dir");
        dir
    }

    #[test]
    fn accepts_an_mp4_inside_the_recordings_folder() {
        let dir = scratch();
        let video = dir.join("recordings").join("one").join("video.MP4");
        fs::write(&video, b"x").expect("video");
        let opened = validated_video(&dir.join("recordings"), &video).expect("valid");
        assert!(opened.ends_with("video.MP4"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn rejects_files_outside_the_folder_other_types_and_missing_files() {
        let dir = scratch();
        let root = dir.join("recordings");
        let outside = dir.join("video.mp4");
        fs::write(&outside, b"x").expect("outside");
        let script = root.join("one").join("run.bat");
        fs::write(&script, b"x").expect("script");
        assert!(validated_video(&root, &outside).is_err());
        assert!(validated_video(&root, &script).is_err());
        assert!(validated_video(&root, &root.join("one").join("gone.mp4")).is_err());
        assert!(
            validated_video(
                &root,
                &root.join("one").join("..").join("..").join("video.mp4")
            )
            .is_err()
        );
        let _ = fs::remove_dir_all(dir);
    }
}
