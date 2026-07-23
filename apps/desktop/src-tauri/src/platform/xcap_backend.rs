use std::{borrow::Cow, collections::HashMap, sync::Mutex};

use arboard::{Clipboard, ImageData};
use xcap::{Monitor, Window};

use crate::{
    domain::{DetectedTargetDto, DisplayDto, Point, Rect},
    error::SnaphubError,
    platform::{
        CaptureBackend, CapturedDisplay, ClipboardBackend, PermissionBackend, PinnedWindowBackend,
        ScrollingCaptureBackend, TargetDetectionBackend,
    },
};

#[derive(Default)]
pub struct XcapPlatformBackend {
    ui_regions: Mutex<HashMap<u32, Vec<DetectedTargetDto>>>,
}

impl CaptureBackend for XcapPlatformBackend {
    fn capture_display_at_point(&self, point: Point) -> Result<CapturedDisplay, SnaphubError> {
        let monitors = Monitor::all().map_err(SnaphubError::capture)?;
        let monitor_index = monitors
            .iter()
            .position(|monitor| monitor_contains_point(monitor, point).unwrap_or(false))
            .or_else(|| {
                monitors
                    .iter()
                    .position(|monitor| monitor.is_primary().unwrap_or(false))
            })
            .ok_or_else(|| SnaphubError::Capture("No display was found".into()))?;
        let monitor = &monitors[monitor_index];
        let scale_factor = f64::from(monitor.scale_factor().map_err(SnaphubError::capture)?);
        let width = monitor.width().map_err(SnaphubError::capture)?;
        let height = monitor.height().map_err(SnaphubError::capture)?;
        let x = monitor.x().map_err(SnaphubError::capture)?;
        let y = monitor.y().map_err(SnaphubError::capture)?;
        let image = monitor.capture_image().map_err(SnaphubError::capture)?;

        Ok(CapturedDisplay {
            display: DisplayDto {
                id: format!("monitor-{x}-{y}"),
                name: monitor.name().map_err(SnaphubError::capture)?,
                bounds: Rect {
                    x: f64::from(x) / scale_factor,
                    y: f64::from(y) / scale_factor,
                    width: f64::from(width) / scale_factor,
                    height: f64::from(height) / scale_factor,
                },
                scale_factor,
                is_primary: monitor.is_primary().unwrap_or(false),
            },
            image,
            // xcap currently returns an 8-bit RGBA raster without advanced-color metadata.
            // Do not claim sRGB correctness on an HDR display until the Windows backend can
            // inspect the DXGI color space and apply an explicit tone-mapping policy.
            color_space: "unknown",
        })
    }
}

fn monitor_contains_point(monitor: &Monitor, point: Point) -> Result<bool, SnaphubError> {
    let bounds = Rect {
        x: f64::from(monitor.x().map_err(SnaphubError::capture)?),
        y: f64::from(monitor.y().map_err(SnaphubError::capture)?),
        width: f64::from(monitor.width().map_err(SnaphubError::capture)?),
        height: f64::from(monitor.height().map_err(SnaphubError::capture)?),
    };
    Ok(physical_rect_contains(bounds, point))
}

fn physical_rect_contains(bounds: Rect, point: Point) -> bool {
    point.x >= bounds.x
        && point.x < bounds.x + bounds.width
        && point.y >= bounds.y
        && point.y < bounds.y + bounds.height
}

impl TargetDetectionBackend for XcapPlatformBackend {
    fn begin_session(&self) -> Result<(), SnaphubError> {
        self.ui_regions
            .lock()
            .map_err(|_| SnaphubError::Capture("UI-region cache is unavailable".into()))?
            .clear();
        Ok(())
    }

    fn targets(&self) -> Result<Vec<DetectedTargetDto>, SnaphubError> {
        let mut targets = Vec::new();
        for window in Window::all().map_err(SnaphubError::capture)? {
            if window.is_minimized().unwrap_or(true) {
                continue;
            }
            let title = window.title().unwrap_or_else(|_| "Window".into());
            if title.starts_with("CapKit Capture") || title.starts_with("CapKit Pin") {
                continue;
            }
            let x = f64::from(window.x().map_err(SnaphubError::capture)?);
            let y = f64::from(window.y().map_err(SnaphubError::capture)?);
            let width = f64::from(window.width().map_err(SnaphubError::capture)?);
            let height = f64::from(window.height().map_err(SnaphubError::capture)?);
            targets.push(DetectedTargetDto {
                id: format!("window-{}", window.id().map_err(SnaphubError::capture)?),
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

    fn ui_region_at(&self, point: Point) -> Result<Option<DetectedTargetDto>, SnaphubError> {
        #[cfg(target_os = "windows")]
        {
            let Some(window_id) = underlying_window_at(point)? else {
                return Ok(None);
            };
            let mut cache = self
                .ui_regions
                .lock()
                .map_err(|_| SnaphubError::Capture("UI-region cache is unavailable".into()))?;
            if let std::collections::hash_map::Entry::Vacant(entry) = cache.entry(window_id) {
                entry.insert(super::windows_ui::regions_for_window(window_id)?);
            }
            Ok(cache.get(&window_id).and_then(|regions| {
                regions
                    .iter()
                    .find(|target| physical_rect_contains(target.bounds, point))
                    .cloned()
            }))
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = point;
            Ok(None)
        }
    }
}

#[cfg(target_os = "windows")]
fn underlying_window_at(point: Point) -> Result<Option<u32>, SnaphubError> {
    // Xcap returns windows in z-order. The first visible match is the actual surface beneath
    // Snaphub; ranking by area could incorrectly select a smaller window hidden behind it.
    for window in Window::all().map_err(SnaphubError::capture)? {
        if window.is_minimized().unwrap_or(true) {
            continue;
        }
        let title = window.title().unwrap_or_default();
        if title.starts_with("CapKit Capture") || title.starts_with("CapKit Pin") {
            continue;
        }
        let bounds = Rect {
            x: f64::from(window.x().map_err(SnaphubError::capture)?),
            y: f64::from(window.y().map_err(SnaphubError::capture)?),
            width: f64::from(window.width().map_err(SnaphubError::capture)?),
            height: f64::from(window.height().map_err(SnaphubError::capture)?),
        };
        if !physical_rect_contains(bounds, point) {
            continue;
        }
        return window.id().map(Some).map_err(SnaphubError::capture);
    }
    Ok(None)
}

impl ClipboardBackend for XcapPlatformBackend {
    fn copy_image(&self, image: &image::RgbaImage) -> Result<(), SnaphubError> {
        let mut clipboard = Clipboard::new().map_err(SnaphubError::clipboard)?;
        clipboard
            .set_image(ImageData {
                width: image.width() as usize,
                height: image.height() as usize,
                bytes: Cow::Owned(image.clone().into_raw()),
            })
            .map_err(SnaphubError::clipboard)
    }
}

impl PermissionBackend for XcapPlatformBackend {
    fn can_capture(&self) -> Result<bool, SnaphubError> {
        Ok(!Monitor::all().map_err(SnaphubError::capture)?.is_empty())
    }
}

impl ScrollingCaptureBackend for XcapPlatformBackend {
    fn is_supported(&self) -> bool {
        cfg!(target_os = "windows")
    }

    fn scroll_vertical(&self, point: Point, wheel_steps: i32) -> Result<(), SnaphubError> {
        #[cfg(target_os = "windows")]
        {
            use std::mem::size_of;
            use windows::Win32::UI::{
                Input::KeyboardAndMouse::{
                    INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_WHEEL, MOUSEINPUT, SendInput,
                },
                WindowsAndMessaging::SetCursorPos,
            };

            unsafe {
                SetCursorPos(point.x.round() as i32, point.y.round() as i32)
                    .map_err(|error| SnaphubError::Capture(error.to_string()))?;
                let input = INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            mouseData: (-wheel_steps.saturating_mul(120)) as u32,
                            dwFlags: MOUSEEVENTF_WHEEL,
                            ..Default::default()
                        },
                    },
                };
                if SendInput(&[input], size_of::<INPUT>() as i32) != 1 {
                    return Err(SnaphubError::Capture(
                        "Windows did not accept the automatic scroll input".into(),
                    ));
                }
            }
            Ok(())
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = (point, wheel_steps);
            Err(SnaphubError::Capture(
                "Automatic scrolling is unavailable on this platform".into(),
            ))
        }
    }
}

impl PinnedWindowBackend for XcapPlatformBackend {
    fn is_supported(&self) -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locates_points_on_negative_origin_monitors() {
        let left_monitor = Rect {
            x: -2560.0,
            y: -200.0,
            width: 2560.0,
            height: 1440.0,
        };

        assert!(physical_rect_contains(
            left_monitor,
            Point {
                x: -1200.0,
                y: 300.0,
            }
        ));
        assert!(!physical_rect_contains(
            left_monitor,
            Point { x: 10.0, y: 300.0 }
        ));
    }

    #[test]
    fn shared_edges_belong_to_only_one_monitor() {
        let primary = Rect {
            x: 0.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
        };

        assert!(physical_rect_contains(
            primary,
            Point {
                x: 1919.0,
                y: 500.0,
            }
        ));
        assert!(!physical_rect_contains(
            primary,
            Point {
                x: 1920.0,
                y: 500.0,
            }
        ));
    }
}
