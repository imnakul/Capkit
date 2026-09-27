//! WebView2 permission plumbing for the camera window (Windows only).
//!
//! The dock's Camera button is the user's explicit consent, because it is a
//! click inside our own app. This grants camera access for the camera
//! webview only and clears a previously persisted deny, so the user never
//! sees a badly placed WebView2 prompt that cannot be undone.

use std::sync::mpsc;
use std::time::Duration;

use tauri::{AppHandle, Manager};
use webview2_com::{
    Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW, COREWEBVIEW2_PERMISSION_STATE_DEFAULT,
        ICoreWebView2_13, ICoreWebView2Controller, ICoreWebView2Profile4,
    },
    PermissionRequestedEventHandler, SetPermissionStateCompletedHandler,
};
use windows_core_061::{Interface as _, w};

use crate::error::SnaphubError;

/// Origins the app serves: the release origin and the Vite dev server.
const ORIGIN_COUNT: usize = 2;
/// How long to wait for WebView2 to confirm the reset before continuing
/// with the grant handler alone.
const RESET_TIMEOUT: Duration = Duration::from_secs(10);

/// Grants camera access for the camera webview and clears a persisted deny.
///
/// Registration runs on the main thread through `with_webview`; the async
/// permission resets are awaited off-thread. Clearing is best-effort: the
/// `PermissionRequested` handler is the real grant, so a failed reset only
/// warns.
pub async fn prepare_camera_permission(app: &AppHandle) -> Result<(), SnaphubError> {
    let Some(window) = app.get_webview_window("camera") else {
        return Err(SnaphubError::Window("Camera window is unavailable".into()));
    };
    let (setup_tx, setup_rx) = mpsc::channel::<Result<(), String>>();
    let (done_tx, done_rx) = mpsc::channel::<Result<(), String>>();
    window
        .with_webview(move |webview| {
            let result = register_camera_permission(&webview.controller(), done_tx);
            let _ = setup_tx.send(result);
        })
        .map_err(|error| SnaphubError::Window(format!("Camera webview is unavailable: {error}")))?;
    setup_rx
        .recv()
        .map_err(|_| SnaphubError::Window("Camera permission setup did not complete".into()))?
        .map_err(SnaphubError::Window)?;
    let errors = tauri::async_runtime::spawn_blocking(move || {
        let mut errors = Vec::new();
        for _ in 0..ORIGIN_COUNT {
            match done_rx.recv_timeout(RESET_TIMEOUT) {
                Ok(Ok(())) => {}
                Ok(Err(error)) => errors.push(error),
                Err(_) => {
                    errors.push("camera permission reset timed out".to_owned());
                    break;
                }
            }
        }
        errors
    })
    .await
    .map_err(|error| SnaphubError::Window(format!("Camera permission wait failed: {error}")))?;
    for error in errors {
        eprintln!("SH-CAMERA-PERMISSION-001: {error}");
    }
    Ok(())
}

fn register_camera_permission(
    controller: &ICoreWebView2Controller,
    done_tx: mpsc::Sender<Result<(), String>>,
) -> Result<(), String> {
    // SAFETY: the controller is live.
    let core = unsafe { controller.CoreWebView2() }.map_err(|error| error.to_string())?;
    let mut token: i64 = 0;
    // SAFETY: the webview is live, and it holds the handler.
    unsafe {
        core.add_PermissionRequested(
            &PermissionRequestedEventHandler::create(Box::new(|_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                args.PermissionKind(&mut kind)?;
                if kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA {
                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                }
                Ok(())
            })),
            &mut token,
        )
    }
    .map_err(|error| error.to_string())?;
    let profile: ICoreWebView2Profile4 = core
        .cast::<ICoreWebView2_13>()
        .and_then(|core13| unsafe { core13.Profile() })
        .and_then(|profile| profile.cast())
        .map_err(|error| error.to_string())?;
    for origin in [w!("https://tauri.localhost"), w!("http://localhost:1420")] {
        let done_tx = done_tx.clone();
        let completed = SetPermissionStateCompletedHandler::create(Box::new(
            move |result: windows_core_061::Result<()>| {
                let _ = done_tx.send(result.map_err(|error| error.to_string()));
                Ok(())
            },
        ));
        // SAFETY: the profile is live; completion arrives on its own thread.
        unsafe {
            profile.SetPermissionState(
                COREWEBVIEW2_PERMISSION_KIND_CAMERA,
                origin,
                COREWEBVIEW2_PERMISSION_STATE_DEFAULT,
                &completed,
            )
        }
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}
