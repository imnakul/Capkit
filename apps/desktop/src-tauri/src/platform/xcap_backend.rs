use std::borrow::Cow;

use arboard::{Clipboard, ImageData};
use xcap::{Monitor, Window};

use crate::{
    domain::{DetectedTargetDto, DisplayDto, Rect},
    error::ShotHubError,
    platform::{
        CaptureBackend, CapturedDisplay, ClipboardBackend, PermissionBackend, PinnedWindowBackend,
        ScrollingCaptureBackend, TargetDetectionBackend,
    },
};

#[derive(Default)]
pub struct XcapPlatformBackend;

impl CaptureBackend for XcapPlatformBackend {
    fn capture_primary_display(&self) -> Result<CapturedDisplay, ShotHubError> {
        let monitors = Monitor::all().map_err(ShotHubError::capture)?;
        let monitor = monitors
            .into_iter()
            .find(|item| item.is_primary().unwrap_or(false))
            .ok_or_else(|| ShotHubError::Capture("No primary display was found".into()))?;
        let scale_factor = f64::from(monitor.scale_factor().map_err(ShotHubError::capture)?);
        let width = monitor.width().map_err(ShotHubError::capture)?;
        let height = monitor.height().map_err(ShotHubError::capture)?;
        let x = monitor.x().map_err(ShotHubError::capture)?;
        let y = monitor.y().map_err(ShotHubError::capture)?;
        let image = monitor.capture_image().map_err(ShotHubError::capture)?;

        Ok(CapturedDisplay {
            display: DisplayDto {
                id: format!("monitor-{x}-{y}"),
                name: monitor.name().map_err(ShotHubError::capture)?,
                bounds: Rect {
                    x: f64::from(x) / scale_factor,
                    y: f64::from(y) / scale_factor,
                    width: f64::from(width) / scale_factor,
                    height: f64::from(height) / scale_factor,
                },
                scale_factor,
                is_primary: true,
            },
            image,
        })
    }
}

impl TargetDetectionBackend for XcapPlatformBackend {
    fn targets(&self) -> Result<Vec<DetectedTargetDto>, ShotHubError> {
        let mut targets = Vec::new();
        for window in Window::all().map_err(ShotHubError::capture)? {
            if window.is_minimized().unwrap_or(true) {
                continue;
            }
            let title = window.title().unwrap_or_else(|_| "Window".into());
            if title.starts_with("ShotHub Capture") || title.starts_with("ShotHub Pin") {
                continue;
            }
            let x = f64::from(window.x().map_err(ShotHubError::capture)?);
            let y = f64::from(window.y().map_err(ShotHubError::capture)?);
            let width = f64::from(window.width().map_err(ShotHubError::capture)?);
            let height = f64::from(window.height().map_err(ShotHubError::capture)?);
            targets.push(DetectedTargetDto {
                id: format!("window-{}", window.id().map_err(ShotHubError::capture)?),
                title,
                kind: "window",
                bounds: Rect {
                    x,
                    y,
                    width,
                    height,
                },
            });
        }
        targets.sort_by(|left, right| {
            let left_area = left.bounds.width * left.bounds.height;
            let right_area = right.bounds.width * right.bounds.height;
            left_area.total_cmp(&right_area)
        });
        Ok(targets)
    }
}

impl ClipboardBackend for XcapPlatformBackend {
    fn copy_image(&self, image: &image::RgbaImage) -> Result<(), ShotHubError> {
        let mut clipboard = Clipboard::new().map_err(ShotHubError::clipboard)?;
        clipboard
            .set_image(ImageData {
                width: image.width() as usize,
                height: image.height() as usize,
                bytes: Cow::Owned(image.clone().into_raw()),
            })
            .map_err(ShotHubError::clipboard)
    }
}

impl PermissionBackend for XcapPlatformBackend {
    fn can_capture(&self) -> Result<bool, ShotHubError> {
        Ok(!Monitor::all().map_err(ShotHubError::capture)?.is_empty())
    }
}

impl ScrollingCaptureBackend for XcapPlatformBackend {
    fn is_supported(&self) -> bool {
        cfg!(target_os = "windows")
    }
}

impl PinnedWindowBackend for XcapPlatformBackend {
    fn is_supported(&self) -> bool {
        true
    }
}
