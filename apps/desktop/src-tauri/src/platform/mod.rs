use image::RgbaImage;

use crate::{
    domain::{
        AudioDeviceDto, DetectedTargetDto, DisplayDto, Point, RecordingArtifactsDto,
        RecordingRequestDto, RecordingSourceDto, RecordingStatsDto,
    },
    error::SnaphubError,
};

#[cfg(target_os = "windows")]
pub(crate) mod windows_display;
#[cfg(target_os = "windows")]
pub(crate) mod windows_ocr;
#[cfg(target_os = "windows")]
pub(crate) mod windows_recorder;
#[cfg(target_os = "windows")]
pub mod windows_shell;
#[cfg(target_os = "windows")]
pub(crate) mod windows_ui;
pub mod xcap_backend;

pub struct CapturedDisplay {
    pub display: DisplayDto,
    pub image: RgbaImage,
    pub color_space: &'static str,
}

pub trait CaptureBackend: Send + Sync {
    fn capture_display_at_point(&self, point: Point) -> Result<CapturedDisplay, SnaphubError>;
}

pub trait TargetDetectionBackend: Send + Sync {
    fn begin_session(&self) -> Result<(), SnaphubError>;
    fn targets(&self) -> Result<Vec<DetectedTargetDto>, SnaphubError>;
    fn ui_region_at(&self, point: Point) -> Result<Option<DetectedTargetDto>, SnaphubError>;
}

pub trait ClipboardBackend: Send + Sync {
    fn copy_image(&self, image: &RgbaImage) -> Result<(), SnaphubError>;
}

pub trait PermissionBackend: Send + Sync {
    fn can_capture(&self) -> Result<bool, SnaphubError>;
}

pub trait ScrollingCaptureBackend: Send + Sync {
    fn is_supported(&self) -> bool;
    fn scroll_vertical(&self, point: Point, wheel_steps: i32) -> Result<(), SnaphubError>;
}

pub trait PinnedWindowBackend: Send + Sync {
    fn is_supported(&self) -> bool;
}

/// Screen recording.
///
/// Kept separate from `CaptureBackend` so the screenshot path and its tests
/// stay unaware of recording; the implementation is registered as its own
/// service rather than widening `CaptureService`'s trait bounds.
pub trait ScreenRecordingBackend: Send + Sync {
    fn is_supported(&self) -> bool;
    fn sources(&self) -> Result<Vec<RecordingSourceDto>, SnaphubError>;
    fn start(
        &self,
        request: &RecordingRequestDto,
        directory: &std::path::Path,
    ) -> Result<Box<dyn RecordingSession>, SnaphubError>;
}

/// A recording in flight. Dropping one without `stop` abandons its output.
pub trait RecordingSession: Send {
    fn set_paused(&self, paused: bool);
    fn is_paused(&self) -> bool;
    fn stats(&self) -> RecordingStatsDto;
    fn stop(self: Box<Self>) -> Result<RecordingArtifactsDto, SnaphubError>;
    fn cancel(self: Box<Self>);
}

pub trait AudioDeviceBackend: Send + Sync {
    fn capture_devices(&self) -> Result<Vec<AudioDeviceDto>, SnaphubError>;
}

/// Marks a window invisible to every screen-capture path, so the recorder's
/// own dock never lands in the video.
pub trait WindowCaptureExclusionBackend: Send + Sync {
    fn set_excluded(&self, hwnd: isize, excluded: bool) -> Result<(), SnaphubError>;
}
