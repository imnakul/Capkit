#[cfg(debug_assertions)]
use std::time::Instant;
use std::{
    cmp::Reverse,
    collections::HashMap,
    fs,
    hash::{DefaultHasher, Hash, Hasher},
    mem,
    path::{Path, PathBuf},
    sync::{Arc, Condvar, Mutex, OnceLock},
    thread,
    time::Duration,
};

#[cfg(test)]
use std::sync::atomic::{AtomicUsize, Ordering};

use ab_glyph::FontArc;
use chrono::{DateTime, Local, Utc};
use image::{Rgba, RgbaImage, imageops};
use imageproc::{
    drawing::{
        draw_filled_circle_mut, draw_filled_rect_mut, draw_hollow_ellipse_mut,
        draw_hollow_rect_mut, draw_line_segment_mut, draw_polygon_mut, draw_text_mut,
    },
    rect::Rect as ImageRect,
};
use uuid::Uuid;

use crate::{
    domain::{
        Annotation, AnnotationScene, CaptureSessionDto, ColorFormat, CompletionAction,
        CompletionRequest, CompletionResult, CompletionStatus, DetectedTargetDto, DisplayDto,
        MAX_SCENE_GEOMETRY_POINTS, PickColorRequest, PickedColorDto, Point, RecognizedTextDto,
        Rect, SavedCaptureDto, ScrollingCaptureRequest, ScrollingCaptureResult, StrokeGeometry,
        TextCopyResult, TextCopyStatus, TextRecognitionRequest,
    },
    error::SnaphubError,
    platform::{
        CaptureBackend, ClipboardBackend, PermissionBackend, PinnedWindowBackend,
        ScrollingCaptureBackend, TargetDetectionBackend, TextRecognitionBackend, WebViewport,
    },
    services::browser_link::{
        BrowserElementSource, InspectResultDto, InspectTarget, SensitiveMatchDto,
    },
};

use super::paths::display_path;
use super::scrolling::{frames_are_unchanged, stitch_vertical_with_metadata};

enum SessionOutputState {
    Idle,
    Busy,
    SavePending { image: RgbaImage },
    Cancelling { operation_finished: bool },
}

struct SessionOutput {
    state: Mutex<SessionOutputState>,
    boundary: Condvar,
}

impl SessionOutput {
    fn new() -> Self {
        Self {
            state: Mutex::new(SessionOutputState::Idle),
            boundary: Condvar::new(),
        }
    }
}

struct CaptureAsset {
    display: DisplayDto,
    image: RgbaImage,
    scale_factor: f64,
    snapshot_path: PathBuf,
    output: Arc<SessionOutput>,
}

struct ManualScrollingAsset {
    frames: Vec<RgbaImage>,
    output_path: Option<PathBuf>,
}

struct CompletionWork {
    image: RgbaImage,
    scale_factor: f64,
    output: Arc<SessionOutput>,
    pending_image: bool,
}

/// A connected browser source and the page area it should answer for.
type WebPage<'a> = (&'a Arc<dyn BrowserElementSource>, WebViewport);

pub struct CaptureService {
    capture: Arc<dyn CaptureBackend>,
    clipboard: Arc<dyn ClipboardBackend>,
    targets: Arc<dyn TargetDetectionBackend>,
    permissions: Arc<dyn PermissionBackend>,
    scrolling: Arc<dyn ScrollingCaptureBackend>,
    pinning: Arc<dyn PinnedWindowBackend>,
    text_recognition: Arc<dyn TextRecognitionBackend>,
    browser: OnceLock<Arc<dyn BrowserElementSource>>,
    notes_images: OnceLock<PathBuf>,
    sessions: Mutex<HashMap<Uuid, CaptureAsset>>,
    manual_scrolling: Mutex<HashMap<Uuid, ManualScrollingAsset>>,
    save_directory: Mutex<PathBuf>,
    save_output_lock: Mutex<()>,
    /// What was on screen when the capture started, used to name the saved file.
    source_label: Mutex<Option<String>>,
    #[cfg(test)]
    render_count: AtomicUsize,
    #[cfg(test)]
    operation_log: Mutex<Vec<&'static str>>,
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
            + TextRecognitionBackend
            + 'static,
    {
        Self::with_save_directory(backend, load_save_directory())
    }

    fn with_save_directory<T>(backend: Arc<T>, save_directory: PathBuf) -> Self
    where
        T: CaptureBackend
            + ClipboardBackend
            + TargetDetectionBackend
            + PermissionBackend
            + ScrollingCaptureBackend
            + PinnedWindowBackend
            + TextRecognitionBackend
            + 'static,
    {
        let _ = fs::create_dir_all(&save_directory);
        Self {
            capture: backend.clone(),
            clipboard: backend.clone(),
            targets: backend.clone(),
            permissions: backend.clone(),
            scrolling: backend.clone(),
            text_recognition: backend.clone(),
            pinning: backend,
            browser: OnceLock::new(),
            notes_images: OnceLock::new(),
            sessions: Mutex::new(HashMap::new()),
            manual_scrolling: Mutex::new(HashMap::new()),
            save_directory: Mutex::new(save_directory),
            save_output_lock: Mutex::new(()),
            source_label: Mutex::new(None),
            #[cfg(test)]
            render_count: AtomicUsize::new(0),
            #[cfg(test)]
            operation_log: Mutex::new(Vec::new()),
        }
    }

    /// Lets detection, inspection and redaction ask a connected browser extension.
    /// Set once, after the app handle exists. Later calls are ignored.
    pub fn set_browser_source(&self, source: Arc<dyn BrowserElementSource>) {
        let _ = self.browser.set(source);
    }

    /// Where `note-image` completions write their screenshots (`<notes>/images`).
    /// Set once; later calls are ignored.
    pub fn set_notes_images_directory(&self, directory: PathBuf) {
        let _ = self.notes_images.set(directory);
    }

    /// The browser page under `point` and the connected source, when both exist.
    fn web_page_at(&self, point: Point) -> Result<Option<WebPage<'_>>, SnaphubError> {
        let Some(source) = self.browser.get().filter(|source| source.is_connected()) else {
            return Ok(None);
        };
        Ok(self
            .targets
            .web_viewport_at(point)?
            .map(|viewport| (source, viewport)))
    }

    /// Element details for a point or area over a browser page, or `None` when the extension
    /// is not connected, the pointer is not over a page, or the page cannot answer.
    pub fn inspect_web_target(
        &self,
        target: InspectTarget,
    ) -> Result<Option<InspectResultDto>, SnaphubError> {
        let anchor = match &target {
            InspectTarget::Point(point) => *point,
            InspectTarget::Area(area) => Point {
                x: area.x + area.width / 2.0,
                y: area.y + area.height / 2.0,
            },
        };
        Ok(self
            .web_page_at(anchor)?
            .and_then(|(source, viewport)| source.inspect(&viewport, target)))
    }

    /// Sensitive text found in the page behind `area`, with screen-pixel rectangles.
    pub fn find_sensitive_web(
        &self,
        area: Rect,
    ) -> Result<Option<Vec<SensitiveMatchDto>>, SnaphubError> {
        let anchor = Point {
            x: area.x + area.width / 2.0,
            y: area.y + area.height / 2.0,
        };
        Ok(self
            .web_page_at(anchor)?
            .and_then(|(source, viewport)| source.find_sensitive(&viewport, area)))
    }

    pub fn begin(&self, cursor: Point) -> Result<CaptureSessionDto, SnaphubError> {
        #[cfg(debug_assertions)]
        let begin_started = Instant::now();
        if !self.permissions.can_capture()? {
            return Err(SnaphubError::Capture(
                "Screen capture permission is not available".into(),
            ));
        }

        self.remember_source_label();
        self.targets.begin_session()?;
        #[cfg(debug_assertions)]
        let capture_started = Instant::now();
        let captured = self.capture.capture_display_at_point(cursor)?;
        #[cfg(debug_assertions)]
        let capture_ms = capture_started.elapsed().as_millis();
        let id = Uuid::new_v4();
        let session_dir = session_directory().join(id.to_string());
        fs::create_dir_all(&session_dir).map_err(SnaphubError::export)?;
        // BMP avoids PNG compression on the shortcut-to-overlay critical path. The temporary
        // source is deleted at the end of the session; final user exports remain PNG.
        let snapshot_path = session_dir.join("source.bmp");
        #[cfg(debug_assertions)]
        let bmp_started = Instant::now();
        captured
            .image
            .save_with_format(&snapshot_path, image::ImageFormat::Bmp)
            .map_err(SnaphubError::export)?;
        #[cfg(debug_assertions)]
        let bmp_ms = bmp_started.elapsed().as_millis();

        let dto = CaptureSessionDto {
            id: id.to_string(),
            phase: "snapshot-ready",
            display: captured.display.clone(),
            snapshot_path: snapshot_path.to_string_lossy().into_owned(),
            color_space: captured.color_space,
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        let scale_factor = captured.display.scale_factor;
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| SnaphubError::Session("Capture state is unavailable".into()))?;
        sessions.insert(
            id,
            CaptureAsset {
                display: captured.display,
                image: captured.image,
                scale_factor,
                snapshot_path,
                output: Arc::new(SessionOutput::new()),
            },
        );
        #[cfg(debug_assertions)]
        eprintln!(
            "[capture-timing] capture={}ms bmp={}ms begin_total={}ms",
            capture_ms,
            bmp_ms,
            begin_started.elapsed().as_millis()
        );
        Ok(dto)
    }

    pub fn quick_capture(
        &self,
        cursor: Point,
        action: CompletionAction,
    ) -> Result<Option<PathBuf>, SnaphubError> {
        if !self.permissions.can_capture()? {
            return Err(SnaphubError::Capture(
                "Screen capture permission is not available".into(),
            ));
        }
        self.remember_source_label();
        let captured = self.capture.capture_display_at_point(cursor)?;
        match action {
            CompletionAction::Copy => {
                self.clipboard.copy_image(&captured.image)?;
                Ok(None)
            }
            CompletionAction::Save => Ok(Some(self.save_new_image(&captured.image)?)),
            CompletionAction::CopyAndSave
            | CompletionAction::SaveAs
            | CompletionAction::Pin
            | CompletionAction::NoteImage => Err(SnaphubError::Capture(
                "This completion action requires the capture surface".into(),
            )),
        }
    }

    pub fn complete(&self, request: &CompletionRequest) -> Result<CompletionResult, SnaphubError> {
        let id = parse_session_id(&request.session_id)?;
        let work = self.begin_completion(id, false)?;
        if let Err(error) = validate_completion_request(request) {
            self.finish_operation(&work.output, SessionOutputState::Idle);
            return Err(error);
        }
        let output = if work.pending_image {
            work.image
        } else {
            match self.render_capture_output(
                &work.image,
                request.selection,
                work.scale_factor,
                &request.scene,
            ) {
                Ok(output) => output,
                Err(error) => {
                    self.finish_operation(&work.output, SessionOutputState::Idle);
                    return Err(error);
                }
            }
        };

        let output_path = match request.action {
            CompletionAction::Copy => {
                self.record_operation("clipboard");
                if let Err(error) = self.clipboard.copy_image(&output) {
                    self.finish_operation(&work.output, SessionOutputState::Idle);
                    return Err(error);
                }
                None
            }
            CompletionAction::CopyAndSave => {
                self.record_operation("clipboard");
                if let Err(error) = self.clipboard.copy_image(&output) {
                    self.finish_operation(&work.output, SessionOutputState::Idle);
                    return Err(error);
                }
                match self.save_new_image(&output) {
                    Ok(path) => Some(path.to_string_lossy().into_owned()),
                    Err(error) => {
                        self.finish_operation(
                            &work.output,
                            SessionOutputState::SavePending { image: output },
                        );
                        return Ok(CompletionResult {
                            action: request.action,
                            output_path: None,
                            status: CompletionStatus::SavePending,
                            diagnostic: Some(error.to_string()),
                            cleanup_warning: None,
                        });
                    }
                }
            }
            CompletionAction::Save | CompletionAction::SaveAs => {
                match self.save_new_image(&output) {
                    Ok(path) => Some(path.to_string_lossy().into_owned()),
                    Err(error) => {
                        self.finish_operation(&work.output, SessionOutputState::Idle);
                        return Err(error);
                    }
                }
            }
            CompletionAction::NoteImage => {
                // The session stays open so the note can still be retried or
                // the capture finished another way.
                let result = self.write_note_image(request, &output);
                self.finish_operation(&work.output, SessionOutputState::Idle);
                return result.map(|path| CompletionResult {
                    action: request.action,
                    output_path: Some(path.to_string_lossy().into_owned()),
                    status: CompletionStatus::Completed,
                    diagnostic: None,
                    cleanup_warning: None,
                });
            }
            CompletionAction::Pin => {
                if !self.pinning.is_supported() {
                    self.finish_operation(&work.output, SessionOutputState::Idle);
                    return Err(SnaphubError::Window(
                        "Pinned windows are unavailable".into(),
                    ));
                }
                let pin_directory = session_directory().join("pins");
                if let Err(error) = fs::create_dir_all(&pin_directory) {
                    self.finish_operation(&work.output, SessionOutputState::Idle);
                    return Err(SnaphubError::export(error));
                }
                let path = pin_directory.join(format!("{}.png", request.session_id));
                if let Err(error) = output.save(&path) {
                    self.finish_operation(&work.output, SessionOutputState::Idle);
                    return Err(SnaphubError::export(error));
                }
                Some(path.to_string_lossy().into_owned())
            }
        };

        self.mark_committed(&work.output);
        Ok(CompletionResult {
            action: request.action,
            output_path,
            status: CompletionStatus::Completed,
            diagnostic: None,
            cleanup_warning: None,
        })
    }

    /// Writes `<notes>/images/<note id>.png` via a temporary file so a crash never
    /// leaves a half-written screenshot under a note's name.
    fn write_note_image(
        &self,
        request: &CompletionRequest,
        output: &RgbaImage,
    ) -> Result<PathBuf, SnaphubError> {
        let note_id = request
            .note_id
            .as_deref()
            .filter(|id| {
                Uuid::parse_str(id).is_ok_and(|parsed| parsed.hyphenated().to_string() == *id)
            })
            .ok_or_else(|| SnaphubError::Notes("A note needs a valid id".into()))?;
        let directory = self
            .notes_images
            .get()
            .ok_or_else(|| SnaphubError::Notes("The notes folder is not ready".into()))?;
        fs::create_dir_all(directory).map_err(SnaphubError::export)?;
        let path = directory.join(format!("{note_id}.png"));
        let temporary = directory.join(format!("{note_id}.png.tmp"));
        output
            .save_with_format(&temporary, image::ImageFormat::Png)
            .map_err(SnaphubError::export)?;
        fs::rename(&temporary, &path).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            SnaphubError::export(error)
        })?;
        Ok(path)
    }

    pub fn retry_save(&self, session_id: &str) -> Result<CompletionResult, SnaphubError> {
        let id = parse_session_id(session_id)?;
        let work = self.begin_completion(id, true)?;
        match self.save_new_image(&work.image) {
            Ok(path) => {
                self.mark_committed(&work.output);
                Ok(CompletionResult {
                    action: CompletionAction::CopyAndSave,
                    output_path: Some(path.to_string_lossy().into_owned()),
                    status: CompletionStatus::Completed,
                    diagnostic: None,
                    cleanup_warning: None,
                })
            }
            Err(error) => {
                self.finish_operation(
                    &work.output,
                    SessionOutputState::SavePending { image: work.image },
                );
                Ok(CompletionResult {
                    action: CompletionAction::CopyAndSave,
                    output_path: None,
                    status: CompletionStatus::SavePending,
                    diagnostic: Some(error.to_string()),
                    cleanup_warning: None,
                })
            }
        }
    }

    pub fn finalize_committed(&self, session_id: &str) -> Result<(), SnaphubError> {
        let id = parse_session_id(session_id)?;
        self.remove_session(id)
    }

    pub fn cancel(&self, session_id: &str) -> Result<(), SnaphubError> {
        let id = parse_session_id(session_id)?;
        let output = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| SnaphubError::Session("Capture state is unavailable".into()))?;
            sessions
                .get(&id)
                .map(|asset| asset.output.clone())
                .ok_or_else(|| SnaphubError::Session("Capture session has expired".into()))?
        };
        let mut state = output
            .state
            .lock()
            .map_err(|_| SnaphubError::Session("Capture output state is unavailable".into()))?;
        loop {
            match &*state {
                SessionOutputState::Cancelling { operation_finished } if *operation_finished => {
                    break;
                }
                SessionOutputState::Cancelling { .. } => {
                    state = output.boundary.wait(state).map_err(|_| {
                        SnaphubError::Session("Capture output state is unavailable".into())
                    })?;
                }
                SessionOutputState::Idle | SessionOutputState::SavePending { .. } => {
                    *state = SessionOutputState::Cancelling {
                        operation_finished: true,
                    };
                    break;
                }
                SessionOutputState::Busy => {
                    *state = SessionOutputState::Cancelling {
                        operation_finished: false,
                    };
                    state = output.boundary.wait(state).map_err(|_| {
                        SnaphubError::Session("Capture output state is unavailable".into())
                    })?;
                }
            }
        }
        drop(state);
        self.remove_session(id)
    }

    fn begin_completion(&self, id: Uuid, retry: bool) -> Result<CompletionWork, SnaphubError> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| SnaphubError::Session("Capture state is unavailable".into()))?;
        let asset = sessions
            .get(&id)
            .ok_or_else(|| SnaphubError::Session("Capture session has expired".into()))?;
        let output = asset.output.clone();
        let scale_factor = asset.scale_factor;
        let mut state = output
            .state
            .lock()
            .map_err(|_| SnaphubError::Session("Capture output state is unavailable".into()))?;
        let image = if retry {
            match mem::replace(&mut *state, SessionOutputState::Busy) {
                SessionOutputState::SavePending { image } => image,
                previous => {
                    *state = previous;
                    return Err(SnaphubError::Session(
                        "This capture has no copied output waiting to save".into(),
                    ));
                }
            }
        } else {
            if !matches!(&*state, SessionOutputState::Idle) {
                return Err(SnaphubError::Session(
                    "Capture completion is already in progress".into(),
                ));
            }
            *state = SessionOutputState::Busy;
            asset.image.clone()
        };
        drop(state);
        drop(sessions);
        Ok(CompletionWork {
            image,
            scale_factor,
            output,
            pending_image: retry,
        })
    }

    fn finish_operation(&self, output: &SessionOutput, next: SessionOutputState) {
        if let Ok(mut state) = output.state.lock() {
            *state = match &*state {
                SessionOutputState::Cancelling { .. } => SessionOutputState::Cancelling {
                    operation_finished: true,
                },
                _ => next,
            };
            output.boundary.notify_all();
        }
    }

    fn mark_committed(&self, output: &SessionOutput) {
        if let Ok(mut state) = output.state.lock()
            && !matches!(&*state, SessionOutputState::Cancelling { .. })
        {
            *state = SessionOutputState::Busy;
        }
    }

    fn render_capture_output(
        &self,
        source: &RgbaImage,
        selection: Rect,
        scale_factor: f64,
        scene: &AnnotationScene,
    ) -> Result<RgbaImage, SnaphubError> {
        #[cfg(test)]
        self.render_count.fetch_add(1, Ordering::SeqCst);
        self.record_operation("render");
        render_output(source, selection, scale_factor, scene)
    }

    fn record_operation(&self, _operation: &'static str) {
        #[cfg(test)]
        if let Ok(mut operations) = self.operation_log.lock() {
            operations.push(_operation);
        }
    }

    /// Records the focused window's title before the capture overlay takes focus.
    fn remember_source_label(&self) {
        #[cfg(target_os = "windows")]
        if let Ok(mut label) = self.source_label.lock() {
            *label = crate::platform::windows_foreground::foreground_window_title();
        }
    }

    fn save_new_image(&self, image: &RgbaImage) -> Result<PathBuf, SnaphubError> {
        let _guard = self
            .save_output_lock
            .lock()
            .map_err(|_| SnaphubError::Export("Save location is unavailable".into()))?;
        self.record_operation("save");
        let destination = self.next_save_path()?;
        save_atomic(image, &destination)?;
        Ok(destination)
    }

    pub fn detect_targets(
        &self,
        point: Point,
        include_ui_regions: bool,
    ) -> Result<Vec<DetectedTargetDto>, SnaphubError> {
        let mut targets: Vec<DetectedTargetDto> = self
            .targets
            .targets()?
            .into_iter()
            .filter(|target| {
                point.x >= target.bounds.x
                    && point.x <= target.bounds.x + target.bounds.width
                    && point.y >= target.bounds.y
                    && point.y <= target.bounds.y + target.bounds.height
            })
            .collect();
        if include_ui_regions {
            // Over a browser page the extension knows the real elements; otherwise (or when it
            // has nothing for this point) fall back to UI Automation.
            let from_page = match self.web_page_at(point)? {
                Some((source, viewport)) => source.element_at(&viewport, point),
                None => None,
            };
            match from_page {
                Some(elements) if !elements.is_empty() => targets.extend(elements),
                _ => {
                    if let Some(region) = self.targets.ui_region_at(point)? {
                        targets.push(region);
                    }
                }
            }
        }
        targets.sort_by(|left, right| target_area(left).total_cmp(&target_area(right)));
        Ok(targets)
    }

    pub fn list_targets(&self) -> Result<Vec<DetectedTargetDto>, SnaphubError> {
        self.targets.targets()
    }

    pub fn scrolling_supported(&self) -> bool {
        self.scrolling.is_supported()
    }

    pub fn capture_scrolling_automatic(
        &self,
        request: &ScrollingCaptureRequest,
    ) -> Result<ScrollingCaptureResult, SnaphubError> {
        let mut frames = vec![self.capture_scrolling_frame(request)?];
        let mut stopped_reason = "frame-limit";
        let maximum = request.max_frames.clamp(2, 30);
        for _ in 1..maximum {
            let point = self.scrolling_target(request)?;
            self.scrolling
                .scroll_vertical(point, request.wheel_steps.clamp(1, 12))?;
            thread::sleep(Duration::from_millis(150));
            let next = self.capture_scrolling_frame(request)?;
            if frames_are_unchanged(frames.last().expect("initial frame exists"), &next) {
                stopped_reason = if frames.len() == 1 {
                    "no-progress"
                } else {
                    "end-reached"
                };
                break;
            }
            frames.push(next);
        }
        self.write_scrolling_preview(&frames, stopped_reason)
    }

    pub fn begin_manual_scrolling(
        &self,
        request: &ScrollingCaptureRequest,
    ) -> Result<ScrollingCaptureResult, SnaphubError> {
        let id = parse_session_id(&request.session_id)?;
        let frames = vec![self.capture_scrolling_frame(request)?];
        let result = self.write_scrolling_preview(&frames, "manual-ready")?;
        self.manual_scrolling
            .lock()
            .map_err(|_| SnaphubError::Session("Manual scrolling state is unavailable".into()))?
            .insert(
                id,
                ManualScrollingAsset {
                    frames,
                    output_path: Some(PathBuf::from(&result.output_path)),
                },
            );
        Ok(result)
    }

    pub fn add_manual_scrolling_frame(
        &self,
        request: &ScrollingCaptureRequest,
    ) -> Result<ScrollingCaptureResult, SnaphubError> {
        let id = parse_session_id(&request.session_id)?;
        let next = self.capture_scrolling_frame(request)?;
        let mut manual = self
            .manual_scrolling
            .lock()
            .map_err(|_| SnaphubError::Session("Manual scrolling state is unavailable".into()))?;
        let state = manual.get_mut(&id).ok_or_else(|| {
            SnaphubError::Session("Manual scrolling capture has not started".into())
        })?;
        let stopped_reason = if frames_are_unchanged(
            state
                .frames
                .last()
                .expect("manual session has an initial frame"),
            &next,
        ) {
            "no-change"
        } else {
            state.frames.push(next);
            "manual-ready"
        };
        let result = self.write_scrolling_preview(&state.frames, stopped_reason)?;
        if let Some(previous) = state
            .output_path
            .replace(PathBuf::from(&result.output_path))
        {
            let _ = fs::remove_file(previous);
        }
        Ok(result)
    }

    pub fn cancel_manual_scrolling(&self, session_id: &str) -> Result<(), SnaphubError> {
        let id = parse_session_id(session_id)?;
        let state = self
            .manual_scrolling
            .lock()
            .map_err(|_| SnaphubError::Session("Manual scrolling state is unavailable".into()))?
            .remove(&id);
        if let Some(path) = state.and_then(|asset| asset.output_path) {
            let _ = fs::remove_file(path);
        }
        Ok(())
    }

    /// Puts plain text on the clipboard (a note's Markdown).
    pub fn copy_plain_text(&self, text: &str) -> Result<(), SnaphubError> {
        self.clipboard.copy_text(text)
    }

    pub fn copy_image_path(&self, path: &Path) -> Result<(), SnaphubError> {
        let image = image::open(path)
            .map_err(SnaphubError::export)?
            .into_rgba8();
        self.clipboard.copy_image(&image)
    }

    /// Copies the frozen snapshot's colour at a display-local logical point.
    /// Reads the captured physical pixel, so the value matches the screen rather than the scaled preview.
    pub fn pick_color(&self, request: &PickColorRequest) -> Result<PickedColorDto, SnaphubError> {
        let id = parse_session_id(&request.session_id)?;
        let pixel = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| SnaphubError::Session("Capture state is unavailable".into()))?;
            let asset = sessions
                .get(&id)
                .ok_or_else(|| SnaphubError::Session("Capture session has expired".into()))?;
            pixel_at(&asset.image, request.point, asset.scale_factor)?
        };
        let picked = format_color(pixel, request.format);
        self.clipboard.copy_text(&picked.copied)?;
        Ok(picked)
    }

    pub fn is_text_recognition_supported(&self) -> bool {
        self.text_recognition.is_text_recognition_supported()
    }

    /// Reads text in the raw selection. Annotations are excluded so arrows and
    /// labels drawn on top don't turn into stray characters.
    pub fn recognize_text(
        &self,
        request: &TextRecognitionRequest,
    ) -> Result<RecognizedTextDto, SnaphubError> {
        let id = parse_session_id(&request.session_id)?;
        validate_selection(request.selection)?;
        let (crop, scale) = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| SnaphubError::Session("Capture state is unavailable".into()))?;
            let asset = sessions
                .get(&id)
                .ok_or_else(|| SnaphubError::Session("Capture session has expired".into()))?;
            (
                crop_selection(&asset.image, request.selection, asset.scale_factor)?,
                asset.scale_factor,
            )
        };
        let recognized = self.text_recognition.recognize_text(&crop)?;
        Ok(text_to_logical(recognized, scale))
    }

    /// Copies the selection's text. An empty result copies nothing, so the
    /// caller can keep the capture open and say so.
    pub fn copy_text(
        &self,
        request: &TextRecognitionRequest,
    ) -> Result<TextCopyResult, SnaphubError> {
        let recognized = self.recognize_text(request)?;
        let text = recognized.text.trim();
        if text.is_empty() {
            return Ok(TextCopyResult {
                status: TextCopyStatus::Empty,
                text: String::new(),
                cleanup_warning: None,
            });
        }
        self.clipboard.copy_text(text)?;
        Ok(TextCopyResult {
            status: TextCopyStatus::Copied,
            text: text.to_owned(),
            cleanup_warning: None,
        })
    }

    pub fn save_image_path(&self, path: &Path) -> Result<PathBuf, SnaphubError> {
        let image = image::open(path)
            .map_err(SnaphubError::export)?
            .into_rgba8();
        self.save_new_image(&image)
    }

    pub fn save_directory(&self) -> Result<PathBuf, SnaphubError> {
        self.save_directory
            .lock()
            .map(|directory| directory.clone())
            .map_err(|_| SnaphubError::Export("Save location is unavailable".into()))
    }

    pub fn set_save_directory(&self, directory: PathBuf) -> Result<PathBuf, SnaphubError> {
        if !directory.is_absolute() {
            return Err(SnaphubError::Export(
                "Choose an absolute folder for saved captures".into(),
            ));
        }
        fs::create_dir_all(&directory).map_err(SnaphubError::export)?;
        let directory = display_path(&directory.canonicalize().map_err(SnaphubError::export)?);
        persist_save_directory(&directory)?;
        *self
            .save_directory
            .lock()
            .map_err(|_| SnaphubError::Export("Save location is unavailable".into()))? =
            directory.clone();
        Ok(directory)
    }

    pub fn reset_save_directory(&self) -> Result<PathBuf, SnaphubError> {
        self.set_save_directory(default_save_directory())
    }

    pub fn list_saved_captures(&self) -> Result<Vec<SavedCaptureDto>, SnaphubError> {
        let directory = self.save_directory()?;
        fs::create_dir_all(&directory).map_err(SnaphubError::export)?;
        let mut files = fs::read_dir(&directory)
            .map_err(SnaphubError::export)?
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let path = entry.path();
                let extension = path.extension()?.to_string_lossy().to_ascii_lowercase();
                matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "bmp").then_some(path)
            })
            .filter_map(|path| {
                let metadata = fs::metadata(&path).ok()?;
                let modified = metadata.modified().ok()?;
                Some((path, metadata.len(), modified))
            })
            .collect::<Vec<_>>();
        files.sort_by_key(|item| Reverse(item.2));
        files.truncate(1000);

        let thumbnails = session_directory().join("library-thumbnails");
        fs::create_dir_all(&thumbnails).map_err(SnaphubError::export)?;
        Ok(files
            .into_iter()
            .filter_map(|(path, size_bytes, modified)| {
                let (width, height) = image::image_dimensions(&path).ok()?;
                let thumbnail_path = thumbnail_path_for(&thumbnails, &path, modified);
                if !thumbnail_path.exists() {
                    let image = image::open(&path).ok()?;
                    image
                        .thumbnail(640, 420)
                        .save_with_format(&thumbnail_path, image::ImageFormat::Png)
                        .ok()?;
                }
                let file_name = path.file_name()?.to_string_lossy().into_owned();
                Some(SavedCaptureDto {
                    path: path.to_string_lossy().into_owned(),
                    file_name,
                    thumbnail_path: thumbnail_path.to_string_lossy().into_owned(),
                    width,
                    height,
                    size_bytes,
                    modified_at: DateTime::<Utc>::from(modified).to_rfc3339(),
                })
            })
            .collect::<Vec<_>>())
    }

    /// The drag image for a saved capture: its library thumbnail, or the image itself when none exists yet.
    pub fn drag_preview_path(&self, path: &Path) -> PathBuf {
        let thumbnails = session_directory().join("library-thumbnails");
        fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .map(|modified| thumbnail_path_for(&thumbnails, path, modified))
            .ok()
            .filter(|thumbnail| thumbnail.exists())
            .unwrap_or_else(|| path.to_path_buf())
    }

    pub fn validated_saved_capture(&self, path: &Path) -> Result<PathBuf, SnaphubError> {
        let directory = self
            .save_directory()?
            .canonicalize()
            .map_err(SnaphubError::export)?;
        let candidate = path.canonicalize().map_err(SnaphubError::export)?;
        if !candidate.starts_with(&directory) || !candidate.is_file() {
            return Err(SnaphubError::Export(
                "The requested image is outside the configured save folder".into(),
            ));
        }
        let extension = candidate
            .extension()
            .map(|value| value.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        if !matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "bmp") {
            return Err(SnaphubError::Export(
                "The requested file is not a supported image".into(),
            ));
        }
        Ok(candidate)
    }

    pub fn delete_saved_capture(&self, path: &Path) -> Result<(), SnaphubError> {
        let candidate = self.validated_saved_capture(path)?;
        fs::remove_file(candidate).map_err(SnaphubError::export)
    }

    fn next_save_path(&self) -> Result<PathBuf, SnaphubError> {
        let directory = self.save_directory()?;
        fs::create_dir_all(&directory).map_err(SnaphubError::export)?;
        let label = self
            .source_label
            .lock()
            .ok()
            .and_then(|label| label.as_deref().and_then(file_name_label))
            .unwrap_or_else(|| "CapKit".into());
        let stem = format!(
            "{label}_{}_CapKit",
            Local::now().format("%Y-%m-%d_%H-%M-%S-%3f")
        );
        for suffix in 0..10_000_u32 {
            let file_name = if suffix == 0 {
                format!("{stem}.png")
            } else {
                format!("{stem}-{suffix}.png")
            };
            let candidate = directory.join(file_name);
            let partial = candidate.with_extension("png.partial");
            if !candidate.exists() && !partial.exists() {
                return Ok(candidate);
            }
        }
        Err(SnaphubError::Export(
            "A unique capture filename could not be allocated".into(),
        ))
    }

    fn remove_session(&self, id: Uuid) -> Result<(), SnaphubError> {
        if let Ok(mut manual) = self.manual_scrolling.lock()
            && let Some(path) = manual.remove(&id).and_then(|asset| asset.output_path)
        {
            let _ = fs::remove_file(path);
        }
        let asset = self
            .sessions
            .lock()
            .map_err(|_| SnaphubError::Session("Capture state is unavailable".into()))?
            .remove(&id);
        if let Some(asset) = asset {
            if let Ok(mut state) = asset.output.state.lock() {
                *state = SessionOutputState::Idle;
                asset.output.boundary.notify_all();
            }
            if let Some(directory) = asset.snapshot_path.parent() {
                let _ = fs::remove_dir_all(directory);
            }
        }
        Ok(())
    }

    fn scrolling_target(&self, request: &ScrollingCaptureRequest) -> Result<Point, SnaphubError> {
        let id = parse_session_id(&request.session_id)?;
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| SnaphubError::Session("Capture state is unavailable".into()))?;
        let asset = sessions
            .get(&id)
            .ok_or_else(|| SnaphubError::Session("Capture session is unavailable".into()))?;
        Ok(Point {
            x: (asset.display.bounds.x + request.selection.x + request.selection.width / 2.0)
                * asset.scale_factor,
            y: (asset.display.bounds.y + request.selection.y + request.selection.height / 2.0)
                * asset.scale_factor,
        })
    }

    fn capture_scrolling_frame(
        &self,
        request: &ScrollingCaptureRequest,
    ) -> Result<RgbaImage, SnaphubError> {
        let point = self.scrolling_target(request)?;
        let captured = self.capture.capture_display_at_point(point)?;
        let scale = captured.display.scale_factor;
        let x = non_negative_u32(request.selection.x * scale);
        let y = non_negative_u32(request.selection.y * scale);
        let width = non_negative_u32(request.selection.width * scale).max(1);
        let height = non_negative_u32(request.selection.height * scale).max(1);
        if x.saturating_add(width) > captured.image.width()
            || y.saturating_add(height) > captured.image.height()
        {
            return Err(SnaphubError::Capture(
                "Scrolling region falls outside the active display".into(),
            ));
        }
        Ok(imageops::crop_imm(&captured.image, x, y, width, height).to_image())
    }

    fn write_scrolling_preview(
        &self,
        frames: &[RgbaImage],
        stopped_reason: &'static str,
    ) -> Result<ScrollingCaptureResult, SnaphubError> {
        let maximum_overlap = frames[0].height().saturating_mul(4) / 5;
        let result = stitch_vertical_with_metadata(frames, 16, maximum_overlap)?;
        let directory = session_directory().join("scroll");
        fs::create_dir_all(&directory).map_err(SnaphubError::export)?;
        let output = directory.join(format!("{}.png", Uuid::new_v4()));
        result
            .image
            .save_with_format(&output, image::ImageFormat::Png)
            .map_err(SnaphubError::export)?;
        Ok(ScrollingCaptureResult {
            output_path: output.to_string_lossy().into_owned(),
            frame_count: frames.len(),
            sticky_header_height: result.sticky_header_height,
            stopped_reason,
        })
    }
}

impl Drop for CaptureService {
    fn drop(&mut self) {
        if let Ok(manual) = self.manual_scrolling.get_mut() {
            for (_, asset) in manual.drain() {
                if let Some(path) = asset.output_path {
                    let _ = fs::remove_file(path);
                }
            }
        }
        if let Ok(sessions) = self.sessions.get_mut() {
            for (_, asset) in sessions.drain() {
                if let Some(directory) = asset.snapshot_path.parent() {
                    let _ = fs::remove_dir_all(directory);
                }
            }
        }
    }
}

fn target_area(target: &DetectedTargetDto) -> f64 {
    target.bounds.width * target.bounds.height
}

fn pixel_at(image: &RgbaImage, point: Point, scale: f64) -> Result<Rgba<u8>, SnaphubError> {
    if !point.x.is_finite() || !point.y.is_finite() || point.x < 0.0 || point.y < 0.0 {
        return Err(SnaphubError::Session("Colour point is invalid".into()));
    }
    let x = (point.x * scale).floor();
    let y = (point.y * scale).floor();
    if x >= f64::from(image.width()) || y >= f64::from(image.height()) {
        return Err(SnaphubError::Session(
            "Colour point falls outside the captured display".into(),
        ));
    }
    // Bounds-checked above, so the truncating casts stay inside the image.
    Ok(*image.get_pixel(x as u32, y as u32))
}

fn format_color(pixel: Rgba<u8>, format: ColorFormat) -> PickedColorDto {
    let [red, green, blue, _] = pixel.0;
    let hex = format!("#{red:02X}{green:02X}{blue:02X}");
    let copied = match format {
        ColorFormat::Hex => hex.clone(),
        ColorFormat::Rgb => format!("rgb({red}, {green}, {blue})"),
    };
    PickedColorDto { hex, copied }
}

fn parse_session_id(session_id: &str) -> Result<Uuid, SnaphubError> {
    Uuid::parse_str(session_id).map_err(|_| SnaphubError::Session("Invalid capture session".into()))
}

fn validate_completion_request(request: &CompletionRequest) -> Result<(), SnaphubError> {
    if request.scene.version != 1 {
        return Err(SnaphubError::Session(format!(
            "Unsupported annotation scene version {}",
            request.scene.version
        )));
    }
    validate_scene_geometry(&request.scene)?;
    validate_selection(request.selection)
}

/// Checks the frontend-computed stroke geometry before any pixel is drawn.
fn validate_scene_geometry(scene: &AnnotationScene) -> Result<(), SnaphubError> {
    let mut total = 0_usize;
    for geometry in scene
        .elements
        .iter()
        .filter_map(Annotation::stroke_geometry)
    {
        geometry.validate().map_err(|reason| {
            SnaphubError::Export(format!("Invalid annotation geometry: {reason}"))
        })?;
        total = total.saturating_add(geometry.point_count());
        if total > MAX_SCENE_GEOMETRY_POINTS {
            return Err(SnaphubError::Export(
                "The annotations are too detailed to export. Simplify or remove some styled shapes.".into(),
            ));
        }
    }
    Ok(())
}

fn validate_selection(selection: Rect) -> Result<(), SnaphubError> {
    if !selection.x.is_finite()
        || !selection.y.is_finite()
        || !selection.width.is_finite()
        || !selection.height.is_finite()
        || selection.x < 0.0
        || selection.y < 0.0
        || selection.width <= 0.0
        || selection.height <= 0.0
    {
        return Err(SnaphubError::Session(
            "A positive selection inside the display is required".into(),
        ));
    }
    Ok(())
}

fn crop_selection(
    source: &RgbaImage,
    selection: Rect,
    scale: f64,
) -> Result<RgbaImage, SnaphubError> {
    let x = non_negative_u32(selection.x * scale);
    let y = non_negative_u32(selection.y * scale);
    let width = non_negative_u32(selection.width * scale).max(1);
    let height = non_negative_u32(selection.height * scale).max(1);
    if x.saturating_add(width) > source.width() || y.saturating_add(height) > source.height() {
        return Err(SnaphubError::Export(
            "Selection falls outside the captured display".into(),
        ));
    }
    Ok(imageops::crop_imm(source, x, y, width, height).to_image())
}

/// Converts recogniser word bounds from captured pixels to selection-local logical coordinates.
fn text_to_logical(mut recognized: RecognizedTextDto, scale: f64) -> RecognizedTextDto {
    let scale = if scale > 0.0 { scale } else { 1.0 };
    for word in recognized
        .lines
        .iter_mut()
        .flat_map(|line| line.words.iter_mut())
    {
        word.bounds = Rect {
            x: word.bounds.x / scale,
            y: word.bounds.y / scale,
            width: word.bounds.width / scale,
            height: word.bounds.height / scale,
        };
    }
    recognized
}

fn render_output(
    source: &RgbaImage,
    selection: Rect,
    scale: f64,
    scene: &AnnotationScene,
) -> Result<RgbaImage, SnaphubError> {
    let mut output = crop_selection(source, selection, scale)?;
    for annotation in &scene.elements {
        render_annotation(&mut output, annotation, scale);
    }
    Ok(output)
}

/// Draws a styled or rounded shape from the frontend's geometry: fill, then strokes, then dots.
fn render_stroke_geometry(
    canvas: &mut RgbaImage,
    annotation: &Annotation,
    geometry: &StrokeGeometry,
    scale: f64,
) {
    let (color, fill, stroke_width, opacity) = match annotation {
        Annotation::Line {
            color,
            stroke_width,
            opacity,
            ..
        }
        | Annotation::Arrow {
            color,
            stroke_width,
            opacity,
            ..
        }
        | Annotation::CurvedArrow {
            color,
            stroke_width,
            opacity,
            ..
        } => (color, None, *stroke_width, *opacity),
        Annotation::Rectangle {
            color,
            fill,
            stroke_width,
            opacity,
            ..
        }
        | Annotation::Ellipse {
            color,
            fill,
            stroke_width,
            opacity,
            ..
        } => (color, Some(fill), *stroke_width, *opacity),
        _ => return,
    };
    if let (Some(fill), Some(polygon)) = (fill, geometry.fill.as_ref())
        && fill != "transparent"
    {
        fill_polygon(canvas, polygon, scale, parse_color(fill, opacity));
    }
    let pixel = parse_color(color, opacity);
    for stroke in &geometry.strokes {
        for pair in stroke.windows(2) {
            draw_thick_line(canvas, pair[0], pair[1], stroke_width, scale, pixel);
        }
    }
    let radius = non_negative_i32(f64::from(stroke_width) * scale / 2.0).max(1);
    for dot in &geometry.dots {
        draw_filled_circle_mut(
            canvas,
            (
                non_negative_i32(dot.x * scale),
                non_negative_i32(dot.y * scale),
            ),
            radius,
            pixel,
        );
    }
}

fn fill_polygon(canvas: &mut RgbaImage, polygon: &[Point], scale: f64, pixel: Rgba<u8>) {
    let mut points: Vec<imageproc::point::Point<i32>> = polygon
        .iter()
        .map(|point| {
            imageproc::point::Point::new(
                (point.x * scale).round() as i32,
                (point.y * scale).round() as i32,
            )
        })
        .collect();
    points.dedup();
    while points.len() > 1 && points.first() == points.last() {
        points.pop();
    }
    if points.len() >= 3 {
        draw_polygon_mut(canvas, &points, pixel);
    }
}

fn render_annotation(canvas: &mut RgbaImage, annotation: &Annotation, scale: f64) {
    if let Some(geometry) = annotation.stroke_geometry() {
        render_stroke_geometry(canvas, annotation, geometry, scale);
        return;
    }
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
        }
        | Annotation::Pencil {
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
            if matches!(
                annotation,
                Annotation::Arrow { .. } | Annotation::CurvedArrow { .. }
            ) && let [.., before, tip] = points.as_slice()
            {
                draw_arrow_head(canvas, *before, *tip, *stroke_width, scale, pixel);
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
                let color = parse_color(color, *opacity);
                let pixel_size = (f64::from(*font_size) * scale) as f32;
                for (index, line) in text.split('\n').enumerate() {
                    draw_text_mut(
                        canvas,
                        color,
                        non_negative_i32(position.x * scale),
                        non_negative_i32(position.y * scale + text_line_offset(pixel_size, index)),
                        pixel_size,
                        &font,
                        line,
                    );
                }
            }
        }
    }
}

/// Line height multiple shared with the TypeScript canvas (`TEXT_LINE_HEIGHT`).
const TEXT_LINE_HEIGHT: f32 = 1.2;

/// Vertical offset in output pixels of the zero-based text line `index`.
fn text_line_offset(pixel_size: f32, index: usize) -> f64 {
    f64::from(pixel_size * TEXT_LINE_HEIGHT) * index as f64
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
    let delta_x = end.x - start.x;
    let delta_y = end.y - start.y;
    let length = delta_x.hypot(delta_y).max(1.0);
    let normal_x = -delta_y / length;
    let normal_y = delta_x / length;
    for offset in -radius..=radius {
        let offset_x = normal_x * f64::from(offset);
        let offset_y = normal_y * f64::from(offset);
        draw_line_segment_mut(
            canvas,
            (
                (start.x * scale + offset_x) as f32,
                (start.y * scale + offset_y) as f32,
            ),
            (
                (end.x * scale + offset_x) as f32,
                (end.y * scale + offset_y) as f32,
            ),
            color,
        );
    }
}

fn draw_arrow_head(
    canvas: &mut RgbaImage,
    before: Point,
    tip: Point,
    width: f32,
    scale: f64,
    color: Rgba<u8>,
) {
    let angle = (tip.y - before.y).atan2(tip.x - before.x);
    let length = f64::from(width).max(2.0) * 4.0;
    for wing_angle in [angle + 2.55, angle - 2.55] {
        let wing = Point {
            x: tip.x + wing_angle.cos() * length,
            y: tip.y + wing_angle.sin() * length,
        };
        draw_thick_line(canvas, tip, wing, width, scale, color);
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

/// Turns a window title into a safe file-name prefix, or `None` when nothing is left.
fn file_name_label(title: &str) -> Option<String> {
    let cleaned: String = title
        .chars()
        .map(|character| {
            if character.is_control() || "<>:\"/\\|?*".contains(character) {
                ' '
            } else {
                character
            }
        })
        .collect();
    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let shortened: String = collapsed.chars().take(60).collect();
    let trimmed = shortened.trim_matches(|character: char| {
        character == '.' || character == '_' || character.is_whitespace()
    });
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

fn default_save_directory() -> PathBuf {
    dirs::picture_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("CapKit")
}

#[derive(serde::Deserialize, serde::Serialize)]
struct StoragePreferences {
    save_directory: PathBuf,
    #[serde(default)]
    recording_directory: Option<PathBuf>,
}

fn storage_preferences_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| std::env::temp_dir().join("CapKit"))
        .join("CapKit")
        .join("storage.json")
}

fn previous_snaphub_storage_preferences_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| std::env::temp_dir().join("Snaphub"))
        .join("Snaphub")
        .join("storage.json")
}

fn legacy_storage_preferences_path() -> PathBuf {
    const LEGACY_PRODUCT_DIRECTORY: &str = concat!("Shot", "Hub");
    dirs::config_dir()
        .unwrap_or_else(|| std::env::temp_dir().join(LEGACY_PRODUCT_DIRECTORY))
        .join(LEGACY_PRODUCT_DIRECTORY)
        .join("storage.json")
}

fn load_save_directory() -> PathBuf {
    let current_path = storage_preferences_path();
    if let Some(directory) = read_save_directory(&current_path)
        && let Some(migrated) = migrate_legacy_default_directory(&directory)
    {
        let _ = persist_save_directory(&migrated);
        return migrated;
    }
    let previous_path = previous_snaphub_storage_preferences_path();
    let legacy_path = legacy_storage_preferences_path();
    for path in [&current_path, &previous_path, &legacy_path] {
        let Some(directory) = fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str::<StoragePreferences>(&raw).ok())
            .map(|preferences| preferences.save_directory)
            .filter(|directory| directory.is_absolute())
        else {
            continue;
        };
        if path != &current_path {
            if let Some(migrated) = migrate_legacy_default_directory(&directory) {
                let _ = persist_save_directory(&migrated);
                return migrated;
            }
            let _ = persist_save_directory(&directory);
        }
        let clean = display_path(&directory);
        if clean != directory {
            let _ = persist_save_directory(&clean);
        }
        return clean;
    }
    default_save_directory()
}

/// Reads the whole preferences file, so saving one folder never erases the
/// other. A missing or unparsable file falls back to the photo default with
/// no recordings folder chosen.
fn persist_save_directory(directory: &Path) -> Result<(), SnaphubError> {
    update_storage_preferences(|preferences| {
        preferences.save_directory = directory.to_path_buf();
    })
}

/// Applies one field change to the preferences file, leaving every other
/// field exactly as it was.
fn update_storage_preferences(
    update: impl FnOnce(&mut StoragePreferences),
) -> Result<(), SnaphubError> {
    update_storage_preferences_at(&storage_preferences_path(), update)
}

fn update_storage_preferences_at(
    path: &Path,
    update: impl FnOnce(&mut StoragePreferences),
) -> Result<(), SnaphubError> {
    let mut preferences = read_storage_preferences_from(path);
    update(&mut preferences);
    write_storage_preferences_to(path, &preferences)
}

fn read_storage_preferences() -> StoragePreferences {
    read_storage_preferences_from(&storage_preferences_path())
}

fn read_storage_preferences_from(path: &Path) -> StoragePreferences {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<StoragePreferences>(&raw).ok())
        .unwrap_or(StoragePreferences {
            save_directory: default_save_directory(),
            recording_directory: None,
        })
}

fn write_storage_preferences_to(
    path: &Path,
    preferences: &StoragePreferences,
) -> Result<(), SnaphubError> {
    let parent = path
        .parent()
        .ok_or_else(|| SnaphubError::Export("Storage settings path is invalid".into()))?;
    fs::create_dir_all(parent).map_err(SnaphubError::export)?;
    let bytes = serde_json::to_vec_pretty(preferences).map_err(SnaphubError::export)?;
    fs::write(path, bytes).map_err(SnaphubError::export)
}

/// The user's recordings folder, or the Videos default when none was chosen.
pub(crate) fn load_recording_directory() -> PathBuf {
    let Some(directory) = read_storage_preferences()
        .recording_directory
        .filter(|directory| directory.is_absolute())
    else {
        return default_recording_directory();
    };
    let clean = display_path(&directory);
    if clean != directory {
        let _ = persist_recording_directory(&clean);
    }
    clean
}

pub(crate) fn default_recording_directory() -> PathBuf {
    dirs::video_dir()
        .map(|directory| directory.join("CapKit"))
        .unwrap_or_else(|| std::env::temp_dir().join("CapKit").join("recordings"))
}

pub(crate) fn persist_recording_directory(directory: &Path) -> Result<(), SnaphubError> {
    update_storage_preferences(|preferences| {
        preferences.recording_directory = Some(directory.to_path_buf());
    })
}

/// Where the library thumbnail for `path` lives; keyed by path and modified time.
fn thumbnail_path_for(thumbnails: &Path, path: &Path, modified: std::time::SystemTime) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    modified.hash(&mut hasher);
    thumbnails.join(format!("{:016x}.png", hasher.finish()))
}

#[cfg(test)]
mod storage_preferences_tests {
    use super::*;

    /// A scratch preferences file, so the tests never touch the real config.
    fn scratch_preferences_path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "capkit-storage-preferences-{}.json",
            std::process::id()
        ))
    }

    #[test]
    fn saving_one_folder_keeps_the_other() {
        let path = scratch_preferences_path();
        write_storage_preferences_to(
            &path,
            &StoragePreferences {
                save_directory: PathBuf::from("C:/Photos/CapKit"),
                recording_directory: None,
            },
        )
        .expect("scratch preferences write");

        // Saving the recordings folder keeps the photo folder, through the
        // same read-modify-write the production setters use.
        update_storage_preferences_at(&path, |preferences| {
            preferences.recording_directory = Some(PathBuf::from("D:/Video/CapKit"));
        })
        .expect("recordings folder saves");
        let reloaded = read_storage_preferences_from(&path);
        assert_eq!(reloaded.save_directory, PathBuf::from("C:/Photos/CapKit"));
        assert_eq!(
            reloaded.recording_directory,
            Some(PathBuf::from("D:/Video/CapKit"))
        );

        // Saving the photo folder keeps the recordings folder.
        update_storage_preferences_at(&path, |preferences| {
            preferences.save_directory = PathBuf::from("C:/Photos/Other");
        })
        .expect("photo folder saves");
        let reloaded = read_storage_preferences_from(&path);
        assert_eq!(reloaded.save_directory, PathBuf::from("C:/Photos/Other"));
        assert_eq!(
            reloaded.recording_directory,
            Some(PathBuf::from("D:/Video/CapKit"))
        );

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn the_default_recordings_folder_lives_in_videos() {
        let default = default_recording_directory();
        assert_eq!(
            default.file_name().and_then(|name| name.to_str()),
            Some("CapKit")
        );
        if let Some(video) = dirs::video_dir() {
            assert_eq!(default, video.join("CapKit"));
        }
    }

    #[test]
    fn old_preferences_without_a_recordings_folder_still_parse() {
        let raw = r#"{"save_directory": "C:/Photos/CapKit"}"#;
        let parsed: StoragePreferences = serde_json::from_str(raw).expect("old preferences parse");
        assert_eq!(parsed.save_directory, PathBuf::from("C:/Photos/CapKit"));
        assert_eq!(parsed.recording_directory, None);
    }
}

/// Renames an untouched Snaphub/ShotHub default folder to `CapKit`, so existing
/// captures come along. Returns `None` for any other folder, or when `CapKit`
/// already exists and renaming would merge two libraries.
fn migrate_legacy_default_directory(directory: &Path) -> Option<PathBuf> {
    let target = default_save_directory();
    let pictures = target.parent()?;
    let is_legacy_default = directory.parent() == Some(pictures)
        && directory.file_name().is_some_and(|name| {
            let name = name.to_string_lossy();
            name.eq_ignore_ascii_case("Snaphub") || name.eq_ignore_ascii_case("ShotHub")
        });
    if !is_legacy_default {
        return None;
    }
    if !directory.exists() {
        return Some(target);
    }
    if target.exists() {
        return None;
    }
    fs::rename(directory, &target).ok().map(|()| target)
}

fn read_save_directory(path: &Path) -> Option<PathBuf> {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<StoragePreferences>(&raw).ok())
        .map(|preferences| preferences.save_directory)
        .filter(|directory| directory.is_absolute())
}

fn save_atomic(image: &RgbaImage, destination: &Path) -> Result<(), SnaphubError> {
    let temporary = destination.with_extension("png.partial");
    let result = image
        .save_with_format(&temporary, image::ImageFormat::Png)
        .map_err(SnaphubError::export)
        .and_then(|()| fs::rename(&temporary, destination).map_err(SnaphubError::export));
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

fn session_directory() -> PathBuf {
    std::env::temp_dir().join("CapKit")
}

fn system_font(family: &str) -> Option<FontArc> {
    static FONTS: OnceLock<Mutex<HashMap<String, Option<FontArc>>>> = OnceLock::new();
    let fonts = FONTS.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(cache) = fonts.lock()
        && let Some(font) = cache.get(family)
    {
        return font.clone();
    }

    let loaded = if family == "Caveat Variable" {
        FontArc::try_from_slice(include_bytes!("../../assets/fonts/Caveat-Variable.ttf")).ok()
    } else {
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
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        mpsc,
    };

    use super::*;
    use crate::domain::{RecognizedLineDto, RecognizedWordDto};
    use crate::platform::CapturedDisplay;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!("capkit-{label}-{}", Uuid::new_v4()));
            fs::create_dir_all(&path).expect("test directory should be created");
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    struct FakeBackend {
        source: RgbaImage,
        copied: Mutex<Option<RgbaImage>>,
        copied_text: Mutex<Option<String>>,
        recognized_text: Mutex<String>,
        recognized_size: Mutex<Option<(u32, u32)>>,
        clipboard_calls: AtomicUsize,
        ui_region_calls: AtomicUsize,
        fail_clipboard: AtomicBool,
        clipboard_entered: Mutex<Option<mpsc::Sender<()>>>,
        clipboard_release: Mutex<Option<mpsc::Receiver<()>>>,
        web_viewport: Mutex<Option<WebViewport>>,
    }

    impl FakeBackend {
        fn new() -> Self {
            Self {
                source: RgbaImage::from_pixel(20, 20, Rgba([240, 241, 237, 255])),
                copied: Mutex::new(None),
                copied_text: Mutex::new(None),
                recognized_text: Mutex::new(String::new()),
                recognized_size: Mutex::new(None),
                clipboard_calls: AtomicUsize::new(0),
                ui_region_calls: AtomicUsize::new(0),
                fail_clipboard: AtomicBool::new(false),
                clipboard_entered: Mutex::new(None),
                clipboard_release: Mutex::new(None),
                web_viewport: Mutex::new(None),
            }
        }

        fn block_next_clipboard(&self, entered: mpsc::Sender<()>, release: mpsc::Receiver<()>) {
            *self.clipboard_entered.lock().unwrap() = Some(entered);
            *self.clipboard_release.lock().unwrap() = Some(release);
        }
    }

    impl CaptureBackend for FakeBackend {
        fn capture_display_at_point(&self, _point: Point) -> Result<CapturedDisplay, SnaphubError> {
            Ok(CapturedDisplay {
                display: DisplayDto {
                    id: "fake-display".into(),
                    name: "Fake display".into(),
                    bounds: Rect {
                        x: 0.0,
                        y: 0.0,
                        width: 10.0,
                        height: 10.0,
                    },
                    scale_factor: 2.0,
                    is_primary: true,
                },
                image: self.source.clone(),
                color_space: "srgb",
            })
        }
    }

    impl ClipboardBackend for FakeBackend {
        fn copy_image(&self, image: &RgbaImage) -> Result<(), SnaphubError> {
            self.clipboard_calls.fetch_add(1, Ordering::SeqCst);
            if let Some(entered) = self.clipboard_entered.lock().unwrap().take() {
                let _ = entered.send(());
            }
            if let Some(release) = self.clipboard_release.lock().unwrap().take() {
                let _ = release.recv();
            }
            if self.fail_clipboard.load(Ordering::SeqCst) {
                return Err(SnaphubError::Clipboard("Fake clipboard failure".into()));
            }
            *self.copied.lock().unwrap() = Some(image.clone());
            Ok(())
        }

        fn copy_text(&self, text: &str) -> Result<(), SnaphubError> {
            if self.fail_clipboard.load(Ordering::SeqCst) {
                return Err(SnaphubError::Clipboard("Fake clipboard failure".into()));
            }
            *self.copied_text.lock().unwrap() = Some(text.to_owned());
            Ok(())
        }
    }

    impl TargetDetectionBackend for FakeBackend {
        fn begin_session(&self) -> Result<(), SnaphubError> {
            Ok(())
        }

        fn targets(&self) -> Result<Vec<DetectedTargetDto>, SnaphubError> {
            Ok(Vec::new())
        }

        fn ui_region_at(&self, _point: Point) -> Result<Option<DetectedTargetDto>, SnaphubError> {
            self.ui_region_calls.fetch_add(1, Ordering::SeqCst);
            Ok(None)
        }

        fn web_viewport_at(&self, _point: Point) -> Result<Option<WebViewport>, SnaphubError> {
            Ok(self.web_viewport.lock().unwrap().clone())
        }
    }

    impl TextRecognitionBackend for FakeBackend {
        fn is_text_recognition_supported(&self) -> bool {
            true
        }

        fn recognize_text(&self, image: &RgbaImage) -> Result<RecognizedTextDto, SnaphubError> {
            *self.recognized_size.lock().unwrap() = Some((image.width(), image.height()));
            let text = self.recognized_text.lock().unwrap().clone();
            let lines = if text.trim().is_empty() {
                Vec::new()
            } else {
                vec![RecognizedLineDto {
                    text: text.clone(),
                    words: vec![RecognizedWordDto {
                        text: text.clone(),
                        bounds: Rect {
                            x: 2.0,
                            y: 4.0,
                            width: 6.0,
                            height: 8.0,
                        },
                    }],
                }]
            };
            Ok(RecognizedTextDto {
                text,
                lines,
                language: "en-US".into(),
            })
        }
    }

    impl PermissionBackend for FakeBackend {
        fn can_capture(&self) -> Result<bool, SnaphubError> {
            Ok(true)
        }
    }

    impl ScrollingCaptureBackend for FakeBackend {
        fn is_supported(&self) -> bool {
            false
        }

        fn scroll_vertical(&self, _point: Point, _wheel_steps: i32) -> Result<(), SnaphubError> {
            Ok(())
        }
    }

    impl PinnedWindowBackend for FakeBackend {
        fn is_supported(&self) -> bool {
            false
        }
    }

    fn request_for(session_id: &str) -> CompletionRequest {
        CompletionRequest {
            action: CompletionAction::CopyAndSave,
            session_id: session_id.into(),
            selection: Rect {
                x: 0.0,
                y: 0.0,
                width: 5.0,
                height: 5.0,
            },
            scene: AnnotationScene {
                version: 1,
                elements: vec![Annotation::Blackout {
                    id: "redaction".into(),
                    opacity: 1.0,
                    bounds: Rect {
                        x: 2.0,
                        y: 2.0,
                        width: 2.0,
                        height: 2.0,
                    },
                    intensity: 1.0,
                }],
            },
            note_id: None,
        }
    }

    fn begin_session(service: &CaptureService) -> String {
        service
            .begin(Point { x: 5.0, y: 5.0 })
            .expect("capture should begin")
            .id
    }

    fn set_test_save_directory(service: &CaptureService, path: &Path) {
        *service.save_directory.lock().unwrap() = path.to_path_buf();
    }

    fn operation_log(service: &CaptureService) -> Vec<&'static str> {
        service.operation_log.lock().unwrap().clone()
    }

    fn png_files(directory: &Path) -> Vec<PathBuf> {
        fs::read_dir(directory)
            .map(|entries| {
                entries
                    .filter_map(Result::ok)
                    .map(|entry| entry.path())
                    .filter(|path| path.extension().is_some_and(|value| value == "png"))
                    .collect()
            })
            .unwrap_or_default()
    }

    fn has_partial_file(directory: &Path) -> bool {
        fs::read_dir(directory).is_ok_and(|entries| {
            entries.filter_map(Result::ok).any(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .ends_with(".png.partial")
            })
        })
    }

    #[test]
    fn file_name_label_keeps_readable_titles_and_strips_unsafe_characters() {
        assert_eq!(
            file_name_label("GitHub: capkit/issues? - Google Chrome").as_deref(),
            Some("GitHub capkit issues - Google Chrome")
        );
        assert_eq!(file_name_label("  ...  "), None);
        assert_eq!(
            file_name_label(&"a".repeat(200)).map(|name| name.len()),
            Some(60)
        );
    }

    #[test]
    fn legacy_default_folder_is_left_alone_when_it_is_not_a_default_name() {
        assert_eq!(
            migrate_legacy_default_directory(Path::new("D:/Work/Shots")),
            None
        );
    }

    #[test]
    fn default_save_directory_uses_capkit_folder() {
        assert_eq!(
            default_save_directory().file_name(),
            Some(std::ffi::OsStr::new("CapKit"))
        );
    }

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

    struct FakeBrowser {
        connected: bool,
        elements: Option<Vec<DetectedTargetDto>>,
    }

    impl BrowserElementSource for FakeBrowser {
        fn is_connected(&self) -> bool {
            self.connected
        }

        fn element_at(
            &self,
            _viewport: &WebViewport,
            _point: Point,
        ) -> Option<Vec<DetectedTargetDto>> {
            self.elements.clone()
        }

        fn inspect(
            &self,
            _viewport: &WebViewport,
            _target: InspectTarget,
        ) -> Option<InspectResultDto> {
            None
        }

        fn find_sensitive(
            &self,
            _viewport: &WebViewport,
            _area: Rect,
        ) -> Option<Vec<SensitiveMatchDto>> {
            Some(Vec::new())
        }
    }

    fn page_element() -> DetectedTargetDto {
        DetectedTargetDto {
            id: "ext-k1".into(),
            title: "button".into(),
            kind: "ui-region",
            bounds: Rect {
                x: 10.0,
                y: 10.0,
                width: 40.0,
                height: 20.0,
            },
        }
    }

    fn browser_service(
        name: &str,
        connected: bool,
        elements: Option<Vec<DetectedTargetDto>>,
        over_page: bool,
    ) -> (CaptureService, TestDirectory) {
        let (service, directory, _backend) =
            counted_browser_service(name, connected, elements, over_page);
        (service, directory)
    }

    fn counted_browser_service(
        name: &str,
        connected: bool,
        elements: Option<Vec<DetectedTargetDto>>,
        over_page: bool,
    ) -> (CaptureService, TestDirectory, Arc<FakeBackend>) {
        let directory = TestDirectory::new(name);
        let backend = FakeBackend::new();
        if over_page {
            *backend.web_viewport.lock().unwrap() = Some(WebViewport {
                window_id: 1,
                window_title: "Page".into(),
                viewport: Rect {
                    x: 0.0,
                    y: 0.0,
                    width: 100.0,
                    height: 100.0,
                },
            });
        }
        let backend = Arc::new(backend);
        let service = CaptureService::with_save_directory(backend.clone(), directory.0.clone());
        service.set_browser_source(Arc::new(FakeBrowser {
            connected,
            elements,
        }));
        (service, directory, backend)
    }

    #[test]
    fn hover_over_a_browser_page_uses_the_extension_elements() {
        let (service, _directory) =
            browser_service("web-hover", true, Some(vec![page_element()]), true);
        let targets = service
            .detect_targets(Point { x: 20.0, y: 20.0 }, true)
            .expect("targets");
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].id, "ext-k1");
    }

    #[test]
    fn ui_automation_runs_only_when_the_extension_has_no_elements() {
        let point = Point { x: 20.0, y: 20.0 };
        let (service, _directory, backend) =
            counted_browser_service("web-calls-hit", true, Some(vec![page_element()]), true);
        service.detect_targets(point, true).expect("targets");
        assert_eq!(backend.ui_region_calls.load(Ordering::SeqCst), 0);
        let (service, _directory, backend) =
            counted_browser_service("web-calls-none", true, None, true);
        service.detect_targets(point, true).expect("targets");
        assert_eq!(backend.ui_region_calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn hover_falls_back_when_the_extension_has_nothing_or_is_not_connected_or_not_a_page() {
        for (name, connected, elements, over_page) in [
            ("web-none", true, None, true),
            ("web-empty", true, Some(Vec::new()), true),
            ("web-off", false, Some(vec![page_element()]), true),
            ("web-not-page", true, Some(vec![page_element()]), false),
        ] {
            let (service, _directory) = browser_service(name, connected, elements, over_page);
            let targets = service
                .detect_targets(Point { x: 20.0, y: 20.0 }, true)
                .expect("targets");
            assert!(targets.is_empty(), "{name}");
        }
    }

    #[test]
    fn hover_ignores_the_extension_when_ui_regions_are_not_requested() {
        let (service, _directory) =
            browser_service("web-skip", true, Some(vec![page_element()]), true);
        assert!(
            service
                .detect_targets(Point { x: 20.0, y: 20.0 }, false)
                .expect("targets")
                .is_empty()
        );
    }

    #[test]
    fn web_inspection_and_redaction_need_a_connected_page() {
        let (service, _directory) = browser_service("web-redact", true, None, true);
        let area = Rect {
            x: 0.0,
            y: 0.0,
            width: 50.0,
            height: 50.0,
        };
        assert_eq!(
            service.find_sensitive_web(area).expect("ok"),
            Some(Vec::new())
        );
        let (offline, _directory) = browser_service("web-redact-off", false, None, true);
        assert_eq!(offline.find_sensitive_web(area).expect("ok"), None);
        let (no_page, _directory) = browser_service("web-redact-nopage", true, None, false);
        assert_eq!(no_page.find_sensitive_web(area).expect("ok"), None);
    }

    #[test]
    fn pick_color_reads_the_physical_pixel_and_copies_text() {
        let directory = TestDirectory::new("pick-color");
        let mut fake = FakeBackend::new();
        fake.source.put_pixel(7, 9, Rgba([18, 171, 255, 255]));
        let backend = Arc::new(fake);
        let service = CaptureService::with_save_directory(backend.clone(), directory.0.clone());
        let session_id = begin_session(&service);
        let picked = service
            .pick_color(&PickColorRequest {
                session_id: session_id.clone(),
                point: Point { x: 3.6, y: 4.9 },
                format: ColorFormat::Rgb,
            })
            .expect("colour should be picked");
        assert_eq!(picked.hex, "#12ABFF");
        assert_eq!(picked.copied, "rgb(18, 171, 255)");
        assert_eq!(
            backend.copied_text.lock().unwrap().as_deref(),
            Some("rgb(18, 171, 255)")
        );
        let hex = service
            .pick_color(&PickColorRequest {
                session_id,
                point: Point { x: 0.0, y: 0.0 },
                format: ColorFormat::Hex,
            })
            .expect("colour should be picked");
        assert_eq!(hex.copied, "#F0F1ED");
    }

    #[test]
    fn pick_color_rejects_points_outside_the_snapshot() {
        let directory = TestDirectory::new("pick-color-bounds");
        let backend = Arc::new(FakeBackend::new());
        let service = CaptureService::with_save_directory(backend.clone(), directory.0.clone());
        let session_id = begin_session(&service);
        for point in [
            Point { x: 10.0, y: 2.0 },
            Point { x: -0.5, y: 2.0 },
            Point {
                x: f64::NAN,
                y: 2.0,
            },
        ] {
            assert!(
                service
                    .pick_color(&PickColorRequest {
                        session_id: session_id.clone(),
                        point,
                        format: ColorFormat::Hex,
                    })
                    .is_err()
            );
        }
        assert!(backend.copied_text.lock().unwrap().is_none());
    }

    fn text_request(session_id: &str) -> TextRecognitionRequest {
        TextRecognitionRequest {
            session_id: session_id.into(),
            selection: Rect {
                x: 1.0,
                y: 2.0,
                width: 6.0,
                height: 4.0,
            },
        }
    }

    #[test]
    fn saved_capture_actions_reject_files_outside_the_save_folder() {
        let directory = TestDirectory::new("saved-validation");
        let outside = TestDirectory::new("saved-validation-outside");
        let backend = Arc::new(FakeBackend::new());
        let service = CaptureService::with_save_directory(backend, directory.0.clone());
        let inside_file = directory.0.join("inside.png");
        let outside_file = outside.0.join("outside.png");
        RgbaImage::new(2, 2).save(&inside_file).unwrap();
        RgbaImage::new(2, 2).save(&outside_file).unwrap();
        assert!(service.validated_saved_capture(&inside_file).is_ok());
        assert!(service.validated_saved_capture(&outside_file).is_err());
    }

    #[test]
    fn thumbnail_path_depends_on_path_and_modified_time() {
        let folder = Path::new("thumbs");
        let now = std::time::SystemTime::now();
        let later = now + std::time::Duration::from_secs(1);
        let first = thumbnail_path_for(folder, Path::new("a.png"), now);
        assert_eq!(first, thumbnail_path_for(folder, Path::new("a.png"), now));
        assert_ne!(first, thumbnail_path_for(folder, Path::new("a.png"), later));
        assert_ne!(first, thumbnail_path_for(folder, Path::new("b.png"), now));
    }

    #[test]
    fn recognize_text_crops_physical_pixels_and_returns_logical_bounds() {
        let directory = TestDirectory::new("ocr-bounds");
        let backend = Arc::new(FakeBackend::new());
        *backend.recognized_text.lock().unwrap() = "Invoice 42".into();
        let service = CaptureService::with_save_directory(backend.clone(), directory.0.clone());
        let session_id = begin_session(&service);
        let recognized = service
            .recognize_text(&text_request(&session_id))
            .expect("text should be recognised");
        assert_eq!(*backend.recognized_size.lock().unwrap(), Some((12, 8)));
        let bounds = recognized.lines[0].words[0].bounds;
        assert_eq!(
            (bounds.x, bounds.y, bounds.width, bounds.height),
            (1.0, 2.0, 3.0, 4.0)
        );
        assert_eq!(recognized.language, "en-US");
    }

    #[test]
    fn copy_text_copies_trimmed_text() {
        let directory = TestDirectory::new("ocr-copy");
        let backend = Arc::new(FakeBackend::new());
        *backend.recognized_text.lock().unwrap() = "  Invoice 42\n".into();
        let service = CaptureService::with_save_directory(backend.clone(), directory.0.clone());
        let session_id = begin_session(&service);
        let result = service
            .copy_text(&text_request(&session_id))
            .expect("text should be copied");
        assert!(matches!(result.status, TextCopyStatus::Copied));
        assert_eq!(result.text, "Invoice 42");
        assert_eq!(
            backend.copied_text.lock().unwrap().as_deref(),
            Some("Invoice 42")
        );
    }

    #[test]
    fn copy_text_reports_empty_without_touching_the_clipboard() {
        let directory = TestDirectory::new("ocr-empty");
        let backend = Arc::new(FakeBackend::new());
        let service = CaptureService::with_save_directory(backend.clone(), directory.0.clone());
        let session_id = begin_session(&service);
        let result = service
            .copy_text(&text_request(&session_id))
            .expect("empty text is not an error");
        assert!(matches!(result.status, TextCopyStatus::Empty));
        assert!(backend.copied_text.lock().unwrap().is_none());
    }

    #[test]
    fn recognize_text_rejects_invalid_or_outside_selections() {
        let directory = TestDirectory::new("ocr-invalid");
        let backend = Arc::new(FakeBackend::new());
        let service = CaptureService::with_save_directory(backend.clone(), directory.0.clone());
        let session_id = begin_session(&service);
        for selection in [
            Rect {
                x: 8.0,
                y: 0.0,
                width: 5.0,
                height: 5.0,
            },
            Rect {
                x: 0.0,
                y: 0.0,
                width: 0.0,
                height: 5.0,
            },
        ] {
            let request = TextRecognitionRequest {
                session_id: session_id.clone(),
                selection,
            };
            assert!(service.recognize_text(&request).is_err());
        }
        assert!(backend.recognized_size.lock().unwrap().is_none());
    }

    #[test]
    fn copy_and_save_renders_once_and_saves_clipboard_pixels() {
        let directory = TestDirectory::new("copy-save");
        let backend = Arc::new(FakeBackend::new());
        let service = CaptureService::with_save_directory(backend.clone(), directory.0.clone());
        let session_id = begin_session(&service);
        let result = service
            .complete(&request_for(&session_id))
            .expect("combined completion should succeed");
        assert!(matches!(result.status, CompletionStatus::Completed));
        assert!(matches!(result.action, CompletionAction::CopyAndSave));
        let output_path = PathBuf::from(
            result
                .output_path
                .expect("combined completion saves a file"),
        );
        let saved = image::open(&output_path)
            .expect("saved PNG should decode")
            .into_rgba8();
        let clipboard = backend
            .copied
            .lock()
            .unwrap()
            .clone()
            .expect("clipboard should contain the rendered image");
        assert_eq!(saved, clipboard);
        assert_eq!(saved.dimensions(), (10, 10));
        assert_eq!(saved.get_pixel(4, 4), &Rgba([8, 9, 8, 255]));
        assert_eq!(service.render_count.load(Ordering::SeqCst), 1);
        assert_eq!(backend.clipboard_calls.load(Ordering::SeqCst), 1);
        assert_eq!(operation_log(&service), ["render", "clipboard", "save"]);
        assert!(!has_partial_file(&directory.0));
        service.finalize_committed(&session_id).unwrap();
    }

    #[test]
    fn note_image_renders_into_the_notes_folder_and_keeps_the_session_open() {
        let directory = TestDirectory::new("note-image");
        let images = directory.0.join("notes").join("images");
        let backend = Arc::new(FakeBackend::new());
        let service =
            CaptureService::with_save_directory(backend.clone(), directory.0.join("saves"));
        service.set_notes_images_directory(images.clone());
        let session_id = begin_session(&service);
        let note_id = Uuid::new_v4().to_string();
        let mut request = request_for(&session_id);
        request.action = CompletionAction::NoteImage;
        request.note_id = Some(note_id.clone());

        let result = service
            .complete(&request)
            .expect("note image should render");

        assert!(matches!(result.action, CompletionAction::NoteImage));
        assert!(matches!(result.status, CompletionStatus::Completed));
        let path = images.join(format!("{note_id}.png"));
        assert_eq!(result.output_path.as_deref(), path.to_str());
        let saved = image::open(&path).expect("PNG should decode").into_rgba8();
        assert_eq!(saved.dimensions(), (10, 10));
        assert_eq!(saved.get_pixel(4, 4), &Rgba([8, 9, 8, 255]));
        assert_eq!(backend.clipboard_calls.load(Ordering::SeqCst), 0);
        assert!(!images.join(format!("{note_id}.png.tmp")).exists());
        assert!(png_files(&directory.0.join("saves")).is_empty());

        // The session is still open, so the same capture can be completed again.
        request.action = CompletionAction::Copy;
        service
            .complete(&request)
            .expect("session stays open after a note image");
        service.finalize_committed(&session_id).unwrap();
    }

    #[test]
    fn note_image_rejects_a_missing_or_malformed_note_id() {
        let directory = TestDirectory::new("note-image-bad");
        let backend = Arc::new(FakeBackend::new());
        let service = CaptureService::with_save_directory(backend, directory.0.join("saves"));
        service.set_notes_images_directory(directory.0.join("images"));
        let session_id = begin_session(&service);
        let mut request = request_for(&session_id);
        request.action = CompletionAction::NoteImage;

        assert!(service.complete(&request).is_err());
        request.note_id = Some("../escape".into());
        assert!(service.complete(&request).is_err());
        assert!(!directory.0.join("images").exists());
        service.cancel(&session_id).unwrap();
    }

    #[test]
    fn save_failure_retries_only_the_retained_raster() {
        let directory = TestDirectory::new("save-retry");
        let blocked = directory.0.join("blocked");
        fs::write(&blocked, b"not a directory").unwrap();
        let backend = Arc::new(FakeBackend::new());
        let service = CaptureService::with_save_directory(backend.clone(), blocked.clone());
        let session_id = begin_session(&service);
        let first = service
            .complete(&request_for(&session_id))
            .expect("copy should succeed before save failure");
        assert!(matches!(first.status, CompletionStatus::SavePending));
        assert!(first.output_path.is_none());
        assert!(
            first
                .diagnostic
                .is_some_and(|value| value.contains("SH-EXPORT-001"))
        );
        assert!(png_files(&blocked).is_empty());
        assert!(!has_partial_file(&blocked));

        let repeated = service
            .retry_save(&session_id)
            .expect("a failed retry returns a typed partial result");
        assert!(matches!(repeated.status, CompletionStatus::SavePending));
        assert_eq!(service.render_count.load(Ordering::SeqCst), 1);
        assert_eq!(backend.clipboard_calls.load(Ordering::SeqCst), 1);

        set_test_save_directory(&service, &directory.0);
        let retried = service
            .retry_save(&session_id)
            .expect("save retry should succeed");
        assert!(matches!(retried.status, CompletionStatus::Completed));
        assert_eq!(service.render_count.load(Ordering::SeqCst), 1);
        assert_eq!(backend.clipboard_calls.load(Ordering::SeqCst), 1);
        assert_eq!(
            operation_log(&service),
            ["render", "clipboard", "save", "save", "save"]
        );
        let output_path = PathBuf::from(retried.output_path.unwrap());
        let saved = image::open(&output_path).unwrap().into_rgba8();
        assert_eq!(saved, backend.copied.lock().unwrap().clone().unwrap());
        assert_eq!(png_files(&directory.0).len(), 1);
        assert!(!has_partial_file(&directory.0));
        service.finalize_committed(&session_id).unwrap();
        assert!(service.retry_save(&Uuid::new_v4().to_string()).is_err());
    }

    #[test]
    fn clipboard_failure_preserves_a_retryable_session_without_saving() {
        let directory = TestDirectory::new("clipboard-failure");
        let backend = Arc::new(FakeBackend::new());
        backend.fail_clipboard.store(true, Ordering::SeqCst);
        let service = CaptureService::with_save_directory(backend.clone(), directory.0.clone());
        let session_id = begin_session(&service);
        let request = request_for(&session_id);
        let error = service.complete(&request).unwrap_err();
        assert!(error.to_string().contains("SH-CLIPBOARD-001"));
        assert_eq!(backend.clipboard_calls.load(Ordering::SeqCst), 1);
        assert_eq!(operation_log(&service), ["render", "clipboard"]);
        assert!(png_files(&directory.0).is_empty());
        backend.fail_clipboard.store(false, Ordering::SeqCst);
        service
            .complete(&request)
            .expect("session remains retryable");
        service.finalize_committed(&session_id).unwrap();
    }

    #[test]
    fn render_failure_causes_no_clipboard_or_save_side_effect() {
        let directory = TestDirectory::new("render-failure");
        let backend = Arc::new(FakeBackend::new());
        let service = CaptureService::with_save_directory(backend.clone(), directory.0.clone());
        let session_id = begin_session(&service);
        let mut invalid = request_for(&session_id);
        invalid.selection.width = 20.0;
        let error = service.complete(&invalid).unwrap_err();
        assert!(error.to_string().contains("SH-EXPORT-001"));
        assert_eq!(backend.clipboard_calls.load(Ordering::SeqCst), 0);
        assert_eq!(operation_log(&service), ["render"]);
        assert!(png_files(&directory.0).is_empty());
        service.complete(&request_for(&session_id)).unwrap();
        service.finalize_committed(&session_id).unwrap();
    }

    #[test]
    fn concurrent_duplicate_completion_is_rejected_by_the_session_guard() {
        let directory = TestDirectory::new("duplicate");
        let backend = Arc::new(FakeBackend::new());
        let (entered_sender, entered_receiver) = mpsc::channel();
        let (release_sender, release_receiver) = mpsc::channel();
        backend.block_next_clipboard(entered_sender, release_receiver);
        let service = Arc::new(CaptureService::with_save_directory(
            backend.clone(),
            directory.0.clone(),
        ));
        let session_id = begin_session(&service);
        let request = request_for(&session_id);
        let worker_service = service.clone();
        let worker_request = request.clone();
        let first = thread::spawn(move || worker_service.complete(&worker_request));
        entered_receiver.recv().unwrap();
        assert!(service.complete(&request).is_err());
        release_sender.send(()).unwrap();
        assert!(matches!(
            first.join().unwrap().unwrap().status,
            CompletionStatus::Completed
        ));
        service.finalize_committed(&session_id).unwrap();
        assert_eq!(service.render_count.load(Ordering::SeqCst), 1);
        assert_eq!(backend.clipboard_calls.load(Ordering::SeqCst), 1);
        assert_eq!(png_files(&directory.0).len(), 1);
    }

    #[test]
    fn cancellation_waits_for_a_committed_output_and_keeps_the_file() {
        let directory = TestDirectory::new("cancel-commit");
        let backend = Arc::new(FakeBackend::new());
        let (entered_sender, entered_receiver) = mpsc::channel();
        let (release_sender, release_receiver) = mpsc::channel();
        backend.block_next_clipboard(entered_sender, release_receiver);
        let service = Arc::new(CaptureService::with_save_directory(
            backend.clone(),
            directory.0.clone(),
        ));
        let session_id = begin_session(&service);
        let request = request_for(&session_id);
        let completion_service = service.clone();
        let completion_request = request.clone();
        let completion = thread::spawn(move || completion_service.complete(&completion_request));
        entered_receiver.recv().unwrap();
        let output = service
            .sessions
            .lock()
            .unwrap()
            .get(&Uuid::parse_str(&session_id).unwrap())
            .unwrap()
            .output
            .clone();
        let cancel_service = service.clone();
        let cancel_session = session_id.clone();
        let (cancelled_sender, cancelled_receiver) = mpsc::channel();
        let cancellation = thread::spawn(move || {
            cancel_service.cancel(&cancel_session).unwrap();
            cancelled_sender.send(()).unwrap();
        });
        for _ in 0..100 {
            if matches!(
                &*output.state.lock().unwrap(),
                SessionOutputState::Cancelling { .. }
            ) {
                break;
            }
            thread::sleep(Duration::from_millis(1));
        }
        assert!(matches!(
            &*output.state.lock().unwrap(),
            SessionOutputState::Cancelling { .. }
        ));
        assert!(
            cancelled_receiver
                .recv_timeout(Duration::from_millis(20))
                .is_err()
        );
        release_sender.send(()).unwrap();
        assert!(matches!(
            completion.join().unwrap().unwrap().status,
            CompletionStatus::Completed
        ));
        service.finalize_committed(&session_id).unwrap();
        cancelled_receiver.recv().unwrap();
        cancellation.join().unwrap();
        assert!(
            !service
                .sessions
                .lock()
                .unwrap()
                .contains_key(&Uuid::parse_str(&session_id).unwrap())
        );
        assert_eq!(png_files(&directory.0).len(), 1);
    }

    #[test]
    fn atomic_save_removes_partial_output_when_rename_fails() {
        let directory = TestDirectory::new("partial-cleanup");
        let destination = directory.0.join("blocked.png");
        fs::create_dir(&destination).unwrap();
        let result = save_atomic(
            &RgbaImage::from_pixel(2, 2, Rgba([1, 2, 3, 255])),
            &destination,
        );
        assert!(result.is_err());
        assert!(!directory.0.join("blocked.png.partial").exists());
    }

    #[test]
    fn concurrent_saves_allocate_distinct_filenames() {
        let directory = TestDirectory::new("filename-collision");
        let backend = Arc::new(FakeBackend::new());
        let service = Arc::new(CaptureService::with_save_directory(
            backend.clone(),
            directory.0.clone(),
        ));
        let first_session = begin_session(&service);
        let second_session = begin_session(&service);
        let mut first = request_for(&first_session);
        let mut second = request_for(&second_session);
        first.action = CompletionAction::Save;
        second.action = CompletionAction::Save;
        let first_service = service.clone();
        let first_request = first.clone();
        let first_worker = thread::spawn(move || first_service.complete(&first_request));
        let second_service = service.clone();
        let second_request = second.clone();
        let second_worker = thread::spawn(move || second_service.complete(&second_request));
        first_worker.join().unwrap().unwrap();
        second_worker.join().unwrap().unwrap();
        service.finalize_committed(&first_session).unwrap();
        service.finalize_committed(&second_session).unwrap();
        assert_eq!(png_files(&directory.0).len(), 2);
        assert!(!has_partial_file(&directory.0));
    }

    fn annotation_from_json(raw: &str) -> Annotation {
        serde_json::from_str(raw).expect("annotation JSON should parse")
    }

    fn scene_with(raw_elements: &[&str]) -> AnnotationScene {
        AnnotationScene {
            version: 1,
            elements: raw_elements
                .iter()
                .map(|raw| annotation_from_json(raw))
                .collect(),
        }
    }

    const DASHED_RECT: &str = r##"{"id":"a","kind":"rectangle","opacity":1,"bounds":{"x":10,"y":10,"width":80,"height":40},"color":"#ff0000","fill":"transparent","strokeWidth":2,"strokeStyle":"dashed","strokeGeometry":{"strokes":[[{"x":10,"y":10},{"x":16,"y":10}],[{"x":20,"y":10},{"x":26,"y":10}]],"dots":[]}}"##;

    #[test]
    fn multi_line_text_steps_down_by_the_shared_line_height() {
        assert_eq!(text_line_offset(20.0, 0), 0.0);
        assert!((text_line_offset(20.0, 1) - 24.0).abs() < 1e-6);
        assert!((text_line_offset(20.0, 2) - 48.0).abs() < 1e-6);
        assert_eq!("one\ntwo".split('\n').count(), 2);
    }

    #[test]
    fn dashed_geometry_leaves_gaps_between_dashes() {
        let mut canvas = RgbaImage::from_pixel(100, 80, Rgba([255, 255, 255, 255]));
        render_annotation(&mut canvas, &annotation_from_json(DASHED_RECT), 1.0);
        assert_eq!(canvas.get_pixel(13, 10).0[..3], [255, 0, 0]);
        assert_eq!(canvas.get_pixel(23, 10).0[..3], [255, 0, 0]);
        assert_eq!(canvas.get_pixel(18, 10).0[..3], [255, 255, 255]);
        assert_eq!(canvas.get_pixel(50, 50).0[..3], [255, 255, 255]);
    }

    #[test]
    fn dotted_geometry_stamps_discs() {
        let raw = r##"{"id":"d","kind":"line","opacity":1,"points":[{"x":10,"y":10},{"x":60,"y":10}],"color":"#00ff00","strokeWidth":6,"strokeStyle":"dotted","strokeGeometry":{"strokes":[],"dots":[{"x":20,"y":20},{"x":40,"y":20}]}}"##;
        let mut canvas = RgbaImage::from_pixel(100, 80, Rgba([255, 255, 255, 255]));
        render_annotation(&mut canvas, &annotation_from_json(raw), 1.0);
        assert_eq!(canvas.get_pixel(20, 20).0[..3], [0, 255, 0]);
        assert_eq!(canvas.get_pixel(30, 20).0[..3], [255, 255, 255]);
        assert_eq!(canvas.get_pixel(20, 10).0[..3], [255, 255, 255]);
    }

    #[test]
    fn rounded_geometry_cuts_the_corner_and_fills_the_inside() {
        let raw = r##"{"id":"r","kind":"rectangle","opacity":1,"bounds":{"x":10,"y":10,"width":60,"height":40},"color":"#0000ff","fill":"#00ff00","strokeWidth":2,"cornerRadius":16,"strokeGeometry":{"strokes":[[{"x":26,"y":10},{"x":54,"y":10},{"x":70,"y":26},{"x":70,"y":34},{"x":54,"y":50},{"x":26,"y":50},{"x":10,"y":34},{"x":10,"y":26},{"x":26,"y":10}]],"dots":[],"fill":[{"x":26,"y":10},{"x":54,"y":10},{"x":70,"y":26},{"x":70,"y":34},{"x":54,"y":50},{"x":26,"y":50},{"x":10,"y":34},{"x":10,"y":26},{"x":26,"y":10}]}}"##;
        let mut canvas = RgbaImage::from_pixel(100, 80, Rgba([255, 255, 255, 255]));
        render_annotation(&mut canvas, &annotation_from_json(raw), 1.0);
        assert_eq!(canvas.get_pixel(40, 30).0[..3], [0, 255, 0]);
        assert_eq!(canvas.get_pixel(11, 11).0[..3], [255, 255, 255]);
    }

    #[test]
    fn scene_without_geometry_still_parses_and_renders_the_old_way() {
        let raw = r##"{"id":"o","kind":"rectangle","opacity":1,"bounds":{"x":10,"y":10,"width":30,"height":20},"color":"#ff0000","fill":"transparent","strokeWidth":2}"##;
        let annotation = annotation_from_json(raw);
        assert!(annotation.stroke_geometry().is_none());
        let mut canvas = RgbaImage::from_pixel(60, 60, Rgba([255, 255, 255, 255]));
        render_annotation(&mut canvas, &annotation, 1.0);
        assert_eq!(canvas.get_pixel(10, 15).0[..3], [255, 0, 0]);
    }

    #[test]
    fn geometry_validation_accepts_normal_and_rejects_bad_input() {
        assert!(validate_scene_geometry(&scene_with(&[DASHED_RECT])).is_ok());

        let single_point = r##"{"id":"x","kind":"line","opacity":1,"points":[{"x":0,"y":0},{"x":1,"y":1}],"color":"#ffffff","strokeWidth":2,"strokeGeometry":{"strokes":[[{"x":0,"y":0}]],"dots":[]}}"##;
        assert!(validate_scene_geometry(&scene_with(&[single_point])).is_err());

        let mut scene = scene_with(&[DASHED_RECT]);
        if let Annotation::Rectangle {
            stroke_geometry: Some(geometry),
            ..
        } = &mut scene.elements[0]
        {
            geometry.strokes[0][0].x = f64::NAN;
        }
        assert!(validate_scene_geometry(&scene).is_err());
    }

    #[test]
    fn geometry_validation_caps_total_points() {
        let mut scene = scene_with(&[DASHED_RECT]);
        if let Annotation::Rectangle {
            stroke_geometry: Some(geometry),
            ..
        } = &mut scene.elements[0]
        {
            geometry.dots = vec![Point { x: 1.0, y: 1.0 }; MAX_SCENE_GEOMETRY_POINTS + 1];
        }
        assert!(validate_scene_geometry(&scene).is_err());
    }
}
