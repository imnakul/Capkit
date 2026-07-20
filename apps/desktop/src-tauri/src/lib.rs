mod domain;
mod error;
mod platform;
mod services;

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    str::FromStr,
    sync::{Arc, Mutex},
};

use domain::{
    CaptureSessionDto, CompletionAction, CompletionRequest, CompletionResult, DetectedTargetDto,
    Point, SavedCaptureDto, ScrollingCaptureRequest, ScrollingCaptureResult,
};
use error::SnaphubError;
use platform::xcap_backend::XcapPlatformBackend;
use services::capture::CaptureService;
use services::scrolling::stitch_vertical;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutSettingsDto {
    capture: String,
    capture_and_copy: String,
    capture_and_save: String,
}

#[derive(Clone)]
struct RegisteredShortcuts {
    settings: ShortcutSettingsDto,
    capture: Shortcut,
    capture_and_copy: Shortcut,
    capture_and_save: Shortcut,
}

#[derive(Clone, Copy)]
enum ShortcutAction {
    Capture,
    Copy,
    Save,
}

struct ShortcutConfiguration(Mutex<RegisteredShortcuts>);
struct PinnedCaptureRegistry(Mutex<HashMap<String, String>>);

#[tauri::command]
fn begin_capture(
    app: AppHandle,
    service: tauri::State<'_, CaptureService>,
) -> Result<CaptureSessionDto, SnaphubError> {
    let cursor = app
        .cursor_position()
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    let session = service.begin(Point {
        x: cursor.x,
        y: cursor.y,
    })?;
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
    window
        .set_size(PhysicalSize::new(
            (session.display.bounds.width * scale).round() as u32,
            (session.display.bounds.height * scale).round() as u32,
        ))
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    Ok(session)
}

#[tauri::command]
fn show_capture_surface(app: AppHandle) -> Result<(), SnaphubError> {
    let window = app
        .get_webview_window("capture")
        .ok_or_else(|| SnaphubError::Window("Capture window is unavailable".into()))?;
    window
        .show()
        .map_err(|error| SnaphubError::Window(error.to_string()))?;
    // Some Windows focus policies reject programmatic focus. The capture must remain usable
    // instead of falling back to an opaque error window when that happens.
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
async fn complete_capture(
    app: AppHandle,
    service: tauri::State<'_, CaptureService>,
    request: CompletionRequest,
) -> Result<CompletionResult, SnaphubError> {
    let result = service.complete(&request)?;
    // The modal capture surface must always disappear before a pin window is attempted. A pin
    // construction error must never strand an input-blocking fullscreen overlay.
    hide_capture_window(&app)?;
    if matches!(request.action, domain::CompletionAction::Pin)
        && let Some(path) = result.output_path.as_deref()
    {
        create_pin_window(&app, path)?;
    }
    if matches!(
        request.action,
        domain::CompletionAction::Save | domain::CompletionAction::SaveAs
    ) && let Some(path) = result.output_path.as_deref()
    {
        emit_capture_saved(&app, path);
    }
    Ok(result)
}

#[tauri::command]
fn cancel_capture(
    app: AppHandle,
    service: tauri::State<'_, CaptureService>,
    session_id: String,
) -> Result<(), SnaphubError> {
    let cleanup_result = service.cancel(&session_id);
    let hide_result = hide_capture_window(&app);
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

#[tauri::command]
async fn set_pinned_click_through(
    app: AppHandle,
    label: String,
    enabled: bool,
) -> Result<(), SnaphubError> {
    if !label.starts_with("pin-") {
        return Err(SnaphubError::Window("Invalid pinned window".into()));
    }
    app.get_webview_window(&label)
        .ok_or_else(|| SnaphubError::Window("Pinned window is unavailable".into()))?
        .set_ignore_cursor_events(enabled)
        .map_err(|error| SnaphubError::Window(error.to_string()))
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
        // application once, then Snaphub samples the same region and restores its preview.
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
        CompletionAction::Pin => {
            let image = image::open(&source)
                .map_err(SnaphubError::export)?
                .into_rgba8();
            let pin_directory = std::env::temp_dir().join("Snaphub").join("pins");
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
        if capture == capture_and_copy
            || capture == capture_and_save
            || capture_and_copy == capture_and_save
        {
            return Err(SnaphubError::Shortcut(
                "Each capture workflow needs a different shortcut".into(),
            ));
        }
        Ok(Self {
            settings,
            capture,
            capture_and_copy,
            capture_and_save,
        })
    }

    fn shortcuts(&self) -> [Shortcut; 3] {
        [self.capture, self.capture_and_copy, self.capture_and_save]
    }

    fn action_for(&self, shortcut: &Shortcut) -> Option<ShortcutAction> {
        if shortcut == &self.capture {
            Some(ShortcutAction::Capture)
        } else if shortcut == &self.capture_and_copy {
            Some(ShortcutAction::Copy)
        } else if shortcut == &self.capture_and_save {
            Some(ShortcutAction::Save)
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

fn hide_capture_window(app: &AppHandle) -> Result<(), SnaphubError> {
    if let Some(window) = app.get_webview_window("capture") {
        window
            .hide()
            .map_err(|error| SnaphubError::Window(error.to_string()))?;
    }
    Ok(())
}

fn restore_capture_window(app: &AppHandle) -> Result<(), SnaphubError> {
    if let Some(window) = app.get_webview_window("capture") {
        window
            .show()
            .map_err(|error| SnaphubError::Window(error.to_string()))?;
        window
            .set_focus()
            .map_err(|error| SnaphubError::Window(error.to_string()))?;
    }
    Ok(())
}

fn validated_scrolling_output(path: &str) -> Result<PathBuf, SnaphubError> {
    let candidate = PathBuf::from(path)
        .canonicalize()
        .map_err(SnaphubError::export)?;
    let allowed = std::env::temp_dir()
        .join("Snaphub")
        .join("scroll")
        .canonicalize()
        .map_err(SnaphubError::export)?;
    if !candidate.starts_with(allowed) {
        return Err(SnaphubError::Export(
            "Scrolling output is outside the Snaphub session directory".into(),
        ));
    }
    Ok(candidate)
}

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
    .title("Snaphub Pin")
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
    .title("Snaphub")
    .inner_size(1120.0, 780.0)
    .min_inner_size(900.0, 640.0)
    .center()
    .resizable(true)
    .visible(false)
    .build()
    .map_err(|error| SnaphubError::Window(error.to_string()))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend = Arc::new(XcapPlatformBackend::default());
    let shortcuts = RegisteredShortcuts::parse(default_shortcuts())
        .expect("Snaphub default shortcuts must be valid");

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
                        None => {}
                    }
                })
                .build(),
        )
        .manage(CaptureService::new(backend))
        .manage(ShortcutConfiguration(Mutex::new(shortcuts)))
        .manage(PinnedCaptureRegistry(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            begin_capture,
            show_capture_surface,
            dashboard_ready,
            complete_capture,
            cancel_capture,
            dismiss_capture,
            pinned_capture_path,
            copy_pinned_capture,
            save_pinned_capture,
            set_pinned_click_through,
            detect_targets,
            list_targets,
            get_save_directory,
            set_save_directory,
            reset_save_directory,
            list_saved_captures,
            open_save_directory,
            open_saved_capture,
            delete_saved_capture,
            scrolling_capture_supported,
            stitch_scrolling_frames,
            capture_scrolling_automatic,
            begin_manual_scrolling_capture,
            add_manual_scrolling_frame,
            cancel_manual_scrolling_capture,
            discard_scrolling_output,
            complete_scrolling_capture,
            update_global_shortcuts
        ])
        .setup(move |app| {
            if std::env::args().any(|argument| argument == "--background")
                && let Some(window) = app.get_webview_window("dashboard")
            {
                window.hide()?;
            }

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
                MenuItem::with_id(app, "dashboard", "Open Snaphub", true, None::<&str>)?;
            let capture_item =
                MenuItem::with_id(app, "capture", "Capture  Alt+Shift+S", true, None::<&str>)?;
            let restore_pins_item = MenuItem::with_id(
                app,
                "restore-pins",
                "Restore pinned controls",
                true,
                None::<&str>,
            )?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Snaphub", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &dashboard_item,
                    &capture_item,
                    &restore_pins_item,
                    &quit_item,
                ],
            )?;

            let mut tray = TrayIconBuilder::new()
                .tooltip("Snaphub - Capture, explain, continue")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "dashboard" => {
                        if let Err(error) = show_dashboard(app) {
                            eprintln!("SH-DASHBOARD-001: {error}");
                        }
                    }
                    "capture" => emit_capture_request(app),
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
                        && let Err(error) = show_dashboard(tray.app_handle())
                    {
                        eprintln!("SH-DASHBOARD-002: {error}");
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
        .expect("Snaphub failed to initialize");

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
        });
        assert!(result.is_err());
    }
}
