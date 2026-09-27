mod domain;
mod error;
mod platform;
mod services;

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    str::FromStr,
    sync::{Arc, Mutex},
    time::Duration,
};

use domain::{
    AudioDeviceDto, CaptureSessionDto, CompletionAction, CompletionRequest, CompletionResult,
    CompletionStatus, DetectedTargetDto, DisplayDto, MediaFileDto, MediaFolderDto,
    OnScreenSessionDto, Point, RecordingArtifactsDto, RecordingRequestDto, RecordingSourceDto,
    RecordingStatsDto, Rect, SavedCaptureDto, ScrollingCaptureRequest, ScrollingCaptureResult,
};
use error::SnaphubError;
use platform::xcap_backend::XcapPlatformBackend;
use services::capture::CaptureService;
use services::recording::RecordingService;
use services::scrolling::stitch_vertical;
#[cfg(debug_assertions)]
use std::time::Instant;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    AW_BLEND, AnimateWindow, SW_HIDE, SetForegroundWindow, ShowWindow,
};

// AnimateWindow's cross-fade masks the one or two frames before WebView2's swap chain
// has composited fresh content, which otherwise reads as a black flash on reveal.
const CAPTURE_REVEAL_MS: u32 = 90;

#[cfg(target_os = "windows")]
fn reveal_window_smoothly(window: &tauri::WebviewWindow) -> Result<(), SnaphubError> {
    // AW_BLEND silently no-ops on windows the system won't temporarily layer (e.g. some
    // always-on-top configurations) — an unchecked result would leave the window in
    // whatever state it was already in. Always fall back to a plain, guaranteed show.
    if let Ok(hwnd) = window.hwnd() {
        let hwnd = windows::Win32::Foundation::HWND(hwnd.0);
        if unsafe { AnimateWindow(hwnd, CAPTURE_REVEAL_MS, AW_BLEND) }.is_ok() {
            // AnimateWindow shows the window through Win32 without telling Tauri, so
            // tao's diff-based `set_visible` still believes it is hidden and a later
            // `window.hide()` becomes a no-op. Calling `window.show()` on the already
            // visible window only syncs tao's `VISIBLE` flag so future hides work.
            window
                .show()
                .map_err(|error| SnaphubError::Window(error.to_string()))?;
            return Ok(());
        }
    }
    window
        .show()
        .map_err(|error| SnaphubError::Window(error.to_string()))
}

#[cfg(not(target_os = "windows"))]
fn reveal_window_smoothly(window: &tauri::WebviewWindow) -> Result<(), SnaphubError> {
    window
        .show()
        .map_err(|error| SnaphubError::Window(error.to_string()))
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutSettingsDto {
    capture: String,
    capture_and_copy: String,
    capture_and_save: String,
    on_screen_toggle: String,
    record_toggle: String,
}

#[derive(Clone)]
struct RegisteredShortcuts {
    settings: ShortcutSettingsDto,
    capture: Shortcut,
    capture_and_copy: Shortcut,
    capture_and_save: Shortcut,
    on_screen_toggle: Shortcut,
    record_toggle: Shortcut,
}

#[derive(Clone, Copy)]
enum ShortcutAction {
    Capture,
    Copy,
    Save,
    OnScreen,
    RecordToggle,
}

struct ShortcutConfiguration(Mutex<RegisteredShortcuts>);
struct PinnedCaptureRegistry(Mutex<HashMap<String, String>>);

enum OnScreenModeState {
    Idle,
    Preparing,
    Active(Box<OnScreenActiveState>),
}

struct OnScreenActiveState {
    display: DisplayDto,
    snapshot: Option<CaptureSessionDto>,
}

struct OnScreenModeRegistry(Mutex<OnScreenModeState>);

#[tauri::command]
async fn begin_capture(app: AppHandle) -> Result<CaptureSessionDto, SnaphubError> {
    #[cfg(debug_assertions)]
    let request_started = Instant::now();
    let cursor = app
        .cursor_position()
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    let point = Point {
        x: cursor.x,
        y: cursor.y,
    };
    let worker_app = app.clone();
    let session = tauri::async_runtime::spawn_blocking(move || {
        worker_app.state::<CaptureService>().begin(point)
    })
    .await
    .map_err(|error| SnaphubError::Capture(format!("Capture begin worker failed: {error}")))??;
    #[cfg(debug_assertions)]
    eprintln!(
        "[capture-timing] request_to_session={}ms",
        request_started.elapsed().as_millis()
    );
    let window = app
        .get_webview_window("capture")
        .ok_or_else(|| SnaphubError::Window("Capture window is unavailable".into()))?;
    let scale = session.display.scale_factor;
    window
        .set_position(PhysicalPosition::new(
            (session.display.bounds.x * scale).round() as i32,
            (session.display.bounds.y * scale).round() as i32,
        ))
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    let overlay_size = overlay_window_size_for_display(&app, &session.display);
    window
        .set_size(PhysicalSize::new(overlay_size.0, overlay_size.1))
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    Ok(session)
}

#[tauri::command]
fn show_capture_surface(app: AppHandle) -> Result<(), SnaphubError> {
    let window = app
        .get_webview_window("capture")
        .ok_or_else(|| SnaphubError::Window("Capture window is unavailable".into()))?;
    #[cfg(debug_assertions)]
    let reveal_started = Instant::now();
    reveal_window_smoothly(&window)?;
    #[cfg(debug_assertions)]
    eprintln!(
        "[capture-timing] reveal={}ms",
        reveal_started.elapsed().as_millis()
    );
    // The shortcut is a direct user gesture, so Windows normally allows this
    // process to promote its capture surface. Without foreground activation the
    // overlay is visible but Escape is still delivered to the previously active
    // application, leaving the user apparently trapped in capture mode.
    #[cfg(target_os = "windows")]
    if let Ok(hwnd) = window.hwnd() {
        let hwnd = windows::Win32::Foundation::HWND(hwnd.0);
        let _ = unsafe { SetForegroundWindow(hwnd) };
    }
    // Keep Tauri's cross-platform focus request as the primary WebView focus path.
    // A platform focus policy can still reject it, so capture visibility must not
    // become dependent on the result.
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
fn dashboard_ready(app: AppHandle) -> Result<(), SnaphubError> {
    if std::env::args().any(|argument| argument == "--background") {
        return Ok(());
    }
    show_dashboard(&app)
}

#[tauri::command]
fn on_screen_session(
    registry: tauri::State<'_, OnScreenModeRegistry>,
) -> Result<OnScreenSessionDto, SnaphubError> {
    let state = registry
        .0
        .lock()
        .map_err(|_| SnaphubError::Window("On-screen mode state is unavailable".into()))?;
    match &*state {
        OnScreenModeState::Active(active) => Ok(OnScreenSessionDto {
            display: active.display.clone(),
        }),
        OnScreenModeState::Idle | OnScreenModeState::Preparing => {
            Err(SnaphubError::Window("On-screen mode is not ready".into()))
        }
    }
}

#[tauri::command]
async fn on_screen_snapshot(
    app: AppHandle,
    reveal_after: bool,
) -> Result<CaptureSessionDto, SnaphubError> {
    tauri::async_runtime::spawn_blocking(move || prepare_on_screen_snapshot(&app, reveal_after))
        .await
        .map_err(|error| SnaphubError::Window(error.to_string()))?
}

#[tauri::command]
fn on_screen_ready(app: AppHandle) -> Result<(), SnaphubError> {
    let window = app
        .get_webview_window("onscreen")
        .ok_or_else(|| SnaphubError::Window("On-screen toolbar window is unavailable".into()))?;
    window
        .show()
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
fn dismiss_on_screen(app: AppHandle) -> Result<(), SnaphubError> {
    close_on_screen_mode(&app)
}

#[tauri::command]
async fn save_on_screen_capture(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<String, SnaphubError> {
    if window.label() != "onscreen" {
        return Err(SnaphubError::Session(
            "Only the on-screen toolbar can save the screen".into(),
        ));
    }

    let point = {
        let registry = app.state::<OnScreenModeRegistry>();
        let state = registry
            .0
            .lock()
            .map_err(|_| SnaphubError::Window("On-screen mode state is unavailable".into()))?;
        match &*state {
            OnScreenModeState::Active(active) => display_center_point(&active.display),
            OnScreenModeState::Idle | OnScreenModeState::Preparing => {
                return Err(SnaphubError::Window("On-screen mode is not active".into()));
            }
        }
    };

    let worker_app = app.clone();
    let saved_path = tauri::async_runtime::spawn_blocking(move || {
        worker_app
            .state::<CaptureService>()
            .quick_capture(point, CompletionAction::Save)
    })
    .await
    .map_err(|error| SnaphubError::Export(format!("Screen save worker failed: {error}")))??;

    match saved_path {
        Some(path) => {
            let path_string = path.to_string_lossy().into_owned();
            emit_capture_saved(&app, &path_string);
            Ok(path_string)
        }
        None => Err(SnaphubError::Export("Screen save produced no file".into())),
    }
}

#[tauri::command]
async fn complete_capture(
    window: WebviewWindow,
    app: AppHandle,
    request: CompletionRequest,
) -> Result<CompletionResult, SnaphubError> {
    ensure_capture_window(&window)?;
    let session_id = request.session_id.clone();
    let action = request.action;
    let worker_app = app.clone();
    let mut result = tauri::async_runtime::spawn_blocking(move || {
        worker_app.state::<CaptureService>().complete(&request)
    })
    .await
    .map_err(|error| {
        SnaphubError::Capture(format!("Capture completion worker failed: {error}"))
    })??;
    if matches!(result.status, CompletionStatus::SavePending) {
        return Ok(result);
    }
    if matches!(
        action,
        CompletionAction::Save | CompletionAction::SaveAs | CompletionAction::CopyAndSave
    ) && let Some(path) = result.output_path.as_deref()
    {
        emit_capture_saved(&app, path);
    }
    let hide_warning = hide_capture_window_with_recovery(&app);
    let pin_result = if matches!(action, CompletionAction::Pin)
        && let Some(path) = result.output_path.as_deref()
    {
        create_pin_window(&app, path)
    } else {
        Ok(())
    };
    apply_post_commit_cleanup(
        &mut result,
        hide_warning,
        app.state::<CaptureService>()
            .finalize_committed(&session_id),
    );
    pin_result?;
    Ok(result)
}

#[tauri::command]
async fn retry_capture_save(
    window: WebviewWindow,
    app: AppHandle,
    session_id: String,
) -> Result<CompletionResult, SnaphubError> {
    ensure_capture_window(&window)?;
    let worker_app = app.clone();
    let worker_session_id = session_id.clone();
    let mut result = tauri::async_runtime::spawn_blocking(move || {
        worker_app
            .state::<CaptureService>()
            .retry_save(&worker_session_id)
    })
    .await
    .map_err(|error| SnaphubError::Export(format!("Capture save worker failed: {error}")))??;
    if matches!(result.status, CompletionStatus::SavePending) {
        return Ok(result);
    }
    if let Some(path) = result.output_path.as_deref() {
        emit_capture_saved(&app, path);
    }
    let hide_warning = hide_capture_window_with_recovery(&app);
    apply_post_commit_cleanup(
        &mut result,
        hide_warning,
        app.state::<CaptureService>()
            .finalize_committed(&session_id),
    );
    Ok(result)
}

// Hide first so Escape feels instant, then wait for cancellation off the main thread.
#[tauri::command]
async fn cancel_capture(
    window: WebviewWindow,
    app: AppHandle,
    session_id: String,
) -> Result<(), SnaphubError> {
    ensure_capture_window(&window)?;
    let hide_result = hide_capture_window(&app);
    let worker_app = app.clone();
    let worker_session_id = session_id.clone();
    let cleanup_result = tauri::async_runtime::spawn_blocking(move || {
        worker_app
            .state::<CaptureService>()
            .cancel(&worker_session_id)
    })
    .await
    .map_err(|error| SnaphubError::Session(format!("Capture cancellation worker failed: {error}")))
    .and_then(|result| result);
    hide_result.and(cleanup_result)
}

#[tauri::command]
fn dismiss_capture(app: AppHandle) -> Result<(), SnaphubError> {
    hide_capture_window(&app)
}

#[tauri::command]
fn pinned_capture_path(
    registry: tauri::State<'_, PinnedCaptureRegistry>,
    label: String,
) -> Result<String, SnaphubError> {
    registry
        .0
        .lock()
        .map_err(|_| SnaphubError::Window("Pinned capture registry is unavailable".into()))?
        .get(&label)
        .cloned()
        .ok_or_else(|| SnaphubError::Window("Pinned capture image is unavailable".into()))
}

#[tauri::command]
fn copy_pinned_capture(
    service: tauri::State<'_, CaptureService>,
    registry: tauri::State<'_, PinnedCaptureRegistry>,
    label: String,
) -> Result<(), SnaphubError> {
    let path = pinned_path_for_label(&registry, &label)?;
    service.copy_image_path(Path::new(&path))
}

#[tauri::command]
fn save_pinned_capture(
    app: AppHandle,
    service: tauri::State<'_, CaptureService>,
    registry: tauri::State<'_, PinnedCaptureRegistry>,
    label: String,
) -> Result<String, SnaphubError> {
    let path = pinned_path_for_label(&registry, &label)?;
    let saved = service
        .save_image_path(Path::new(&path))
        .map(|saved| saved.to_string_lossy().into_owned())?;
    emit_capture_saved(&app, &saved);
    Ok(saved)
}

fn pinned_path_for_label(
    registry: &tauri::State<'_, PinnedCaptureRegistry>,
    label: &str,
) -> Result<String, SnaphubError> {
    registry
        .0
        .lock()
        .map_err(|_| SnaphubError::Window("Pinned capture registry is unavailable".into()))?
        .get(label)
        .cloned()
        .ok_or_else(|| SnaphubError::Window("Pinned capture image is unavailable".into()))
}

fn take_pinned_path(registry: &PinnedCaptureRegistry, label: &str) -> Option<String> {
    registry.0.lock().ok()?.remove(label)
}

#[tauri::command]
async fn detect_targets(
    app: AppHandle,
    point: Point,
    include_ui_regions: bool,
) -> Result<Vec<DetectedTargetDto>, SnaphubError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<CaptureService>()
            .detect_targets(point, include_ui_regions)
    })
    .await
    .map_err(|error| SnaphubError::Capture(format!("Target detection worker failed: {error}")))?
}

#[tauri::command]
fn get_save_directory(service: tauri::State<'_, CaptureService>) -> Result<String, SnaphubError> {
    service
        .save_directory()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn set_save_directory(
    service: tauri::State<'_, CaptureService>,
    directory: String,
) -> Result<String, SnaphubError> {
    service
        .set_save_directory(PathBuf::from(directory))
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn reset_save_directory(service: tauri::State<'_, CaptureService>) -> Result<String, SnaphubError> {
    service
        .reset_save_directory()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn list_saved_captures(app: AppHandle) -> Result<Vec<SavedCaptureDto>, SnaphubError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<CaptureService>().list_saved_captures()
    })
    .await
    .map_err(|error| SnaphubError::Export(format!("Capture library worker failed: {error}")))?
}

#[tauri::command]
fn open_save_directory(service: tauri::State<'_, CaptureService>) -> Result<(), SnaphubError> {
    let directory = service.save_directory()?;
    std::fs::create_dir_all(&directory).map_err(SnaphubError::export)?;
    #[cfg(target_os = "windows")]
    return platform::windows_shell::open_path(&directory, false);
    #[cfg(not(target_os = "windows"))]
    Err(SnaphubError::Window(
        "Opening folders is not implemented on this platform".into(),
    ))
}

#[tauri::command]
fn open_saved_capture(
    service: tauri::State<'_, CaptureService>,
    path: String,
) -> Result<(), SnaphubError> {
    let image = service.validated_saved_capture(Path::new(&path))?;
    #[cfg(target_os = "windows")]
    return platform::windows_shell::open_path(&image, true);
    #[cfg(not(target_os = "windows"))]
    Err(SnaphubError::Window(
        "Opening images is not implemented on this platform".into(),
    ))
}

#[tauri::command]
fn delete_saved_capture(
    service: tauri::State<'_, CaptureService>,
    path: String,
) -> Result<(), SnaphubError> {
    service.delete_saved_capture(Path::new(&path))
}

/// Grants the webview read access to images the user explicitly picked from disk.
///
/// The asset protocol scope is otherwise locked to the CapKit save and temp
/// folders, so every Showcase import has to opt its own file in.
#[tauri::command]
fn import_media_files(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Vec<MediaFileDto>, SnaphubError> {
    let scope = app.asset_protocol_scope();
    let mut imported = Vec::with_capacity(paths.len());
    for raw in &paths {
        let path = PathBuf::from(raw);
        let file = services::media::describe_image(&path)?;
        scope.allow_file(&path).map_err(SnaphubError::export)?;
        imported.push(file);
    }
    Ok(imported)
}

/// Lists the images inside a folder the user attached as a background library.
#[tauri::command]
async fn list_folder_images(
    app: AppHandle,
    directory: String,
) -> Result<MediaFolderDto, SnaphubError> {
    tauri::async_runtime::spawn_blocking(move || -> Result<MediaFolderDto, SnaphubError> {
        let path = PathBuf::from(&directory);
        let folder = services::media::read_folder(&path)?;
        app.asset_protocol_scope()
            .allow_directory(&path, false)
            .map_err(SnaphubError::export)?;
        Ok(folder)
    })
    .await
    .map_err(|error| SnaphubError::Export(format!("Background folder worker failed: {error}")))?
}

#[tauri::command]
fn list_targets(
    service: tauri::State<'_, CaptureService>,
) -> Result<Vec<DetectedTargetDto>, SnaphubError> {
    service.list_targets()
}

#[tauri::command]
fn scrolling_capture_supported(service: tauri::State<'_, CaptureService>) -> bool {
    service.scrolling_supported()
}

#[tauri::command]
async fn stitch_scrolling_frames(frame_paths: Vec<String>) -> Result<String, SnaphubError> {
    tauri::async_runtime::spawn_blocking(move || {
        let frames = frame_paths
            .iter()
            .map(|path| {
                image::open(path)
                    .map(image::DynamicImage::into_rgba8)
                    .map_err(SnaphubError::capture)
            })
            .collect::<Result<Vec<_>, _>>()?;
        let stitched = stitch_vertical(&frames, 24, 420)?;
        let output =
            std::env::temp_dir().join(format!("snaphub-scroll-{}.png", uuid::Uuid::new_v4()));
        stitched
            .save_with_format(&output, image::ImageFormat::Png)
            .map_err(SnaphubError::export)?;
        Ok(output.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| SnaphubError::Capture(error.to_string()))?
}

#[tauri::command]
async fn capture_scrolling_automatic(
    app: AppHandle,
    request: ScrollingCaptureRequest,
) -> Result<ScrollingCaptureResult, SnaphubError> {
    hide_capture_window(&app)?;
    let worker_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(std::time::Duration::from_millis(180));
        worker_app
            .state::<CaptureService>()
            .capture_scrolling_automatic(&request)
    })
    .await
    .map_err(|error| SnaphubError::Capture(format!("Automatic scrolling worker failed: {error}")))
    .and_then(|result| result);
    let restore = restore_capture_window(&app);
    restore.and(result)
}

#[tauri::command]
async fn begin_manual_scrolling_capture(
    app: AppHandle,
    request: ScrollingCaptureRequest,
) -> Result<ScrollingCaptureResult, SnaphubError> {
    hide_capture_window(&app)?;
    let worker_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(std::time::Duration::from_millis(180));
        worker_app
            .state::<CaptureService>()
            .begin_manual_scrolling(&request)
    })
    .await
    .map_err(|error| SnaphubError::Capture(format!("Manual scrolling worker failed: {error}")))
    .and_then(|result| result);
    let restore = restore_capture_window(&app);
    restore.and(result)
}

#[tauri::command]
async fn add_manual_scrolling_frame(
    app: AppHandle,
    request: ScrollingCaptureRequest,
) -> Result<ScrollingCaptureResult, SnaphubError> {
    hide_capture_window(&app)?;
    let worker_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        // The short hidden interval is the manual fallback: the user scrolls the underlying
        // application once, then CapKit samples the same region and restores its preview.
        std::thread::sleep(std::time::Duration::from_millis(1_800));
        worker_app
            .state::<CaptureService>()
            .add_manual_scrolling_frame(&request)
    })
    .await
    .map_err(|error| SnaphubError::Capture(format!("Manual frame worker failed: {error}")))
    .and_then(|result| result);
    let restore = restore_capture_window(&app);
    restore.and(result)
}

#[tauri::command]
fn cancel_manual_scrolling_capture(
    service: tauri::State<'_, CaptureService>,
    session_id: String,
) -> Result<(), SnaphubError> {
    service.cancel_manual_scrolling(&session_id)
}

#[tauri::command]
fn discard_scrolling_output(output_path: String) -> Result<(), SnaphubError> {
    let path = validated_scrolling_output(&output_path)?;
    std::fs::remove_file(path).map_err(SnaphubError::export)
}

#[tauri::command]
async fn complete_scrolling_capture(
    app: AppHandle,
    service: tauri::State<'_, CaptureService>,
    action: CompletionAction,
    session_id: String,
    output_path: String,
) -> Result<CompletionResult, SnaphubError> {
    let source = validated_scrolling_output(&output_path)?;
    let result_path = match action {
        CompletionAction::Copy => {
            service.copy_image_path(&source)?;
            None
        }
        CompletionAction::Save | CompletionAction::SaveAs => Some(
            service
                .save_image_path(&source)?
                .to_string_lossy()
                .into_owned(),
        ),
        CompletionAction::CopyAndSave => {
            return Err(SnaphubError::Capture(
                "Copy & Save is available only for a selected region".into(),
            ));
        }
        CompletionAction::Pin => {
            let image = image::open(&source)
                .map_err(SnaphubError::export)?
                .into_rgba8();
            let pin_directory = std::env::temp_dir().join("CapKit").join("pins");
            std::fs::create_dir_all(&pin_directory).map_err(SnaphubError::export)?;
            let path = pin_directory.join(format!("scroll-{}.png", uuid::Uuid::new_v4()));
            image.save(&path).map_err(SnaphubError::export)?;
            hide_capture_window(&app)?;
            create_pin_window(&app, &path.to_string_lossy())?;
            Some(path.to_string_lossy().into_owned())
        }
    };
    service.cancel(&session_id)?;
    let _ = std::fs::remove_file(source);
    if !matches!(action, CompletionAction::Pin) {
        hide_capture_window(&app)?;
    }
    if matches!(action, CompletionAction::Save | CompletionAction::SaveAs)
        && let Some(path) = result_path.as_deref()
    {
        emit_capture_saved(&app, path);
    }
    Ok(CompletionResult {
        action,
        output_path: result_path,
        status: CompletionStatus::Completed,
        diagnostic: None,
        cleanup_warning: None,
    })
}

#[tauri::command]
fn update_global_shortcuts(
    app: AppHandle,
    configuration: tauri::State<'_, ShortcutConfiguration>,
    shortcuts: ShortcutSettingsDto,
) -> Result<ShortcutSettingsDto, SnaphubError> {
    let next = RegisteredShortcuts::parse(shortcuts)?;
    let mut current = configuration
        .0
        .lock()
        .map_err(|_| SnaphubError::Shortcut("Shortcut settings are unavailable".into()))?;
    let previous = current.clone();
    app.global_shortcut()
        .unregister_all()
        .map_err(|error| SnaphubError::Shortcut(error.to_string()))?;
    if let Err(error) = app.global_shortcut().register_multiple(next.shortcuts()) {
        let _ = app.global_shortcut().unregister_all();
        if let Err(restore_error) = app
            .global_shortcut()
            .register_multiple(previous.shortcuts())
        {
            return Err(SnaphubError::Shortcut(format!(
                "{error}. Previous shortcuts also failed to restore: {restore_error}"
            )));
        }
        return Err(SnaphubError::Shortcut(format!(
            "One or more shortcuts are already in use ({error})"
        )));
    }
    *current = next;
    Ok(current.settings.clone())
}

impl RegisteredShortcuts {
    fn parse(settings: ShortcutSettingsDto) -> Result<Self, SnaphubError> {
        let capture = parse_shortcut(&settings.capture)?;
        let capture_and_copy = parse_shortcut(&settings.capture_and_copy)?;
        let capture_and_save = parse_shortcut(&settings.capture_and_save)?;
        let on_screen_toggle = parse_shortcut(&settings.on_screen_toggle)?;
        let record_toggle = parse_shortcut(&settings.record_toggle)?;
        let shortcuts = [
            capture,
            capture_and_copy,
            capture_and_save,
            on_screen_toggle,
            record_toggle,
        ];
        let has_duplicate = shortcuts
            .iter()
            .enumerate()
            .any(|(index, shortcut)| shortcuts[index + 1..].contains(shortcut));
        if has_duplicate {
            return Err(SnaphubError::Shortcut(
                "Each global workflow needs a different shortcut".into(),
            ));
        }
        Ok(Self {
            settings,
            capture,
            capture_and_copy,
            capture_and_save,
            on_screen_toggle,
            record_toggle,
        })
    }

    fn shortcuts(&self) -> [Shortcut; 5] {
        [
            self.capture,
            self.capture_and_copy,
            self.capture_and_save,
            self.on_screen_toggle,
            self.record_toggle,
        ]
    }

    fn action_for(&self, shortcut: &Shortcut) -> Option<ShortcutAction> {
        if shortcut == &self.capture {
            Some(ShortcutAction::Capture)
        } else if shortcut == &self.capture_and_copy {
            Some(ShortcutAction::Copy)
        } else if shortcut == &self.capture_and_save {
            Some(ShortcutAction::Save)
        } else if shortcut == &self.on_screen_toggle {
            Some(ShortcutAction::OnScreen)
        } else if shortcut == &self.record_toggle {
            Some(ShortcutAction::RecordToggle)
        } else {
            None
        }
    }
}

fn parse_shortcut(value: &str) -> Result<Shortcut, SnaphubError> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return Err(SnaphubError::Shortcut("A shortcut cannot be empty".into()));
    }
    Shortcut::from_str(normalized)
        .map_err(|error| SnaphubError::Shortcut(format!("Invalid shortcut {normalized}: {error}")))
}

fn default_shortcuts() -> ShortcutSettingsDto {
    ShortcutSettingsDto {
        capture: "Alt+Shift+S".into(),
        capture_and_copy: "Alt+Shift+C".into(),
        capture_and_save: "Alt+Shift+D".into(),
        on_screen_toggle: "Alt+Shift+A".into(),
        record_toggle: "Alt+Shift+R".into(),
    }
}

fn run_quick_capture(app: &AppHandle, action: CompletionAction) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let cursor = app
                .cursor_position()
                .map_err(|error| SnaphubError::Window(error.to_string()))?;
            app.state::<CaptureService>().quick_capture(
                Point {
                    x: cursor.x,
                    y: cursor.y,
                },
                action,
            )
        })();
        match result {
            Ok(Some(path)) if matches!(action, CompletionAction::Save) => {
                emit_capture_saved(&app, &path.to_string_lossy());
            }
            Ok(_) => {}
            Err(error) => eprintln!("SH-QUICK-CAPTURE-001: {error}"),
        }
    });
}

fn emit_capture_saved(app: &AppHandle, path: &str) {
    let _ = app.emit("snaphub://capture-saved", path);
}

fn ensure_capture_window(window: &WebviewWindow) -> Result<(), SnaphubError> {
    if window.label() == "capture" {
        Ok(())
    } else {
        Err(SnaphubError::Session(
            "Only the active capture window can complete this session".into(),
        ))
    }
}

fn apply_post_commit_cleanup(
    result: &mut CompletionResult,
    hide_warning: Option<String>,
    finalize_result: Result<(), SnaphubError>,
) {
    if let Some(warning) = merge_cleanup_warning(result.cleanup_warning.take(), hide_warning) {
        result.cleanup_warning = Some(warning);
    }
    if let Err(error) = finalize_result
        && let Some(warning) =
            merge_cleanup_warning(result.cleanup_warning.take(), Some(error.to_string()))
    {
        result.cleanup_warning = Some(warning);
    }
}

fn merge_cleanup_warning(current: Option<String>, next: Option<String>) -> Option<String> {
    match (current, next) {
        (Some(current), Some(next)) => Some(format!("{current}; {next}")),
        (Some(current), None) => Some(current),
        (None, Some(next)) => Some(next),
        (None, None) => None,
    }
}

fn hide_capture_window_with_recovery(app: &AppHandle) -> Option<String> {
    match hide_capture_window(app) {
        Ok(()) => None,
        Err(primary) => {
            let recovered = if let Some(window) = app.get_webview_window("capture") {
                window
                    .hide()
                    .map_err(|error| SnaphubError::Window(error.to_string()))
            } else {
                Err(SnaphubError::Window("Capture window is unavailable".into()))
            };
            match recovered {
                Ok(()) => Some(primary.to_string()),
                Err(force) => Some(format!("{primary}; forced hide failed: {force}")),
            }
        }
    }
}

fn hide_capture_window(app: &AppHandle) -> Result<(), SnaphubError> {
    if let Some(window) = app.get_webview_window("capture") {
        window
            .hide()
            .map_err(|error| SnaphubError::Window(error.to_string()))?;
        // Second safeguard for any other direct-Win32 show path (see
        // `reveal_window_smoothly`): hide through Win32 as well so the overlay
        // cannot stay visible when tao's `VISIBLE` flag is out of sync.
        #[cfg(target_os = "windows")]
        {
            if let Ok(hwnd) = window.hwnd() {
                let hwnd = windows::Win32::Foundation::HWND(hwnd.0);
                let _ = unsafe { ShowWindow(hwnd, SW_HIDE) };
            }
        }
    }
    Ok(())
}

fn restore_capture_window(app: &AppHandle) -> Result<(), SnaphubError> {
    if let Some(window) = app.get_webview_window("capture") {
        reveal_window_smoothly(&window)?;
        window
            .set_focus()
            .map_err(|error| SnaphubError::Window(error.to_string()))?;
    }
    Ok(())
}

fn toggle_on_screen_mode(app: &AppHandle) {
    let should_prepare = {
        let registry = app.state::<OnScreenModeRegistry>();
        let Ok(mut state) = registry.0.lock() else {
            eprintln!("SH-ONSCREEN-STATE-001: on-screen mode state is unavailable");
            return;
        };
        if matches!(&*state, OnScreenModeState::Idle) {
            *state = OnScreenModeState::Preparing;
            true
        } else {
            false
        }
    };

    if !should_prepare {
        if let Err(error) = close_on_screen_mode(app) {
            eprintln!("SH-ONSCREEN-CLOSE-001: {error}");
        }
        return;
    }

    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = prepare_on_screen_mode(&app) {
            eprintln!("SH-ONSCREEN-OPEN-001: {error}");
            let _ = close_on_screen_mode(&app);
        }
    });
}

fn prepare_on_screen_mode(app: &AppHandle) -> Result<(), SnaphubError> {
    let cursor = app
        .cursor_position()
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    let display = display_at_point(app, cursor.x, cursor.y)?;

    let should_continue = {
        let registry = app.state::<OnScreenModeRegistry>();
        let mut state = registry
            .0
            .lock()
            .map_err(|_| SnaphubError::Window("On-screen mode state is unavailable".into()))?;
        if matches!(&*state, OnScreenModeState::Preparing) {
            *state = OnScreenModeState::Active(Box::new(OnScreenActiveState {
                display: display.clone(),
                snapshot: None,
            }));
            true
        } else {
            false
        }
    };
    if !should_continue {
        return Ok(());
    }

    let window = match WebviewWindowBuilder::new(
        app,
        "onscreen",
        WebviewUrl::App(PathBuf::from("index.html")),
    )
    .title("CapKit On-Screen Toolbar")
    .closable(true)
    .decorations(false)
    // An undecorated shadow insets the client area, misaligning a monitor-sized surface.
    .shadow(false)
    .always_on_top(true)
    .transparent(true)
    .resizable(false)
    .skip_taskbar(true)
    .visible(false)
    .build()
    {
        Ok(window) => window,
        Err(error) => {
            if let Ok(mut state) = app.state::<OnScreenModeRegistry>().0.lock() {
                *state = OnScreenModeState::Idle;
            }
            return Err(SnaphubError::Window(error.to_string()));
        }
    };

    let scale = display.scale_factor;
    let overlay_size = overlay_window_size_for_display(app, &display);
    let positioning = window
        .set_position(PhysicalPosition::new(
            (display.bounds.x * scale).round() as i32,
            (display.bounds.y * scale).round() as i32,
        ))
        .and_then(|_| window.set_size(PhysicalSize::new(overlay_size.0, overlay_size.1)));
    if let Err(error) = positioning {
        let _ = window.destroy();
        let _ = close_on_screen_mode(app);
        return Err(SnaphubError::Window(error.to_string()));
    }
    Ok(())
}

fn display_at_point(app: &AppHandle, x: f64, y: f64) -> Result<DisplayDto, SnaphubError> {
    let monitor = app
        .monitor_from_point(x, y)
        .map_err(|error| SnaphubError::Window(error.to_string()))?
        .ok_or_else(|| SnaphubError::Window("No display was found for on-screen mode".into()))?;
    let position = monitor.position();
    let size = monitor.size();
    let scale_factor = monitor.scale_factor();
    let is_primary = app
        .primary_monitor()
        .map_err(|error| SnaphubError::Window(error.to_string()))?
        .is_some_and(|primary| primary.position() == position && primary.size() == size);
    Ok(DisplayDto {
        id: format!("monitor-{}-{}", position.x, position.y),
        name: monitor.name().cloned().unwrap_or_else(|| "Display".into()),
        bounds: Rect {
            x: f64::from(position.x) / scale_factor,
            y: f64::from(position.y) / scale_factor,
            width: f64::from(size.width) / scale_factor,
            height: f64::from(size.height) / scale_factor,
        },
        scale_factor,
        is_primary,
    })
}

fn prepare_on_screen_snapshot(
    app: &AppHandle,
    reveal_after: bool,
) -> Result<CaptureSessionDto, SnaphubError> {
    let display = {
        let registry = app.state::<OnScreenModeRegistry>();
        let state = registry
            .0
            .lock()
            .map_err(|_| SnaphubError::Window("On-screen mode state is unavailable".into()))?;
        match &*state {
            OnScreenModeState::Active(active) => {
                if let Some(session) = active.snapshot.as_ref() {
                    return Ok(session.clone());
                }
                active.display.clone()
            }
            OnScreenModeState::Idle | OnScreenModeState::Preparing => {
                return Err(SnaphubError::Window("On-screen mode is not active".into()));
            }
        }
    };

    let window = app
        .get_webview_window("onscreen")
        .ok_or_else(|| SnaphubError::Window("On-screen toolbar window is unavailable".into()))?;
    window
        .hide()
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    std::thread::sleep(Duration::from_millis(24));

    let capture_point = display_center_point(&display);
    let service = app.state::<CaptureService>();
    let capture_result = service.begin(capture_point);

    let session = match capture_result {
        Ok(session) => session,
        Err(error) => {
            if reveal_after {
                let _ = window.show();
                let _ = window.set_focus();
            }
            return Err(error);
        }
    };

    let retained = {
        let registry = app.state::<OnScreenModeRegistry>();
        let mut state = registry
            .0
            .lock()
            .map_err(|_| SnaphubError::Window("On-screen mode state is unavailable".into()))?;
        match &mut *state {
            OnScreenModeState::Active(active) => {
                active.snapshot = Some(session.clone());
                true
            }
            OnScreenModeState::Idle | OnScreenModeState::Preparing => false,
        }
    };
    if !retained {
        service.cancel(&session.id)?;
        return Err(SnaphubError::Window(
            "On-screen mode closed while preparing visual tools".into(),
        ));
    }

    if reveal_after {
        window
            .show()
            .map_err(|error| SnaphubError::Window(error.to_string()))?;
        let _ = window.set_focus();
    }
    Ok(session)
}

fn display_center_point(display: &DisplayDto) -> Point {
    let scale = display.scale_factor;
    Point {
        x: (display.bounds.x + display.bounds.width / 2.0) * scale,
        y: (display.bounds.y + display.bounds.height / 2.0) * scale,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PhysicalRect {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn physical_display_rect(display: &DisplayDto) -> PhysicalRect {
    let scale = display.scale_factor;
    PhysicalRect {
        x: (display.bounds.x * scale).round() as i32,
        y: (display.bounds.y * scale).round() as i32,
        width: (display.bounds.width * scale).round() as u32,
        height: (display.bounds.height * scale).round() as u32,
    }
}

fn overlay_window_size_for_display(app: &AppHandle, display: &DisplayDto) -> (u32, u32) {
    let monitor = physical_display_rect(display);
    let exact_size = (monitor.width, monitor.height);
    let Ok(monitors) = app.available_monitors() else {
        return exact_size;
    };
    let monitor_rectangles = monitors
        .iter()
        .map(|available| PhysicalRect {
            x: available.position().x,
            y: available.position().y,
            width: available.size().width,
            height: available.size().height,
        })
        .collect::<Vec<_>>();
    let Some(target_index) = monitor_rectangles
        .iter()
        .position(|available| *available == monitor)
    else {
        return exact_size;
    };
    let others = monitor_rectangles
        .into_iter()
        .enumerate()
        .filter_map(|(index, available)| (index != target_index).then_some(available))
        .collect::<Vec<_>>();
    overlay_window_size(monitor, &others)
}

fn overlay_window_size(monitor: PhysicalRect, others: &[PhysicalRect]) -> (u32, u32) {
    let monitor_left = i64::from(monitor.x);
    let monitor_top = i64::from(monitor.y);
    let monitor_right = monitor_left + i64::from(monitor.width);
    let monitor_bottom = monitor_top + i64::from(monitor.height);
    let touches_bottom = others.iter().any(|other| {
        let other_left = i64::from(other.x);
        let other_right = other_left + i64::from(other.width);
        let overlaps_horizontally = monitor_left.max(other_left) < monitor_right.min(other_right);
        i64::from(other.y) == monitor_bottom && overlaps_horizontally
    });
    if !touches_bottom {
        return (monitor.width, monitor.height.saturating_add(1));
    }

    let touches_right = others.iter().any(|other| {
        let other_top = i64::from(other.y);
        let other_bottom = other_top + i64::from(other.height);
        let overlaps_vertically = monitor_top.max(other_top) < monitor_bottom.min(other_bottom);
        i64::from(other.x) == monitor_right && overlaps_vertically
    });
    if !touches_right {
        return (monitor.width.saturating_add(1), monitor.height);
    }

    (monitor.width, monitor.height)
}

fn close_on_screen_mode(app: &AppHandle) -> Result<(), SnaphubError> {
    let session_id = {
        let registry = app.state::<OnScreenModeRegistry>();
        let mut state = registry
            .0
            .lock()
            .map_err(|_| SnaphubError::Window("On-screen mode state is unavailable".into()))?;
        match std::mem::replace(&mut *state, OnScreenModeState::Idle) {
            OnScreenModeState::Active(active) => active.snapshot.map(|session| session.id),
            OnScreenModeState::Idle | OnScreenModeState::Preparing => None,
        }
    };

    let cleanup_result = session_id
        .as_deref()
        .map(|id| app.state::<CaptureService>().cancel(id))
        .unwrap_or(Ok(()));
    let destroy_result = app
        .get_webview_window("onscreen")
        .map(|window| {
            window
                .destroy()
                .map_err(|error| SnaphubError::Window(error.to_string()))
        })
        .unwrap_or(Ok(()));
    destroy_result.and(cleanup_result)
}

fn validated_scrolling_output(path: &str) -> Result<PathBuf, SnaphubError> {
    let candidate = PathBuf::from(path)
        .canonicalize()
        .map_err(SnaphubError::export)?;
    let allowed = std::env::temp_dir()
        .join("CapKit")
        .join("scroll")
        .canonicalize()
        .map_err(SnaphubError::export)?;
    if !candidate.starts_with(allowed) {
        return Err(SnaphubError::Export(
            "Scrolling output is outside the CapKit session directory".into(),
        ));
    }
    Ok(candidate)
}

// Must only be called off the main thread and outside event handlers.
fn create_pin_window(app: &AppHandle, path: &str) -> Result<(), SnaphubError> {
    let label = format!("pin-{}", uuid::Uuid::new_v4());
    app.state::<PinnedCaptureRegistry>()
        .0
        .lock()
        .map_err(|_| SnaphubError::Window("Pinned capture registry is unavailable".into()))?
        .insert(label.clone(), path.to_owned());
    let build_result = WebviewWindowBuilder::new(
        app,
        label.clone(),
        WebviewUrl::App(PathBuf::from("index.html")),
    )
    .title("CapKit Pin")
    .closable(true)
    .decorations(false)
    .always_on_top(true)
    .transparent(false)
    .resizable(true)
    .inner_size(480.0, 320.0)
    .skip_taskbar(false)
    .build();
    if let Err(error) = build_result {
        if let Ok(mut registry) = app.state::<PinnedCaptureRegistry>().0.lock() {
            registry.remove(&label);
        }
        return Err(SnaphubError::Window(error.to_string()));
    }
    Ok(())
}

fn emit_capture_request(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("capture") {
        let _ = window.emit("snaphub://capture-requested", ());
    }
}

/// Builds a WebView window: never call from a synchronous command or an event handler on Windows (deadlock). Use an async command or spawn_blocking.
fn show_dashboard(app: &AppHandle) -> Result<(), SnaphubError> {
    if let Some(window) = app.get_webview_window("dashboard") {
        window
            .show()
            .map_err(|error| SnaphubError::Window(error.to_string()))?;
        let _ = window.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        "dashboard",
        WebviewUrl::App(PathBuf::from("index.html")),
    )
    .title("CapKit")
    .inner_size(1120.0, 780.0)
    .min_inner_size(900.0, 640.0)
    .center()
    .resizable(true)
    .visible(false)
    .build()
    .map_err(|error| SnaphubError::Window(error.to_string()))?;
    Ok(())
}

/* -------------------------------------------------------------------------- */
/* Recording                                                                   */
/* -------------------------------------------------------------------------- */

/// Builds the recording service for the current platform.
///
/// Recording is Windows-only for now: it is built on Windows Graphics Capture
/// and the Media Foundation sink writer, both of which ship with the OS, which
/// is what keeps the feature close to free in installed size.
#[cfg(target_os = "windows")]
fn recording_service() -> RecordingService {
    let backend = Arc::new(platform::windows_recorder::WindowsRecorderBackend::new());
    RecordingService::new(backend.clone(), backend.clone(), backend)
}

#[cfg(not(target_os = "windows"))]
fn recording_service() -> RecordingService {
    compile_error!("Recording currently requires a Windows backend");
}

#[tauri::command]
fn recording_supported(service: tauri::State<'_, RecordingService>) -> bool {
    service.is_supported()
}

#[tauri::command]
async fn list_recording_sources(app: AppHandle) -> Result<Vec<RecordingSourceDto>, SnaphubError> {
    // Now that this also captures a thumbnail per source, it is real
    // display/window I/O rather than cheap enumeration, so it goes through
    // the same off-main-thread pattern as recording start/stop.
    tauri::async_runtime::spawn_blocking(move || app.state::<RecordingService>().sources())
        .await
        .map_err(|error| SnaphubError::Record(format!("Recording worker failed: {error}")))
        .and_then(|result| result)
}

#[tauri::command]
async fn list_audio_devices(
    service: tauri::State<'_, RecordingService>,
) -> Result<Vec<AudioDeviceDto>, SnaphubError> {
    service.audio_devices()
}

// Recording start/stop/cancel do real device, encoder, and thread setup or
// teardown. A plain sync command runs inline on the main UI thread, and a
// WinRT COM call blocking on that same thread can deadlock it waiting on a
// message pump that can never run while the command is still executing —
// which is exactly what "stuck at 0, whole window frozen" looks like from the
// outside. `spawn_blocking` moves the work off that thread, matching every
// other non-trivial command in this file (see `capture_scrolling_automatic`).

#[tauri::command]
async fn start_recording(app: AppHandle, request: RecordingRequestDto) -> Result<(), SnaphubError> {
    let worker_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        worker_app.state::<RecordingService>().start(&request)
    })
    .await
    .map_err(|error| SnaphubError::Record(format!("Recording worker failed: {error}")))
    .and_then(|result| result)?;
    let _ = app.emit("snaphub://recording-started", ());
    Ok(())
}

#[tauri::command]
async fn stop_recording(app: AppHandle) -> Result<RecordingArtifactsDto, SnaphubError> {
    let worker_app = app.clone();
    let artifacts =
        tauri::async_runtime::spawn_blocking(move || worker_app.state::<RecordingService>().stop())
            .await
            .map_err(|error| SnaphubError::Record(format!("Recording worker failed: {error}")))
            .and_then(|result| result)?;
    // The recording lives outside the statically scoped asset directories, so
    // its session folder is opted in for this run only.
    let _ = app
        .asset_protocol_scope()
        .allow_directory(&artifacts.directory, false);
    let _ = app.emit("snaphub://recording-stopped", artifacts.clone());
    Ok(artifacts)
}

#[tauri::command]
async fn cancel_recording(app: AppHandle) -> Result<(), SnaphubError> {
    tauri::async_runtime::spawn_blocking(move || app.state::<RecordingService>().cancel())
        .await
        .map_err(|error| SnaphubError::Record(format!("Recording worker failed: {error}")))
        .and_then(|result| result)
}

/// Pauses or resumes the recording; paused time is omitted from the output.
#[tauri::command]
fn set_recording_paused(
    service: tauri::State<'_, RecordingService>,
    paused: bool,
) -> Result<bool, SnaphubError> {
    service.set_paused(paused)
}

/// Opens the webcam window, excluded from capture so the preview cannot end up
/// inside the screen recording alongside the camera track itself.
/// Shows a click-through outline around exactly what is about to be, or is
/// being, recorded — the countdown alone gives no sense of the boundary,
/// especially for a window or region smaller than the full screen.
#[tauri::command]
async fn show_recording_border(
    app: AppHandle,
    service: tauri::State<'_, RecordingService>,
    bounds: Rect,
) -> Result<(), SnaphubError> {
    let window = match app.get_webview_window("recording-border") {
        Some(window) => window,
        None => WebviewWindowBuilder::new(
            &app,
            "recording-border",
            WebviewUrl::App("index.html".into()),
        )
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .shadow(false)
        .visible(false)
        .build()
        .map_err(|error| SnaphubError::Window(error.to_string()))?,
    };

    let _ = window.set_position(PhysicalPosition::new(bounds.x as i32, bounds.y as i32));
    let _ = window.set_size(PhysicalSize::new(
        bounds.width.max(1.0) as u32,
        bounds.height.max(1.0) as u32,
    ));
    // Never intercepts a click: the whole point is to sit over the recorded
    // content without changing how the user interacts with it.
    let _ = window.set_ignore_cursor_events(true);
    if let Ok(handle) = window.hwnd() {
        let _ = service.set_capture_exclusion(handle.0 as isize, true);
    }
    let _ = window.unminimize();
    window
        .show()
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    Ok(())
}

#[tauri::command]
fn hide_recording_border(app: AppHandle) -> Result<(), SnaphubError> {
    if let Some(window) = app.get_webview_window("recording-border") {
        let _ = window.destroy();
    }
    Ok(())
}

/// Builds a WebView window: never call from a synchronous command or an event handler on Windows (deadlock). Use an async command or spawn_blocking.
#[tauri::command]
async fn open_camera(app: AppHandle) -> Result<(), SnaphubError> {
    if let Some(window) = app.get_webview_window("camera") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    let monitor = app
        .primary_monitor()
        .ok()
        .flatten()
        .ok_or_else(|| SnaphubError::Window("No display available for the camera".into()))?;
    let bounds = monitor.size();
    let size = 260u32;

    // Builds a WebView window: never call from a synchronous command or an event handler on Windows (deadlock). Use an async command or spawn_blocking.
    let window = WebviewWindowBuilder::new(&app, "camera", WebviewUrl::App("index.html".into()))
        .title("CapKit Camera")
        .inner_size(f64::from(size), f64::from(size))
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .shadow(false)
        .visible(false)
        .build()
        .map_err(|error| SnaphubError::Window(error.to_string()))?;

    let x = 48;
    let y = bounds.height.saturating_sub(size + 220);
    let _ = window.set_position(PhysicalPosition::new(x, y as i32));
    Ok(())
}

#[tauri::command]
fn camera_ready(
    app: AppHandle,
    service: tauri::State<'_, RecordingService>,
) -> Result<(), SnaphubError> {
    let Some(window) = app.get_webview_window("camera") else {
        return Ok(());
    };
    if let Ok(handle) = window.hwnd() {
        let _ = service.set_capture_exclusion(handle.0 as isize, true);
    }
    let _ = window.unminimize();
    window
        .show()
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
fn close_camera(app: AppHandle) -> Result<(), SnaphubError> {
    if let Some(window) = app.get_webview_window("camera") {
        let _ = window.destroy();
    }
    Ok(())
}

#[tauri::command]
async fn recording_status(app: AppHandle) -> Result<Option<RecordingStatsDto>, SnaphubError> {
    // `stats()` stats the output file on disk; kept off the main thread so a
    // once-a-second poll from the dock can never contribute to UI jank.
    tauri::async_runtime::spawn_blocking(move || app.state::<RecordingService>().stats())
        .await
        .map_err(|error| SnaphubError::Record(format!("Recording worker failed: {error}")))
        .and_then(|result| result)
}

/// Hides a window from screen capture so the recorder's own chrome never lands
/// in the video.
#[tauri::command]
fn set_capture_exclusion(
    app: AppHandle,
    service: tauri::State<'_, RecordingService>,
    label: String,
    excluded: bool,
) -> Result<(), SnaphubError> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| SnaphubError::Window(format!("No window named {label}")))?;
    let handle = window
        .hwnd()
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    service.set_capture_exclusion(handle.0 as isize, excluded)
}

/// Reveals the recorder once its first frame is painted, and excludes it from
/// capture in the same step because the affinity does not survive recreation.
#[tauri::command]
fn recorder_ready(
    app: AppHandle,
    service: tauri::State<'_, RecordingService>,
) -> Result<(), SnaphubError> {
    println!("[recorder] recorder_ready invoked");
    let Some(window) = app.get_webview_window("recorder") else {
        println!("[recorder] recorder_ready: no window named \"recorder\" exists");
        return Ok(());
    };
    if let Ok(handle) = window.hwnd() {
        // A failure here must not be silent: the dock would be recorded.
        if service
            .set_capture_exclusion(handle.0 as isize, true)
            .is_err()
        {
            let _ = app.emit("snaphub://recorder-exclusion-failed", ());
        }
    }
    // `.show()` alone maps to `ShowWindow(SW_SHOW)`, which does not clear a
    // minimized state; a window can end up simultaneously WS_VISIBLE and
    // WS_MINIMIZE, parked at the OS's off-screen sentinel position and
    // invisible even though every state check says "visible". `unminimize()`
    // guards against that regardless of how it got minimized in the first place.
    let _ = window.unminimize();
    window
        .show()
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    let _ = window.set_focus();
    println!("[recorder] recorder_ready: window shown");
    #[cfg(debug_assertions)]
    window.open_devtools();
    Ok(())
}

#[tauri::command]
async fn open_recorder(app: AppHandle) -> Result<(), SnaphubError> {
    show_recorder(&app)
}

#[tauri::command]
fn close_recorder(
    app: AppHandle,
    service: tauri::State<'_, RecordingService>,
) -> Result<(), SnaphubError> {
    service.cancel()?;
    if let Some(window) = app.get_webview_window("record-region") {
        let _ = window.destroy();
    }
    if let Some(window) = app.get_webview_window("recorder") {
        let _ = window.destroy();
    }
    Ok(())
}

/// Converts a logical box drawn in the region overlay to physical desktop px.
///
/// Rounds to whole physical px, enforces a 32x32 minimum, and clamps inside
/// `display`. `origin` is the overlay window's physical outer position.
fn logical_box_to_desktop(origin: (i32, i32), scale: f64, area: Rect, display: Rect) -> Rect {
    let width = (area.width * scale).round().max(32.0).min(display.width);
    let height = (area.height * scale).round().max(32.0).min(display.height);
    let x = (f64::from(origin.0) + (area.x * scale).round())
        .max(display.x)
        .min(display.x + display.width - width);
    let y = (f64::from(origin.1) + (area.y * scale).round())
        .max(display.y)
        .min(display.y + display.height - height);
    Rect {
        x,
        y,
        width,
        height,
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordRegionSelection {
    display_id: String,
    bounds: Rect,
}

struct RecordRegionRegistry(Mutex<Option<String>>);

/// Builds a WebView window: never call from a synchronous command or an event handler on Windows (deadlock). Use an async command or spawn_blocking.
#[tauri::command]
async fn open_record_region(app: AppHandle, display_id: String) -> Result<(), SnaphubError> {
    if let Some(window) = app.get_webview_window("record-region") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    // Reuse the service's own enumeration rather than adding a second one.
    let bounds = app
        .state::<RecordingService>()
        .sources()
        .map_err(|_| SnaphubError::Window("Recording sources are unavailable".into()))?
        .into_iter()
        .find(|source| source.kind == "display" && source.display_id == display_id)
        .map(|source| source.bounds)
        .ok_or_else(|| SnaphubError::Window("The chosen display is unavailable".into()))?;
    if let Ok(mut registry) = app.state::<RecordRegionRegistry>().0.lock() {
        *registry = Some(display_id);
    }
    WebviewWindowBuilder::new(&app, "record-region", WebviewUrl::App("index.html".into()))
        .title("CapKit Record Region")
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .shadow(false)
        .visible(false)
        .build()
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    let Some(window) = app.get_webview_window("record-region") else {
        return Err(SnaphubError::Window("Region window is unavailable".into()));
    };
    window
        .set_position(PhysicalPosition::new(
            bounds.x.round() as i32,
            bounds.y.round() as i32,
        ))
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    window
        .set_size(PhysicalSize::new(
            bounds.width.round() as u32,
            bounds.height.round() as u32,
        ))
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    Ok(())
}

#[tauri::command]
fn record_region_ready(app: AppHandle) -> Result<(), SnaphubError> {
    let Some(window) = app.get_webview_window("record-region") else {
        return Ok(());
    };
    let _ = window.unminimize();
    window
        .show()
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
fn confirm_record_region(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), SnaphubError> {
    let Some(window) = app.get_webview_window("record-region") else {
        return Err(SnaphubError::Window("Region window is unavailable".into()));
    };
    let display_id = app
        .state::<RecordRegionRegistry>()
        .0
        .lock()
        .map_err(|_| SnaphubError::Window("Region state is unavailable".into()))?
        .clone()
        .ok_or_else(|| SnaphubError::Window("No display was chosen for the region".into()))?;
    let bounds = app
        .state::<RecordingService>()
        .sources()
        .map_err(|_| SnaphubError::Window("Recording sources are unavailable".into()))?
        .into_iter()
        .find(|source| source.kind == "display" && source.display_id == display_id)
        .map(|source| source.bounds)
        .ok_or_else(|| SnaphubError::Window("The chosen display is unavailable".into()))?;
    let position = window
        .outer_position()
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    let scale = window
        .scale_factor()
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    let desktop = logical_box_to_desktop(
        (position.x, position.y),
        scale,
        Rect {
            x,
            y,
            width,
            height,
        },
        bounds,
    );
    let _ = app.emit(
        "snaphub://record-region-selected",
        RecordRegionSelection {
            display_id,
            bounds: desktop,
        },
    );
    let _ = window.destroy();
    Ok(())
}

#[tauri::command]
fn cancel_record_region(app: AppHandle) -> Result<(), SnaphubError> {
    let _ = app.emit("snaphub://record-region-cancelled", ());
    if let Some(window) = app.get_webview_window("record-region") {
        let _ = window.destroy();
    }
    Ok(())
}

/// Opens the recorder, or brings it to front if it is already open.
///
/// Bound to a global shortcut so recording can be reached without navigating
/// through the dashboard. Unlike the on-screen toggle, a
/// second press never closes the window here: doing so while a recording is
/// in progress would silently discard it.
fn toggle_recording(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("recorder") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = show_recorder(&app) {
            eprintln!("SH-RECORD-SHORTCUT-001: {error}");
        }
    });
}

/// Builds a WebView window: never call from a synchronous command or an event handler on Windows (deadlock). Use an async command or spawn_blocking.
///
/// Creates the recorder window hidden and lets the frontend reveal it, matching
/// the on-screen overlay's prepare-then-reveal lifecycle.
fn show_recorder(app: &AppHandle) -> Result<(), SnaphubError> {
    if let Some(window) = app.get_webview_window("recorder") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    // The frontend fits the window to its content before revealing it.
    match WebviewWindowBuilder::new(app, "recorder", WebviewUrl::App("index.html".into()))
        .title("CapKit Recorder")
        .inner_size(724.0, 140.0)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .shadow(false)
        .visible(false)
        .build()
    {
        Ok(_) => Ok(()),
        Err(error) => {
            // A fast double click (or the shortcut racing the button) can
            // reach here after the first call already built the window.
            if let Some(window) = app.get_webview_window("recorder") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
                return Ok(());
            }
            Err(SnaphubError::Window(error.to_string()))
        }
    }
}

/// Computes the recorder window's physical frame from its logical content size.
///
/// All inputs are logical except `work_area`, which is physical. The window is
/// bottom-anchored with `bottom_gap` logical px above the taskbar and centred
/// horizontally. Content larger than the work area is clamped, and the frame
/// never starts above the work area.
fn dock_frame(
    work_area: Rect,
    scale: f64,
    content_width: f64,
    content_height: f64,
    bottom_gap: f64,
) -> Rect {
    let width = (content_width * scale)
        .round()
        .min(work_area.width)
        .max(1.0);
    let height = (content_height * scale)
        .round()
        .min(work_area.height)
        .max(1.0);
    let x = work_area.x + (work_area.width - width) / 2.0;
    let y =
        (work_area.y + work_area.height - height - (bottom_gap * scale).round()).max(work_area.y);
    Rect {
        x,
        y,
        width,
        height,
    }
}

/// Fits the recorder window to its content.
///
/// A sync command is safe here: it builds no window, and `set_size` and
/// `set_position` do not deadlock.
#[tauri::command]
fn fit_recorder(app: AppHandle, width: f64, height: f64) -> Result<(), SnaphubError> {
    if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
        return Err(SnaphubError::Window(
            "Recorder size must be finite and positive".into(),
        ));
    }
    let Some(window) = app.get_webview_window("recorder") else {
        return Err(SnaphubError::Window(
            "Recorder window is unavailable".into(),
        ));
    };
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or_else(|| SnaphubError::Window("No display available for the recorder".into()))?;
    let area = monitor.work_area();
    let work_area = Rect {
        x: f64::from(area.position.x),
        y: f64::from(area.position.y),
        width: f64::from(area.size.width),
        height: f64::from(area.size.height),
    };
    let frame = dock_frame(work_area, monitor.scale_factor(), width, height, 24.0);
    window
        .set_position(PhysicalPosition::new(
            frame.x.round() as i32,
            frame.y.round() as i32,
        ))
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    window
        .set_size(PhysicalSize::new(
            frame.width.round() as u32,
            frame.height.round() as u32,
        ))
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend = Arc::new(XcapPlatformBackend::default());
    let shortcuts = RegisteredShortcuts::parse(default_shortcuts())
        .expect("CapKit default shortcuts must be valid");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, received, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let action = app
                        .state::<ShortcutConfiguration>()
                        .0
                        .lock()
                        .ok()
                        .and_then(|configuration| configuration.action_for(received));
                    match action {
                        Some(ShortcutAction::Capture) => emit_capture_request(app),
                        Some(ShortcutAction::Copy) => {
                            run_quick_capture(app, CompletionAction::Copy);
                        }
                        Some(ShortcutAction::Save) => {
                            run_quick_capture(app, CompletionAction::Save);
                        }
                        Some(ShortcutAction::OnScreen) => toggle_on_screen_mode(app),
                        Some(ShortcutAction::RecordToggle) => toggle_recording(app),

                        None => {}
                    }
                })
                .build(),
        )
        .manage(CaptureService::new(backend))
        .manage(recording_service())
        .manage(ShortcutConfiguration(Mutex::new(shortcuts)))
        .manage(PinnedCaptureRegistry(Mutex::new(HashMap::new())))
        .manage(RecordRegionRegistry(Mutex::new(None)))
        .manage(OnScreenModeRegistry(Mutex::new(OnScreenModeState::Idle)))
        .invoke_handler(tauri::generate_handler![
            begin_capture,
            show_capture_surface,
            dashboard_ready,
            on_screen_session,
            on_screen_snapshot,
            on_screen_ready,
            dismiss_on_screen,
            save_on_screen_capture,
            complete_capture,
            retry_capture_save,
            cancel_capture,
            dismiss_capture,
            pinned_capture_path,
            copy_pinned_capture,
            save_pinned_capture,
            detect_targets,
            list_targets,
            get_save_directory,
            set_save_directory,
            reset_save_directory,
            list_saved_captures,
            open_save_directory,
            open_saved_capture,
            delete_saved_capture,
            import_media_files,
            list_folder_images,
            scrolling_capture_supported,
            stitch_scrolling_frames,
            capture_scrolling_automatic,
            begin_manual_scrolling_capture,
            add_manual_scrolling_frame,
            cancel_manual_scrolling_capture,
            discard_scrolling_output,
            complete_scrolling_capture,
            update_global_shortcuts,
            recording_supported,
            list_recording_sources,
            list_audio_devices,
            start_recording,
            stop_recording,
            cancel_recording,
            recording_status,
            set_capture_exclusion,
            recorder_ready,
            fit_recorder,
            open_recorder,
            close_recorder,
            open_record_region,
            record_region_ready,
            confirm_record_region,
            cancel_record_region,
            set_recording_paused,
            show_recording_border,
            hide_recording_border,
            open_camera,
            camera_ready,
            close_camera
        ])
        .setup(move |app| {
            if std::env::args().any(|argument| argument == "--background")
                && let Some(window) = app.get_webview_window("dashboard")
            {
                window.hide()?;
            }

            // Recordings and their source-picker thumbnails are written under
            // %TEMP%\CapKit at runtime, after the static asset scope in
            // tauri.conf.json was already resolved at startup. One recursive
            // grant here covers every file the recorder ever writes, so
            // individual commands don't each need their own widen call.
            let _ = app
                .asset_protocol_scope()
                .allow_directory(std::env::temp_dir().join("CapKit"), true);

            let configured = app
                .state::<ShortcutConfiguration>()
                .0
                .lock()
                .map_err(|_| "Shortcut settings are unavailable")?
                .shortcuts();
            if let Err(error) = app.global_shortcut().register_multiple(configured) {
                eprintln!("SH-SHORTCUT-001: default shortcuts could not be registered: {error}");
            }

            let dashboard_item =
                MenuItem::with_id(app, "dashboard", "Open CapKit", true, None::<&str>)?;
            let capture_item =
                MenuItem::with_id(app, "capture", "Capture  Alt+Shift+S", true, None::<&str>)?;
            let on_screen_item = MenuItem::with_id(
                app,
                "on-screen",
                "On-screen toolbar  Alt+Shift+A",
                true,
                None::<&str>,
            )?;
            let restore_pins_item = MenuItem::with_id(
                app,
                "restore-pins",
                "Restore pinned controls",
                true,
                None::<&str>,
            )?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit CapKit", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &dashboard_item,
                    &capture_item,
                    &on_screen_item,
                    &restore_pins_item,
                    &quit_item,
                ],
            )?;

            let mut tray = TrayIconBuilder::new()
                .tooltip("CapKit - Capture, record, and showcase")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "dashboard" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn_blocking(move || {
                            if let Err(error) = show_dashboard(&app) {
                                eprintln!("SH-DASHBOARD-001: {error}");
                            }
                        });
                    }
                    "capture" => emit_capture_request(app),
                    "on-screen" => toggle_on_screen_mode(app),
                    "restore-pins" => {
                        for (label, window) in app.webview_windows() {
                            if label.starts_with("pin-") {
                                let _ = window.set_ignore_cursor_events(false);
                            }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle().clone();
                        tauri::async_runtime::spawn_blocking(move || {
                            if let Err(error) = show_dashboard(&app) {
                                eprintln!("SH-DASHBOARD-002: {error}");
                            }
                        });
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "capture"
                && let tauri::WindowEvent::CloseRequested { api, .. } = event
            {
                api.prevent_close();
                let _ = window.hide();
            }
            if window.label() == "onscreen"
                && let tauri::WindowEvent::CloseRequested { api, .. } = event
            {
                api.prevent_close();
                if let Err(error) = close_on_screen_mode(window.app_handle()) {
                    eprintln!("SH-ONSCREEN-CLOSE-002: {error}");
                }
            }
            if window.label().starts_with("pin-")
                && let tauri::WindowEvent::CloseRequested { api, .. } = event
            {
                // `close()` emits another CloseRequested event. Intercept every native/JS close
                // source once, clean its registry entry, then use `destroy()` for a non-recursive
                // force close. This also covers the Windows taskbar thumbnail Close command.
                api.prevent_close();
                let registry = window.app_handle().state::<PinnedCaptureRegistry>();
                let path = take_pinned_path(&registry, window.label());
                if let Some(path) = path {
                    let _ = std::fs::remove_file(path);
                }
                if let Err(error) = window.destroy() {
                    eprintln!("SH-PIN-CLOSE-001: {error}");
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("CapKit failed to initialize");

    app.run(|_app, event| {
        if let tauri::RunEvent::ExitRequested { api, code, .. } = event
            && code.is_none()
        {
            api.prevent_exit();
        }
    });
}

#[cfg(test)]
mod shortcut_tests {
    use super::*;

    #[test]
    fn taking_a_pinned_path_removes_its_lifecycle_entry() {
        let registry = PinnedCaptureRegistry(Mutex::new(HashMap::from([(
            "pin-test".into(),
            "C:/Temp/Snaphub/pins/test.png".into(),
        )])));
        assert_eq!(
            take_pinned_path(&registry, "pin-test"),
            Some("C:/Temp/Snaphub/pins/test.png".into())
        );
        assert_eq!(take_pinned_path(&registry, "pin-test"), None);
    }

    #[test]
    fn parses_distinct_default_shortcuts() {
        let parsed = RegisteredShortcuts::parse(default_shortcuts());
        assert!(parsed.is_ok());
    }

    #[test]
    fn rejects_duplicate_shortcuts() {
        let result = RegisteredShortcuts::parse(ShortcutSettingsDto {
            capture: "Alt+Shift+S".into(),
            capture_and_copy: "Alt+Shift+S".into(),
            capture_and_save: "Alt+Shift+D".into(),
            on_screen_toggle: "Alt+Shift+A".into(),
            record_toggle: "Alt+Shift+R".into(),
        });
        assert!(result.is_err());
    }

    #[test]
    fn maps_the_record_toggle_shortcut() {
        let parsed = RegisteredShortcuts::parse(default_shortcuts()).unwrap();
        assert!(matches!(
            parsed.action_for(&parsed.record_toggle),
            Some(ShortcutAction::RecordToggle)
        ));
    }

    #[test]
    fn maps_the_on_screen_toggle_shortcut() {
        let parsed = RegisteredShortcuts::parse(default_shortcuts()).unwrap();
        assert!(matches!(
            parsed.action_for(&parsed.on_screen_toggle),
            Some(ShortcutAction::OnScreen)
        ));
    }

    #[test]
    fn display_center_point_uses_physical_pixels() {
        let display = DisplayDto {
            id: "display-1".into(),
            name: "Secondary display".into(),
            bounds: Rect {
                x: 1920.0,
                y: 0.0,
                width: 1280.0,
                height: 720.0,
            },
            scale_factor: 1.5,
            is_primary: false,
        };

        assert_eq!(
            display_center_point(&display),
            Point {
                x: 3840.0,
                y: 540.0
            }
        );
    }

    #[test]
    fn overlay_size_extends_the_bottom_of_an_isolated_monitor() {
        let monitor = PhysicalRect {
            x: 0,
            y: 0,
            width: 100,
            height: 80,
        };

        assert_eq!(overlay_window_size(monitor, &[]), (100, 81));
    }

    #[test]
    fn overlay_size_extends_right_when_a_monitor_is_directly_below() {
        let monitor = PhysicalRect {
            x: 0,
            y: 0,
            width: 100,
            height: 80,
        };
        let below = PhysicalRect {
            x: 0,
            y: 80,
            width: 100,
            height: 80,
        };

        assert_eq!(overlay_window_size(monitor, &[below]), (101, 80));
    }

    #[test]
    fn overlay_size_stays_exact_when_monitors_are_below_and_right() {
        let monitor = PhysicalRect {
            x: 0,
            y: 0,
            width: 100,
            height: 80,
        };
        let below = PhysicalRect {
            x: 0,
            y: 80,
            width: 100,
            height: 80,
        };
        let right = PhysicalRect {
            x: 100,
            y: 0,
            width: 100,
            height: 80,
        };

        assert_eq!(overlay_window_size(monitor, &[below, right]), (100, 80));
    }

    #[test]
    fn overlay_size_ignores_a_diagonal_monitor_below() {
        let monitor = PhysicalRect {
            x: 0,
            y: 0,
            width: 100,
            height: 80,
        };
        let diagonal = PhysicalRect {
            x: 100,
            y: 80,
            width: 100,
            height: 80,
        };

        assert_eq!(overlay_window_size(monitor, &[diagonal]), (100, 81));
    }

    #[test]
    fn overlay_size_extends_down_when_only_a_monitor_to_the_left_touches() {
        let monitor = PhysicalRect {
            x: 0,
            y: 0,
            width: 100,
            height: 80,
        };
        let left = PhysicalRect {
            x: -100,
            y: 0,
            width: 100,
            height: 80,
        };

        assert_eq!(overlay_window_size(monitor, &[left]), (100, 81));
    }

    #[test]
    fn post_commit_cleanup_never_reclassifies_a_committed_save() {
        let mut result = CompletionResult {
            action: CompletionAction::CopyAndSave,
            output_path: Some("C:/Captures/CapKit.png".into()),
            status: CompletionStatus::Completed,
            diagnostic: None,
            cleanup_warning: None,
        };

        apply_post_commit_cleanup(
            &mut result,
            Some("SH-WINDOW-001: animated hide failed".into()),
            Err(SnaphubError::Session(
                "SH-SESSION-001: cleanup failed".into(),
            )),
        );

        assert!(matches!(result.status, CompletionStatus::Completed));
        assert_eq!(
            result.output_path.as_deref(),
            Some("C:/Captures/CapKit.png")
        );
        assert!(
            result
                .cleanup_warning
                .is_some_and(|warning| warning.contains("SH-WINDOW-001"))
        );
    }
}

#[cfg(test)]
mod recorder_layout_tests {
    use super::*;

    fn work_area(x: f64, y: f64, width: f64, height: f64) -> Rect {
        Rect {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn dock_frame_centres_above_the_taskbar_at_scale_one() {
        let frame = dock_frame(work_area(0.0, 0.0, 1920.0, 1040.0), 1.0, 724.0, 140.0, 24.0);
        assert_eq!(
            frame,
            Rect {
                x: 598.0,
                y: 876.0,
                width: 724.0,
                height: 140.0,
            }
        );
    }

    #[test]
    fn dock_frame_scales_content_at_fractional_scales() {
        let frame = dock_frame(work_area(0.0, 0.0, 2880.0, 1560.0), 1.5, 724.0, 140.0, 24.0);
        assert_eq!(
            frame,
            Rect {
                x: 897.0,
                y: 1314.0,
                width: 1086.0,
                height: 210.0,
            }
        );
        let frame = dock_frame(work_area(0.0, 0.0, 3840.0, 2080.0), 2.0, 724.0, 140.0, 24.0);
        assert_eq!(frame.width, 1448.0);
        assert_eq!(frame.height, 280.0);
    }

    #[test]
    fn dock_frame_handles_a_work_area_away_from_the_origin() {
        // A taskbar on the left pushes the work area right.
        let frame = dock_frame(
            work_area(80.0, 0.0, 1840.0, 1040.0),
            1.0,
            724.0,
            140.0,
            24.0,
        );
        assert_eq!(frame.x, 80.0 + (1840.0 - 724.0) / 2.0);
        assert_eq!(frame.y, 876.0);
    }

    #[test]
    fn dock_frame_clamps_content_taller_than_the_work_area() {
        let frame = dock_frame(work_area(0.0, 0.0, 1920.0, 400.0), 1.0, 724.0, 900.0, 24.0);
        assert_eq!(frame.height, 400.0);
        assert_eq!(frame.y, 0.0);
    }

    #[test]
    fn logical_box_scales_to_physical_px() {
        let area = logical_box_to_desktop(
            (0, 0),
            1.0,
            Rect {
                x: 10.0,
                y: 20.0,
                width: 100.0,
                height: 80.0,
            },
            work_area(0.0, 0.0, 1920.0, 1080.0),
        );
        assert_eq!(
            area,
            Rect {
                x: 10.0,
                y: 20.0,
                width: 100.0,
                height: 80.0,
            }
        );
        // A 1280x720 logical box on a 150% display is a 1920x1080 recording.
        let area = logical_box_to_desktop(
            (0, 0),
            1.5,
            Rect {
                x: 0.0,
                y: 0.0,
                width: 1280.0,
                height: 720.0,
            },
            work_area(0.0, 0.0, 1920.0, 1080.0),
        );
        assert_eq!(area.width, 1920.0);
        assert_eq!(area.height, 1080.0);
    }

    #[test]
    fn logical_box_supports_a_negative_origin() {
        let area = logical_box_to_desktop(
            (-1920, 0),
            1.0,
            Rect {
                x: 100.0,
                y: 100.0,
                width: 200.0,
                height: 150.0,
            },
            work_area(-1920.0, 0.0, 1920.0, 1080.0),
        );
        assert_eq!(area.x, -1820.0);
        assert_eq!(area.y, 100.0);
    }

    #[test]
    fn logical_box_clamps_at_the_display_edges() {
        let area = logical_box_to_desktop(
            (0, 0),
            1.0,
            Rect {
                x: 1850.0,
                y: 1000.0,
                width: 200.0,
                height: 200.0,
            },
            work_area(0.0, 0.0, 1920.0, 1080.0),
        );
        assert_eq!(area.x, 1720.0);
        assert_eq!(area.y, 880.0);
        assert_eq!(area.width, 200.0);
        assert_eq!(area.height, 200.0);
    }

    #[test]
    fn logical_box_enforces_the_minimum_size() {
        let area = logical_box_to_desktop(
            (0, 0),
            1.0,
            Rect {
                x: 50.0,
                y: 50.0,
                width: 5.0,
                height: 4.0,
            },
            work_area(0.0, 0.0, 1920.0, 1080.0),
        );
        assert_eq!(area.width, 32.0);
        assert_eq!(area.height, 32.0);
    }
}

#[cfg(test)]
mod window_config_tests {
    #[test]
    fn capture_window_disables_the_undecorated_shadow() {
        let config = serde_json::from_str::<serde_json::Value>(include_str!("../tauri.conf.json"))
            .expect("Tauri config should be valid JSON");
        let windows = config["app"]["windows"]
            .as_array()
            .expect("Tauri config should contain app windows");
        let capture = windows
            .iter()
            .find(|window| window["label"].as_str() == Some("capture"))
            .expect("Tauri config should contain a capture window");

        assert_eq!(capture["shadow"].as_bool(), Some(false));
        assert_eq!(capture["decorations"].as_bool(), Some(false));
    }
}
