use std::{borrow::Cow, collections::HashMap, sync::Mutex};

use arboard::{Clipboard, ImageData};
use xcap::{Monitor, Window};

use crate::{
    domain::{DetectedTargetDto, DisplayDto, Point, RecognizedTextDto, Rect},
    error::SnaphubError,
    platform::{
        CaptureBackend, CapturedDisplay, ClipboardBackend, PermissionBackend, PinnedWindowBackend,
        ScrollingCaptureBackend, TargetDetectionBackend, TextRecognitionBackend, WebViewport,
    },
};

#[derive(Default)]
pub struct XcapPlatformBackend {
    ui_regions: Mutex<HashMap<u32, CachedUiRegions>>,
}

/// After this long, a thin browser scan is worth repeating: the browser has had
/// time to build the accessibility tree our first query asked for.
const PROVISIONAL_RESCAN_AFTER: std::time::Duration = std::time::Duration::from_millis(350);
/// Stop rescanning a window that keeps coming back thin (it may truly be empty).
const MAX_SCAN_ATTEMPTS: u8 = 5;

/// UI regions found in one window during the current capture session.
struct CachedUiRegions {
    regions: Vec<DetectedTargetDto>,
    provisional: bool,
    scanned_at: std::time::Instant,
    attempts: u8,
}

/// A web page's accessibility tree fills in after we ask for it. Keep
/// rescanning while each scan finds more than the last; stop once it settles.
fn still_filling(provisional: bool, previous_count: Option<usize>, count: usize) -> bool {
    provisional && previous_count.is_none_or(|previous| count > previous)
}

impl CachedUiRegions {
    fn needs_rescan(&self, now: std::time::Instant) -> bool {
        self.provisional
            && self.attempts < MAX_SCAN_ATTEMPTS
            && now.saturating_duration_since(self.scanned_at) >= PROVISIONAL_RESCAN_AFTER
    }
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

/// Physical desktop bounds of one display, by the id `sources()` reports.
///
/// Cheap enumeration only: no thumbnails, no capture. Sync commands use this
/// instead of the thumbnail-capturing `sources()` call, which must never run
/// on the main thread.
pub fn display_bounds(display_id: &str) -> Result<Rect, SnaphubError> {
    let monitors = Monitor::all().map_err(SnaphubError::capture)?;
    monitors
        .iter()
        .find(|monitor| {
            monitor
                .id()
                .map(|id| id.to_string() == display_id)
                .unwrap_or(false)
        })
        .and_then(|monitor| {
            let (Ok(x), Ok(y), Ok(width), Ok(height)) =
                (monitor.x(), monitor.y(), monitor.width(), monitor.height())
            else {
                return None;
            };
            Some(Rect {
                x: f64::from(x),
                y: f64::from(y),
                width: f64::from(width),
                height: f64::from(height),
            })
        })
        .ok_or_else(|| SnaphubError::Window("The chosen display is unavailable".into()))
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
            #[cfg(target_os = "windows")]
            if window
                .id()
                .is_ok_and(super::windows_ui::is_pass_through_overlay)
            {
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
            let now = std::time::Instant::now();
            let stale = cache
                .get(&window_id)
                .is_none_or(|cached| cached.needs_rescan(now));
            if stale {
                let previous = cache.get(&window_id);
                let attempts = previous.map_or(0, |cached| cached.attempts);
                let previous_count = previous.map(|cached| cached.regions.len());
                let scan = super::windows_ui::scan_window(window_id)?;
                let provisional =
                    still_filling(scan.provisional, previous_count, scan.regions.len());
                cache.insert(
                    window_id,
                    CachedUiRegions {
                        regions: scan.regions,
                        provisional,
                        scanned_at: now,
                        attempts: attempts + 1,
                    },
                );
            }
            Ok(cache.get(&window_id).and_then(|cached| {
                cached
                    .regions
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

    fn web_viewport_at(&self, point: Point) -> Result<Option<WebViewport>, SnaphubError> {
        #[cfg(target_os = "windows")]
        {
            let Some((window_id, window_title)) = underlying_window_with_title_at(point)? else {
                return Ok(None);
            };
            Ok(
                super::windows_ui::web_viewport_rect(window_id, point).map(|viewport| {
                    WebViewport {
                        window_id,
                        window_title,
                        viewport,
                    }
                }),
            )
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
    Ok(underlying_window_with_title_at(point)?.map(|(id, _)| id))
}

#[cfg(target_os = "windows")]
fn underlying_window_with_title_at(point: Point) -> Result<Option<(u32, String)>, SnaphubError> {
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
        if window
            .id()
            .is_ok_and(super::windows_ui::is_pass_through_overlay)
        {
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
        return window
            .id()
            .map(|id| Some((id, title)))
            .map_err(SnaphubError::capture);
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

    fn copy_text(&self, text: &str) -> Result<(), SnaphubError> {
        let mut clipboard = Clipboard::new().map_err(SnaphubError::clipboard)?;
        clipboard
            .set_text(text.to_owned())
            .map_err(SnaphubError::clipboard)
    }
}

impl TextRecognitionBackend for XcapPlatformBackend {
    fn is_text_recognition_supported(&self) -> bool {
        cfg!(target_os = "windows")
    }

    fn recognize_text(&self, image: &image::RgbaImage) -> Result<RecognizedTextDto, SnaphubError> {
        #[cfg(target_os = "windows")]
        {
            crate::platform::windows_ocr::recognize(image)
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = image;
            Err(SnaphubError::Ocr(
                "Text recognition is not available on this platform yet".into(),
            ))
        }
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

    fn cached(provisional: bool, attempts: u8, scanned_at: std::time::Instant) -> CachedUiRegions {
        CachedUiRegions {
            regions: Vec::new(),
            provisional,
            scanned_at,
            attempts,
        }
    }

    #[test]
    fn keeps_rescanning_a_web_page_only_while_it_grows() {
        assert!(still_filling(true, None, 66));
        assert!(still_filling(true, Some(66), 250));
        assert!(!still_filling(true, Some(250), 250));
        assert!(!still_filling(false, None, 300));
    }

    #[test]
    fn rescans_a_thin_browser_scan_only_after_a_pause_and_a_few_times() {
        let start = std::time::Instant::now();
        let later = start + PROVISIONAL_RESCAN_AFTER;
        assert!(!cached(true, 1, start).needs_rescan(start));
        assert!(cached(true, 1, start).needs_rescan(later));
        assert!(!cached(true, MAX_SCAN_ATTEMPTS, start).needs_rescan(later));
        assert!(!cached(false, 1, start).needs_rescan(later));
    }

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
