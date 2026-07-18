use image::RgbaImage;

use crate::{
    domain::{DetectedTargetDto, DisplayDto},
    error::ShotHubError,
};

pub mod xcap_backend;

pub struct CapturedDisplay {
    pub display: DisplayDto,
    pub image: RgbaImage,
}

pub trait CaptureBackend: Send + Sync {
    fn capture_primary_display(&self) -> Result<CapturedDisplay, ShotHubError>;
}

pub trait TargetDetectionBackend: Send + Sync {
    fn targets(&self) -> Result<Vec<DetectedTargetDto>, ShotHubError>;
}

pub trait ClipboardBackend: Send + Sync {
    fn copy_image(&self, image: &RgbaImage) -> Result<(), ShotHubError>;
}

pub trait PermissionBackend: Send + Sync {
    fn can_capture(&self) -> Result<bool, ShotHubError>;
}

pub trait ScrollingCaptureBackend: Send + Sync {
    fn is_supported(&self) -> bool;
}

pub trait PinnedWindowBackend: Send + Sync {
    fn is_supported(&self) -> bool;
}
