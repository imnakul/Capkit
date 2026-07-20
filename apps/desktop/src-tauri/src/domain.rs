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
    Save,
    SaveAs,
    Pin,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionResult {
    pub action: CompletionAction,
    pub output_path: Option<String>,
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
