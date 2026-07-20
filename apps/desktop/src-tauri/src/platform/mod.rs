use image::RgbaImage;

use crate::{
    domain::{DetectedTargetDto, DisplayDto, Point},
    error::SnaphubError,
};

#[cfg(target_os = "windows")]
pub mod windows_shell;
#[cfg(target_os = "windows")]
mod windows_ui;
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
