mod domain;
mod error;
mod platform;
mod services;

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use domain::{CaptureSessionDto, CompletionRequest, CompletionResult, DetectedTargetDto, Point};
use error::ShotHubError;
use platform::xcap_backend::XcapPlatformBackend;
use services::capture::CaptureService;
use services::scrolling::stitch_vertical;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

struct ShortcutConfiguration(Mutex<String>);
struct PinnedCaptureRegistry(Mutex<HashMap<String, String>>);

#[tauri::command]
fn begin_capture(
    app: AppHandle,
    service: tauri::State<'_, CaptureService>,
) -> Result<CaptureSessionDto, ShotHubError> {
    let session = service.begin()?;
    let window = app
        .get_webview_window("capture")
        .ok_or_else(|| ShotHubError::Window("Capture window is unavailable".into()))?;
    let scale = session.display.scale_factor;
    window
        .set_position(PhysicalPosition::new(
            (session.display.bounds.x * scale).round() as i32,
            (session.display.bounds.y * scale).round() as i32,
        ))
        .map_err(|error| ShotHubError::Window(error.to_string()))?;
    window
        .set_size(PhysicalSize::new(
            (session.display.bounds.width * scale).round() as u32,
            (session.display.bounds.height * scale).round() as u32,
        ))
        .map_err(|error| ShotHubError::Window(error.to_string()))?;
    Ok(session)
}

#[tauri::command]
fn show_capture_surface(app: AppHandle) -> Result<(), ShotHubError> {
    let window = app
        .get_webview_window("capture")
        .ok_or_else(|| ShotHubError::Window("Capture window is unavailable".into()))?;
    window
        .show()
        .map_err(|error| ShotHubError::Window(error.to_string()))?;
    // Some Windows focus policies reject programmatic focus. The capture must remain usable
    // instead of falling back to an opaque error window when that happens.
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
fn complete_capture(
    app: AppHandle,
    service: tauri::State<'_, CaptureService>,
    request: CompletionRequest,
) -> Result<CompletionResult, ShotHubError> {
    let result = service.complete(&request)?;
    // The modal capture surface must always disappear before a pin window is attempted. A pin
    // construction error must never strand an input-blocking fullscreen overlay.
    hide_capture_window(&app)?;
    if matches!(request.action, domain::CompletionAction::Pin)
        && let Some(path) = result.output_path.as_deref()
    {
        create_pin_window(&app, path)?;
    }
    Ok(result)
}

#[tauri::command]
fn cancel_capture(
    app: AppHandle,
    service: tauri::State<'_, CaptureService>,
    session_id: String,
) -> Result<(), ShotHubError> {
    let cleanup_result = service.cancel(&session_id);
    let hide_result = hide_capture_window(&app);
    hide_result.and(cleanup_result)
}

#[tauri::command]
fn dismiss_capture(app: AppHandle) -> Result<(), ShotHubError> {
    hide_capture_window(&app)
}

#[tauri::command]
fn pinned_capture_path(
    registry: tauri::State<'_, PinnedCaptureRegistry>,
    label: String,
) -> Result<String, ShotHubError> {
    registry
        .0
        .lock()
        .map_err(|_| ShotHubError::Window("Pinned capture registry is unavailable".into()))?
        .get(&label)
        .cloned()
        .ok_or_else(|| ShotHubError::Window("Pinned capture image is unavailable".into()))
}

#[tauri::command]
fn detect_targets(
    service: tauri::State<'_, CaptureService>,
    point: Point,
) -> Result<Vec<DetectedTargetDto>, ShotHubError> {
    service.detect_targets(point)
}

#[tauri::command]
fn list_targets(
    service: tauri::State<'_, CaptureService>,
) -> Result<Vec<DetectedTargetDto>, ShotHubError> {
    service.list_targets()
}

#[tauri::command]
fn scrolling_capture_supported(service: tauri::State<'_, CaptureService>) -> bool {
    service.scrolling_supported()
}

#[tauri::command]
async fn stitch_scrolling_frames(frame_paths: Vec<String>) -> Result<String, ShotHubError> {
    tauri::async_runtime::spawn_blocking(move || {
        let frames = frame_paths
            .iter()
            .map(|path| {
                image::open(path)
                    .map(image::DynamicImage::into_rgba8)
                    .map_err(ShotHubError::capture)
            })
            .collect::<Result<Vec<_>, _>>()?;
        let stitched = stitch_vertical(&frames, 24, 420)?;
        let output =
            std::env::temp_dir().join(format!("shothub-scroll-{}.png", uuid::Uuid::new_v4()));
        stitched
            .save_with_format(&output, image::ImageFormat::Png)
            .map_err(ShotHubError::export)?;
        Ok(output.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| ShotHubError::Capture(error.to_string()))?
}

#[tauri::command]
fn update_global_shortcut(
    app: AppHandle,
    configuration: tauri::State<'_, ShortcutConfiguration>,
    shortcut: String,
) -> Result<String, ShotHubError> {
    let normalized = shortcut.trim();
    if normalized.is_empty() {
        return Err(ShotHubError::Shortcut(
            "A capture shortcut cannot be empty".into(),
        ));
    }

    let mut current = configuration
        .0
        .lock()
        .map_err(|_| ShotHubError::Shortcut("Shortcut settings are unavailable".into()))?;
    let previous = current.clone();
    app.global_shortcut()
        .unregister_all()
        .map_err(|error| ShotHubError::Shortcut(error.to_string()))?;
    if let Err(error) = app.global_shortcut().register(normalized) {
        let _ = app.global_shortcut().register(previous.as_str());
        return Err(ShotHubError::Shortcut(format!(
            "{normalized} is unavailable: {error}"
        )));
    }

    normalized.clone_into(&mut current);
    Ok(current.clone())
}

fn hide_capture_window(app: &AppHandle) -> Result<(), ShotHubError> {
    if let Some(window) = app.get_webview_window("capture") {
        window
            .hide()
            .map_err(|error| ShotHubError::Window(error.to_string()))?;
    }
    Ok(())
}

fn create_pin_window(app: &AppHandle, path: &str) -> Result<(), ShotHubError> {
    let label = format!("pin-{}", uuid::Uuid::new_v4());
    app.state::<PinnedCaptureRegistry>()
        .0
        .lock()
        .map_err(|_| ShotHubError::Window("Pinned capture registry is unavailable".into()))?
        .insert(label.clone(), path.to_owned());
    let build_result = WebviewWindowBuilder::new(
        app,
        label.clone(),
        WebviewUrl::App(PathBuf::from("index.html")),
    )
    .title("ShotHub Pin")
    .decorations(false)
    .always_on_top(true)
    .transparent(true)
    .resizable(true)
    .inner_size(480.0, 320.0)
    .skip_taskbar(false)
    .build();
    if let Err(error) = build_result {
        if let Ok(mut registry) = app.state::<PinnedCaptureRegistry>().0.lock() {
            registry.remove(&label);
        }
        return Err(ShotHubError::Window(error.to_string()));
    }
    Ok(())
}

fn emit_capture_request(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("capture") {
        let _ = window.emit("shothub://capture-requested", ());
    }
}

fn show_dashboard(app: &AppHandle) -> Result<(), ShotHubError> {
    if let Some(window) = app.get_webview_window("dashboard") {
        window
            .show()
            .map_err(|error| ShotHubError::Window(error.to_string()))?;
        let _ = window.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        "dashboard",
        WebviewUrl::App(PathBuf::from("index.html")),
    )
    .title("ShotHub")
    .inner_size(1120.0, 780.0)
    .min_inner_size(900.0, 640.0)
    .center()
    .resizable(true)
    .build()
    .map_err(|error| ShotHubError::Window(error.to_string()))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shortcut = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyS);
    let backend = Arc::new(XcapPlatformBackend);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _received, event| {
                    if event.state() == ShortcutState::Pressed {
                        emit_capture_request(app);
                    }
                })
                .build(),
        )
        .manage(CaptureService::new(backend))
        .manage(ShortcutConfiguration(Mutex::new("Alt+Shift+S".into())))
        .manage(PinnedCaptureRegistry(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            begin_capture,
            show_capture_surface,
            complete_capture,
            cancel_capture,
            dismiss_capture,
            pinned_capture_path,
            detect_targets,
            list_targets,
            scrolling_capture_supported,
            stitch_scrolling_frames,
            update_global_shortcut
        ])
        .setup(move |app| {
            if std::env::args().any(|argument| argument == "--background")
                && let Some(window) = app.get_webview_window("dashboard")
            {
                window.hide()?;
            }

            if let Err(error) = app.global_shortcut().register(shortcut) {
                eprintln!("SH-SHORTCUT-001: Alt+Shift+S could not be registered: {error}");
            }

            let dashboard_item =
                MenuItem::with_id(app, "dashboard", "Open ShotHub", true, None::<&str>)?;
            let capture_item =
                MenuItem::with_id(app, "capture", "Capture  Alt+Shift+S", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit ShotHub", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&dashboard_item, &capture_item, &quit_item])?;

            let mut tray = TrayIconBuilder::new()
                .tooltip("ShotHub - Capture, explain, continue")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "dashboard" => {
                        if let Err(error) = show_dashboard(app) {
                            eprintln!("SH-DASHBOARD-001: {error}");
                        }
                    }
                    "capture" => emit_capture_request(app),
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
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
                && let Ok(mut registry) = window
                    .app_handle()
                    .state::<PinnedCaptureRegistry>()
                    .0
                    .lock()
            {
                registry.remove(window.label());
            }
        })
        .build(tauri::generate_context!())
        .expect("ShotHub failed to initialize");

    app.run(|_app, event| {
        if let tauri::RunEvent::ExitRequested { api, code, .. } = event
            && code.is_none()
        {
            api.prevent_exit();
        }
    });
}
