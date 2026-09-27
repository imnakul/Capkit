use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayDto {
    pub id: String,
    pub name: String,
    pub bounds: Rect,
    pub scale_factor: f64,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSessionDto {
    pub id: String,
    pub phase: &'static str,
    pub display: DisplayDto,
    pub snapshot_path: String,
    pub color_space: &'static str,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnScreenSessionDto {
    pub display: DisplayDto,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedTargetDto {
    pub id: String,
    pub title: String,
    pub kind: &'static str,
    pub bounds: Rect,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationScene {
    pub version: u8,
    pub elements: Vec<Annotation>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
// Scene fields remain explicit for versioned IPC fidelity even when a renderer does not yet use
// every property (notably text shaping and annotation IDs).
#[allow(dead_code)]
pub enum Annotation {
    Line {
        id: String,
        opacity: f32,
        points: Vec<Point>,
        color: String,
        #[serde(rename = "strokeWidth")]
        stroke_width: f32,
    },
    Arrow {
        id: String,
        opacity: f32,
        points: Vec<Point>,
        color: String,
        #[serde(rename = "strokeWidth")]
        stroke_width: f32,
    },
    CurvedArrow {
        id: String,
        opacity: f32,
        points: Vec<Point>,
        color: String,
        #[serde(rename = "strokeWidth")]
        stroke_width: f32,
    },
    Highlighter {
        id: String,
        opacity: f32,
        points: Vec<Point>,
        color: String,
        #[serde(rename = "strokeWidth")]
        stroke_width: f32,
    },
    Pencil {
        id: String,
        opacity: f32,
        points: Vec<Point>,
        color: String,
        #[serde(rename = "strokeWidth")]
        stroke_width: f32,
    },
    Rectangle {
        id: String,
        opacity: f32,
        bounds: Rect,
        color: String,
        fill: String,
        #[serde(rename = "strokeWidth")]
        stroke_width: f32,
    },
    Ellipse {
        id: String,
        opacity: f32,
        bounds: Rect,
        color: String,
        fill: String,
        #[serde(rename = "strokeWidth")]
        stroke_width: f32,
    },
    Spotlight {
        id: String,
        opacity: f32,
        bounds: Rect,
        color: String,
        intensity: f32,
    },
    Blur {
        id: String,
        opacity: f32,
        bounds: Rect,
        intensity: f32,
    },
    Pixelate {
        id: String,
        opacity: f32,
        bounds: Rect,
        intensity: f32,
    },
    Blackout {
        id: String,
        opacity: f32,
        bounds: Rect,
        intensity: f32,
    },
    Text {
        id: String,
        opacity: f32,
        position: Point,
        text: String,
        color: String,
        #[serde(rename = "fontFamily")]
        font_family: String,
        #[serde(rename = "fontSize")]
        font_size: f32,
    },
    Counter {
        id: String,
        opacity: f32,
        position: Point,
        value: u32,
        color: String,
        radius: f32,
    },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionRequest {
    pub action: CompletionAction,
    pub session_id: String,
    pub selection: Rect,
    pub scene: AnnotationScene,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CompletionAction {
    Copy,
    CopyAndSave,
    Save,
    SaveAs,
    Pin,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CompletionStatus {
    Completed,
    SavePending,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionResult {
    pub action: CompletionAction,
    pub output_path: Option<String>,
    pub status: CompletionStatus,
    pub diagnostic: Option<String>,
    pub cleanup_warning: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrollingCaptureRequest {
    pub session_id: String,
    pub selection: Rect,
    pub max_frames: u8,
    pub wheel_steps: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrollingCaptureResult {
    pub output_path: String,
    pub frame_count: usize,
    pub sticky_header_height: u32,
    pub stopped_reason: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedCaptureDto {
    pub path: String,
    pub file_name: String,
    pub thumbnail_path: String,
    pub width: u32,
    pub height: u32,
    pub size_bytes: u64,
    pub modified_at: String,
}

/// An image the user imported into the Showcase studio from anywhere on disk.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFileDto {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub modified_at: String,
}

/// A folder the user attached as a Showcase background library.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFolderDto {
    pub path: String,
    pub name: String,
    pub images: Vec<MediaFileDto>,
}

/* -------------------------------------------------------------------------- */
/* Recording                                                                   */
/* -------------------------------------------------------------------------- */

/// A display or window the user can record.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSourceDto {
    pub id: String,
    pub kind: &'static str,
    pub title: String,
    /// Physical pixels. Window sources report their bounds on the owning display.
    pub bounds: Rect,
    pub display_id: String,
    pub scale_factor: f64,
    pub is_primary: bool,
    /// A one-off downscaled preview, so the picker never asks the user to
    /// choose a source blind. Absent when the capture failed for that source
    /// (e.g. a protected window); the source is still selectable.
    pub thumbnail_path: Option<String>,
}

/// What the user asked to record.
///
/// Every mode resolves to one display plus a crop rectangle: the sink writer
/// cannot change input media type mid-stream, so a per-window capture would
/// break the moment the window is resized.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingRequestDto {
    pub display_id: String,
    /// Physical-pixel crop within the display, or `None` for the whole display.
    pub region: Option<Rect>,
    pub fps: u32,
    pub capture_cursor: bool,
    #[serde(default)]
    pub system_audio: bool,
    #[serde(default)]
    pub microphone: bool,
    #[serde(default)]
    pub microphone_device_id: Option<String>,
}

/// Live counters for the recorder dock, emitted at most once per second.
#[derive(Debug, Clone, Copy, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RecordingStatsDto {
    pub paused: bool,
    pub elapsed_seconds: f64,
    pub encoded_frames: u64,
    pub dropped_frames: u64,
    pub bytes_written: u64,
}

/// Everything a finished recording produced, as paths for the asset protocol.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingArtifactsDto {
    pub id: String,
    pub directory: String,
    pub video_path: String,
    pub cursor_path: Option<String>,
    pub system_audio_path: Option<String>,
    pub microphone_path: Option<String>,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub duration_seconds: f64,
    pub stats: RecordingStatsDto,
}

/// An audio endpoint the user can record from.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceDto {
    pub id: String,
    pub name: String,
    pub kind: &'static str,
    pub is_default: bool,
}

/// One contiguous run of a single cursor shape.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorShapeSpanDto {
    pub time: f64,
    pub shape: &'static str,
}

/// A pointer button transition.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorEventDto {
    pub time: f64,
    pub kind: &'static str,
    pub button: &'static str,
    pub x: f32,
    pub y: f32,
}

/// Cursor positions and clicks sampled alongside the video.
///
/// Positions are parallel arrays rather than an array of objects: a ten-minute
/// recording is roughly 150k samples, which is ~2 MB and ~30 ms to parse this
/// way versus ~5 MB and ~150 ms as objects, and it drops straight into typed
/// arrays on the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorTrackDto {
    pub version: u8,
    /// Seconds since the first encoded video frame.
    pub times: Vec<f64>,
    /// Display-local physical pixels.
    pub xs: Vec<f32>,
    pub ys: Vec<f32>,
    pub events: Vec<CursorEventDto>,
    pub shapes: Vec<CursorShapeSpanDto>,
    /// The recorded area in physical desktop px: the whole display, or the
    /// crop origin with the video's size for Window and Region recordings.
    pub display_bounds: Rect,
    pub scale_factor: f64,
}
