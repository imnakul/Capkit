use image::RgbaImage;

use crate::{
    domain::{
        AudioDeviceDto, DetectedTargetDto, DisplayDto, Point, RecognizedTextDto,
        RecordingArtifactsDto, RecordingRequestDto, RecordingSourceDto, RecordingStatsDto, Rect,
        StartupStateDto,
    },
    error::SnaphubError,
};

pub(crate) mod plugin_startup;
#[cfg(target_os = "windows")]
pub(crate) mod windows_display;
#[cfg(target_os = "windows")]
pub(crate) mod windows_ocr;
#[cfg(target_os = "windows")]
pub(crate) mod windows_recorder;
#[cfg(target_os = "windows")]
pub mod windows_shell;
#[cfg(target_os = "windows")]
pub(crate) mod windows_startup;
#[cfg(target_os = "windows")]
pub(crate) mod windows_ui;
#[cfg(target_os = "windows")]
pub(crate) mod windows_webview;
pub mod xcap_backend;

pub struct CapturedDisplay {
    pub display: DisplayDto,
    pub image: RgbaImage,
    pub color_space: &'static str,
}

pub trait CaptureBackend: Send + Sync {
    fn capture_display_at_point(&self, point: Point) -> Result<CapturedDisplay, SnaphubError>;
}

/// A browser window's page area, in physical screen pixels.
#[derive(Debug, Clone, PartialEq)]
pub struct WebViewport {
    pub window_id: u32,
    pub window_title: String,
    pub viewport: Rect,
}

pub trait TargetDetectionBackend: Send + Sync {
    fn begin_session(&self) -> Result<(), SnaphubError>;
    fn targets(&self) -> Result<Vec<DetectedTargetDto>, SnaphubError>;
    fn ui_region_at(&self, point: Point) -> Result<Option<DetectedTargetDto>, SnaphubError>;
    /// The page area of the browser window under `point`, or `None` when it isn't a browser page.
    fn web_viewport_at(&self, point: Point) -> Result<Option<WebViewport>, SnaphubError>;
}

pub trait ClipboardBackend: Send + Sync {
    fn copy_image(&self, image: &RgbaImage) -> Result<(), SnaphubError>;
    fn copy_text(&self, text: &str) -> Result<(), SnaphubError>;
}

/// Optical character recognition of captured pixels.
pub trait TextRecognitionBackend: Send + Sync {
    fn is_text_recognition_supported(&self) -> bool;
    /// Word bounds in the returned value are in pixels of `image`.
    fn recognize_text(&self, image: &RgbaImage) -> Result<RecognizedTextDto, SnaphubError>;
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
    /// Starts a recording. The second element names requested audio kinds
    /// (`"system"` or `"microphone"`) that could not be opened; the video
    /// still records, and the caller reports them.
    fn start(
        &self,
        request: &RecordingRequestDto,
        directory: &std::path::Path,
    ) -> Result<(Box<dyn RecordingSession>, Vec<&'static str>), SnaphubError>;
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

/// Opening CapKit when the user signs in.
///
/// The Store (MSIX) build must use the manifest startup task: Store policy
/// rejects packaged apps that write their own Run entry. The unpackaged
/// installer has no package identity, so it keeps the per-user Run entry.
pub trait StartupBackend {
    fn state(&self) -> Result<StartupStateDto, SnaphubError>;
    /// Returns the resulting state. It can differ from the request when the
    /// user turned CapKit off in Windows or a policy controls it; the caller
    /// shows that state instead of treating it as a failure.
    fn set_enabled(&self, enabled: bool) -> Result<StartupStateDto, SnaphubError>;
}
