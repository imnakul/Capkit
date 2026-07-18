use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
};

use ab_glyph::FontArc;
use chrono::Local;
use image::{Rgba, RgbaImage, imageops};
use imageproc::{
    drawing::{
        draw_filled_circle_mut, draw_filled_rect_mut, draw_hollow_ellipse_mut,
        draw_hollow_rect_mut, draw_line_segment_mut, draw_text_mut,
    },
    rect::Rect as ImageRect,
};
use uuid::Uuid;

use crate::{
    domain::{
        Annotation, AnnotationScene, CaptureSessionDto, CompletionAction, CompletionRequest,
        CompletionResult, DetectedTargetDto, Point, Rect,
    },
    error::ShotHubError,
    platform::{
        CaptureBackend, ClipboardBackend, PermissionBackend, PinnedWindowBackend,
        ScrollingCaptureBackend, TargetDetectionBackend,
    },
};

struct CaptureAsset {
    image: RgbaImage,
    scale_factor: f64,
    snapshot_path: PathBuf,
}

pub struct CaptureService {
    capture: Arc<dyn CaptureBackend>,
    clipboard: Arc<dyn ClipboardBackend>,
    targets: Arc<dyn TargetDetectionBackend>,
    permissions: Arc<dyn PermissionBackend>,
    scrolling: Arc<dyn ScrollingCaptureBackend>,
    pinning: Arc<dyn PinnedWindowBackend>,
    sessions: Mutex<HashMap<Uuid, CaptureAsset>>,
}

impl CaptureService {
    pub fn new<T>(backend: Arc<T>) -> Self
    where
        T: CaptureBackend
            + ClipboardBackend
            + TargetDetectionBackend
            + PermissionBackend
            + ScrollingCaptureBackend
            + PinnedWindowBackend
            + 'static,
    {
        Self {
            capture: backend.clone(),
            clipboard: backend.clone(),
            targets: backend.clone(),
            permissions: backend.clone(),
            scrolling: backend.clone(),
            pinning: backend,
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn begin(&self) -> Result<CaptureSessionDto, ShotHubError> {
        if !self.permissions.can_capture()? {
            return Err(ShotHubError::Capture(
                "Screen capture permission is not available".into(),
            ));
        }

        let captured = self.capture.capture_primary_display()?;
        let id = Uuid::new_v4();
        let session_dir = session_directory().join(id.to_string());
        fs::create_dir_all(&session_dir).map_err(ShotHubError::export)?;
        // BMP avoids PNG compression on the shortcut-to-overlay critical path. The temporary
        // source is deleted at the end of the session; final user exports remain PNG.
        let snapshot_path = session_dir.join("source.bmp");
        captured
            .image
            .save_with_format(&snapshot_path, image::ImageFormat::Bmp)
            .map_err(ShotHubError::export)?;

        let dto = CaptureSessionDto {
            id: id.to_string(),
            phase: "snapshot-ready",
            display: captured.display.clone(),
            snapshot_path: snapshot_path.to_string_lossy().into_owned(),
            color_space: "srgb",
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| ShotHubError::Session("Capture state is unavailable".into()))?;
        sessions.insert(
            id,
            CaptureAsset {
                image: captured.image,
                scale_factor: captured.display.scale_factor,
                snapshot_path,
            },
        );
        Ok(dto)
    }

    pub fn complete(&self, request: &CompletionRequest) -> Result<CompletionResult, ShotHubError> {
        let id = Uuid::parse_str(&request.session_id)
            .map_err(|_| ShotHubError::Session("Invalid capture session".into()))?;
        if request.scene.version != 1 {
            return Err(ShotHubError::Session(format!(
                "Unsupported annotation scene version {}",
                request.scene.version
            )));
        }

        let output = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| ShotHubError::Session("Capture state is unavailable".into()))?;
            let asset = sessions
                .get(&id)
                .ok_or_else(|| ShotHubError::Session("Capture session has expired".into()))?;
            render_output(
                &asset.image,
                request.selection,
                asset.scale_factor,
                &request.scene,
            )?
        };

        let output_path = match request.action {
            CompletionAction::Copy => {
                self.clipboard.copy_image(&output)?;
                None
            }
            CompletionAction::Save | CompletionAction::SaveAs => {
                let path = default_save_path()?;
                save_atomic(&output, &path)?;
                Some(path.to_string_lossy().into_owned())
            }
            CompletionAction::Pin => {
                if !self.pinning.is_supported() {
                    return Err(ShotHubError::Window(
                        "Pinned windows are unavailable".into(),
                    ));
                }
                let pin_directory = session_directory().join("pins");
                fs::create_dir_all(&pin_directory).map_err(ShotHubError::export)?;
                let path = pin_directory.join(format!("{}.png", request.session_id));
                output.save(&path).map_err(ShotHubError::export)?;
                Some(path.to_string_lossy().into_owned())
            }
        };

        self.remove_session(id)?;
        Ok(CompletionResult {
            action: request.action,
            output_path,
        })
    }

    pub fn cancel(&self, session_id: &str) -> Result<(), ShotHubError> {
        let id = Uuid::parse_str(session_id)
            .map_err(|_| ShotHubError::Session("Invalid capture session".into()))?;
        self.remove_session(id)
    }

    pub fn detect_targets(&self, point: Point) -> Result<Vec<DetectedTargetDto>, ShotHubError> {
        Ok(self
            .targets
            .targets()?
            .into_iter()
            .filter(|target| {
                point.x >= target.bounds.x
                    && point.x <= target.bounds.x + target.bounds.width
                    && point.y >= target.bounds.y
                    && point.y <= target.bounds.y + target.bounds.height
            })
            .collect())
    }

    pub fn list_targets(&self) -> Result<Vec<DetectedTargetDto>, ShotHubError> {
        self.targets.targets()
    }

    pub fn scrolling_supported(&self) -> bool {
        self.scrolling.is_supported()
    }

    fn remove_session(&self, id: Uuid) -> Result<(), ShotHubError> {
        let asset = self
            .sessions
            .lock()
            .map_err(|_| ShotHubError::Session("Capture state is unavailable".into()))?
            .remove(&id);
        if let Some(asset) = asset
            && let Some(directory) = asset.snapshot_path.parent()
        {
            let _ = fs::remove_dir_all(directory);
        }
        Ok(())
    }
}

fn render_output(
    source: &RgbaImage,
    selection: Rect,
    scale: f64,
    scene: &AnnotationScene,
) -> Result<RgbaImage, ShotHubError> {
    let x = non_negative_u32(selection.x * scale);
    let y = non_negative_u32(selection.y * scale);
    let width = non_negative_u32(selection.width * scale).max(1);
    let height = non_negative_u32(selection.height * scale).max(1);
    if x.saturating_add(width) > source.width() || y.saturating_add(height) > source.height() {
        return Err(ShotHubError::Export(
            "Selection falls outside the captured display".into(),
        ));
    }
    let mut output = imageops::crop_imm(source, x, y, width, height).to_image();
    for annotation in &scene.elements {
        render_annotation(&mut output, annotation, scale);
    }
    Ok(output)
}

fn render_annotation(canvas: &mut RgbaImage, annotation: &Annotation, scale: f64) {
    match annotation {
        Annotation::Line {
            points,
            color,
            stroke_width,
            opacity,
            ..
        }
        | Annotation::Arrow {
            points,
            color,
            stroke_width,
            opacity,
            ..
        }
        | Annotation::CurvedArrow {
            points,
            color,
            stroke_width,
            opacity,
            ..
        }
        | Annotation::Highlighter {
            points,
            color,
            stroke_width,
            opacity,
            ..
        } => {
            let pixel = parse_color(color, *opacity);
            for pair in points.windows(2) {
                let start = pair[0];
                let end = pair[1];
                draw_thick_line(canvas, start, end, *stroke_width, scale, pixel);
            }
        }
        Annotation::Rectangle {
            bounds,
            color,
            fill,
            stroke_width,
            opacity,
            ..
        } => {
            let rect = image_rect(*bounds, scale);
            if fill != "transparent" {
                draw_filled_rect_mut(canvas, rect, parse_color(fill, *opacity));
            }
            let stroke = parse_color(color, *opacity);
            for inset in 0..non_negative_u32(f64::from(*stroke_width) * scale).max(1) {
                let inset_rect =
                    ImageRect::at(rect.left() + inset as i32, rect.top() + inset as i32).of_size(
                        rect.width().saturating_sub(inset * 2),
                        rect.height().saturating_sub(inset * 2),
                    );
                draw_hollow_rect_mut(canvas, inset_rect, stroke);
            }
        }
        Annotation::Ellipse {
            bounds,
            color,
            opacity,
            ..
        } => {
            let center = (
                non_negative_i32((bounds.x + bounds.width / 2.0) * scale),
                non_negative_i32((bounds.y + bounds.height / 2.0) * scale),
            );
            draw_hollow_ellipse_mut(
                canvas,
                center,
                non_negative_i32(bounds.width * scale / 2.0),
                non_negative_i32(bounds.height * scale / 2.0),
                parse_color(color, *opacity),
            );
        }
        Annotation::Blackout { bounds, .. } => {
            draw_filled_rect_mut(canvas, image_rect(*bounds, scale), Rgba([8, 9, 8, 255]));
        }
        Annotation::Pixelate {
            bounds, intensity, ..
        } => apply_pixelate(canvas, *bounds, scale, *intensity),
        Annotation::Blur {
            bounds, intensity, ..
        } => apply_blur(canvas, *bounds, scale, *intensity),
        Annotation::Spotlight {
            bounds,
            color,
            opacity,
            ..
        } => {
            draw_hollow_rect_mut(
                canvas,
                image_rect(*bounds, scale),
                parse_color(color, *opacity),
            );
        }
        Annotation::Counter {
            position,
            radius,
            color,
            opacity,
            value,
            ..
        } => {
            let center = (
                non_negative_i32(position.x * scale),
                non_negative_i32(position.y * scale),
            );
            let scaled_radius = non_negative_i32(f64::from(*radius) * scale);
            draw_filled_circle_mut(canvas, center, scaled_radius, parse_color(color, *opacity));
            if let Some(font) = system_font("Segoe UI Variable") {
                let label = value.to_string();
                let size = scaled_radius.max(12) as f32;
                draw_text_mut(
                    canvas,
                    Rgba([16, 17, 15, 255]),
                    center.0 - scaled_radius / 3,
                    center.1 - scaled_radius / 2,
                    size,
                    &font,
                    &label,
                );
            }
        }
        Annotation::Text {
            position,
            text,
            color,
            font_family,
            font_size,
            opacity,
            ..
        } => {
            if let Some(font) = system_font(font_family) {
                draw_text_mut(
                    canvas,
                    parse_color(color, *opacity),
                    non_negative_i32(position.x * scale),
                    non_negative_i32(position.y * scale),
                    (f64::from(*font_size) * scale) as f32,
                    &font,
                    text,
                );
            }
        }
    }
}

fn draw_thick_line(
    canvas: &mut RgbaImage,
    start: Point,
    end: Point,
    width: f32,
    scale: f64,
    color: Rgba<u8>,
) {
    let radius = non_negative_i32(f64::from(width) * scale / 2.0).max(1);
    for offset in -radius..=radius {
        draw_line_segment_mut(
            canvas,
            (
                (start.x * scale) as f32 + offset as f32,
                (start.y * scale) as f32,
            ),
            (
                (end.x * scale) as f32 + offset as f32,
                (end.y * scale) as f32,
            ),
            color,
        );
    }
}

fn apply_pixelate(canvas: &mut RgbaImage, bounds: Rect, scale: f64, intensity: f32) {
    let rect = clipped_rect(bounds, scale, canvas);
    if rect.2 == 0 || rect.3 == 0 {
        return;
    }
    let region = imageops::crop_imm(canvas, rect.0, rect.1, rect.2, rect.3).to_image();
    let block = non_negative_u32(f64::from(intensity) * scale).clamp(4, 40);
    let small = imageops::resize(
        &region,
        (rect.2 / block).max(1),
        (rect.3 / block).max(1),
        imageops::FilterType::Nearest,
    );
    let pixelated = imageops::resize(&small, rect.2, rect.3, imageops::FilterType::Nearest);
    imageops::overlay(canvas, &pixelated, i64::from(rect.0), i64::from(rect.1));
}

fn apply_blur(canvas: &mut RgbaImage, bounds: Rect, scale: f64, intensity: f32) {
    let rect = clipped_rect(bounds, scale, canvas);
    if rect.2 == 0 || rect.3 == 0 {
        return;
    }
    let region = imageops::crop_imm(canvas, rect.0, rect.1, rect.2, rect.3).to_image();
    let blurred = imageops::blur(&region, (intensity * scale as f32).clamp(2.0, 40.0));
    imageops::overlay(canvas, &blurred, i64::from(rect.0), i64::from(rect.1));
}

fn clipped_rect(bounds: Rect, scale: f64, canvas: &RgbaImage) -> (u32, u32, u32, u32) {
    let x = non_negative_u32(bounds.x * scale).min(canvas.width());
    let y = non_negative_u32(bounds.y * scale).min(canvas.height());
    let width = non_negative_u32(bounds.width * scale).min(canvas.width().saturating_sub(x));
    let height = non_negative_u32(bounds.height * scale).min(canvas.height().saturating_sub(y));
    (x, y, width, height)
}

fn image_rect(bounds: Rect, scale: f64) -> ImageRect {
    ImageRect::at(
        non_negative_i32(bounds.x * scale),
        non_negative_i32(bounds.y * scale),
    )
    .of_size(
        non_negative_u32(bounds.width * scale).max(1),
        non_negative_u32(bounds.height * scale).max(1),
    )
}

fn parse_color(value: &str, opacity: f32) -> Rgba<u8> {
    let hex = value.strip_prefix('#').unwrap_or(value);
    let parsed = u32::from_str_radix(hex, 16).unwrap_or(0xD9FF43);
    let (red, green, blue) = if hex.len() == 6 {
        (
            ((parsed >> 16) & 0xff) as u8,
            ((parsed >> 8) & 0xff) as u8,
            (parsed & 0xff) as u8,
        )
    } else {
        (217, 255, 67)
    };
    Rgba([red, green, blue, (opacity.clamp(0.0, 1.0) * 255.0) as u8])
}

fn default_save_path() -> Result<PathBuf, ShotHubError> {
    let directory = dirs::picture_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("ShotHub");
    fs::create_dir_all(&directory).map_err(ShotHubError::export)?;
    Ok(directory.join(format!(
        "ShotHub_{}.png",
        Local::now().format("%Y-%m-%d_%H-%M-%S")
    )))
}

fn save_atomic(image: &RgbaImage, destination: &Path) -> Result<(), ShotHubError> {
    let temporary = destination.with_extension("png.partial");
    image
        .save_with_format(&temporary, image::ImageFormat::Png)
        .map_err(ShotHubError::export)?;
    fs::rename(&temporary, destination).map_err(ShotHubError::export)
}

fn session_directory() -> PathBuf {
    std::env::temp_dir().join("ShotHub")
}

fn system_font(family: &str) -> Option<FontArc> {
    static FONTS: OnceLock<Mutex<HashMap<String, Option<FontArc>>>> = OnceLock::new();
    let fonts = FONTS.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(cache) = fonts.lock()
        && let Some(font) = cache.get(family)
    {
        return font.clone();
    }

    let loaded = {
        #[cfg(target_os = "windows")]
        let candidates: &[&str] = match family {
            "Ink Free" => &[r"C:\Windows\Fonts\Inkfree.ttf"],
            "Comic Sans MS" => &[r"C:\Windows\Fonts\comic.ttf"],
            _ => &[
                r"C:\Windows\Fonts\segoeui.ttf",
                r"C:\Windows\Fonts\arial.ttf",
            ],
        };
        #[cfg(target_os = "macos")]
        let candidates: &[&str] = &[
            "/System/Library/Fonts/SFNS.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        ];
        #[cfg(target_os = "linux")]
        let candidates: &[&str] = &[
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        ];

        candidates.iter().find_map(|path| {
            fs::read(path)
                .ok()
                .and_then(|bytes| FontArc::try_from_vec(bytes).ok())
        })
    };
    if let Ok(mut cache) = fonts.lock() {
        cache.insert(family.to_owned(), loaded.clone());
    }
    loaded
}

fn non_negative_u32(value: f64) -> u32 {
    value.max(0.0).round().min(f64::from(u32::MAX)) as u32
}

fn non_negative_i32(value: f64) -> i32 {
    value
        .round()
        .clamp(f64::from(i32::MIN), f64::from(i32::MAX)) as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secure_blackout_replaces_source_pixels() {
        let source = RgbaImage::from_pixel(20, 20, Rgba([255, 255, 255, 255]));
        let scene = AnnotationScene {
            version: 1,
            elements: vec![Annotation::Blackout {
                id: "redaction".into(),
                opacity: 1.0,
                bounds: Rect {
                    x: 2.0,
                    y: 2.0,
                    width: 8.0,
                    height: 8.0,
                },
                intensity: 1.0,
            }],
        };
        let output = render_output(
            &source,
            Rect {
                x: 0.0,
                y: 0.0,
                width: 20.0,
                height: 20.0,
            },
            1.0,
            &scene,
        )
        .expect("output should render");
        assert_eq!(output.get_pixel(4, 4), &Rgba([8, 9, 8, 255]));
        assert_eq!(output.get_pixel(15, 15), &Rgba([255, 255, 255, 255]));
    }

    #[test]
    fn rejects_out_of_bounds_selection() {
        let source = RgbaImage::new(100, 100);
        let result = render_output(
            &source,
            Rect {
                x: 90.0,
                y: 90.0,
                width: 20.0,
                height: 20.0,
            },
            1.0,
            &AnnotationScene {
                version: 1,
                elements: vec![],
            },
        );
        assert!(result.is_err());
    }
}
