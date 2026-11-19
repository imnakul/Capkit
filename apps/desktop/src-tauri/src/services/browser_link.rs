//! Localhost WebSocket link to the CapKit Inspector browser extension.
//!
//! Invariants (see `docs/specs/browser-devtools.md`): the listener binds `127.0.0.1` only and
//! only while Developer tools is on; an upgrade needs an extension `Origin` and a local `Host`;
//! a socket can only pair or say hello until a token tied to its `Origin` authenticates it;
//! every frame is validated and at most 256 KiB; tokens never leave this module except to the
//! extension that earned them.

use std::{
    collections::HashMap,
    net::{SocketAddr, TcpListener as StdListener},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard, mpsc},
    time::Duration,
};

use chrono::{DateTime, Utc};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::{
    net::{TcpListener, TcpStream},
    sync::{mpsc as tokio_mpsc, oneshot},
    time::{Instant, timeout, timeout_at},
};
use tokio_tungstenite::{
    accept_hdr_async_with_config,
    tungstenite::{
        Message,
        handshake::server::{ErrorResponse, Request, Response},
        http::{HeaderMap, StatusCode},
        protocol::{CloseFrame, WebSocketConfig, frame::coding::CloseCode},
    },
};
use uuid::Uuid;

use crate::{
    domain::{DetectedTargetDto, Point, Rect},
    error::SnaphubError,
    platform::WebViewport,
};

pub const LINK_PORTS: [u16; 3] = [47811, 47812, 47813];
pub const STATUS_EVENT: &str = "browser-link://status";
pub const MAX_FRAME_BYTES: usize = 256 * 1024;
const PROTOCOL_VERSION: u8 = 1;
const PAIRING_SECONDS: i64 = 120;
const MAX_PAIRING_ATTEMPTS: u8 = 5;
const FIRST_MESSAGE_DEADLINE: Duration = Duration::from_secs(5);
const HIT_TEST_TIMEOUT: Duration = Duration::from_millis(250);
const INSPECT_TIMEOUT: Duration = Duration::from_millis(2000);
const FIND_SENSITIVE_TIMEOUT: Duration = Duration::from_millis(1500);
const MAX_TITLE_CHARS: usize = 500;

// ---------------------------------------------------------------------------------------------
// Wire messages
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BrowserDto {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TabInfo {
    pub url: String,
    pub title: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResultStatus {
    Ok,
    NoTab,
    NoAccess,
    Mismatch,
    Error,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HitElement {
    pub key: String,
    pub label: String,
    pub rect: Rect,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CssViewport {
    pub width: f64,
    pub height: f64,
    pub device_pixel_ratio: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ComponentInfo {
    pub name: String,
    #[serde(rename = "ownerPath")]
    pub owner_path: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceLocation {
    pub file: String,
    pub line: i64,
    pub column: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ElementStyles {
    pub color: String,
    pub background_color: String,
    pub font_family: String,
    pub font_size: String,
    pub font_weight: String,
    pub line_height: String,
    pub padding: String,
    pub margin: String,
    pub border_radius: String,
    pub box_shadow: String,
    pub display: String,
    pub gap: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ElementDetails {
    pub label: String,
    pub tag: String,
    pub role: Option<String>,
    pub accessible_name: String,
    pub text: String,
    pub selector: String,
    pub component: Option<ComponentInfo>,
    pub source: Option<SourceLocation>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_unavailable_reason: Option<String>,
    pub classes: String,
    pub styles: ElementStyles,
    pub css_rect: Rect,
    pub rect: Rect,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SensitiveKind {
    Token,
    Card,
    Email,
    Phone,
    Secret,
    Password,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SensitiveMatchDto {
    pub kind: SensitiveKind,
    pub preview: String,
    pub rects: Vec<Rect>,
}

/// Extension → CapKit. Unknown fields are rejected.
#[allow(
    dead_code,
    reason = "extensionVersion and tab are validated by the schema but not used yet"
)]
#[derive(Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Incoming {
    Pair {
        v: u8,
        code: String,
        browser: BrowserDto,
        extension_version: String,
    },
    Hello {
        v: u8,
        token: String,
        browser: BrowserDto,
        extension_version: String,
    },
    Ping {
        v: u8,
    },
    HitTestResult {
        v: u8,
        id: String,
        status: ResultStatus,
        tab: Option<TabInfo>,
        elements: Vec<HitElement>,
    },
    InspectResult {
        v: u8,
        id: String,
        status: ResultStatus,
        tab: Option<TabInfo>,
        css_viewport: Option<CssViewport>,
        elements: Vec<ElementDetails>,
    },
    FindSensitiveResult {
        v: u8,
        id: String,
        status: ResultStatus,
        matches: Vec<SensitiveMatchDto>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PairReject {
    WrongCode,
    Expired,
    TooManyAttempts,
    NotPairing,
}

/// CapKit → extension.
#[derive(Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum Outgoing<'a> {
    Paired {
        v: u8,
        token: &'a str,
    },
    PairRejected {
        v: u8,
        reason: PairReject,
    },
    Ready {
        v: u8,
        #[serde(skip_serializing_if = "Option::is_none")]
        accent: Option<String>,
    },
    Theme {
        v: u8,
        accent: &'a str,
    },
    HelloRejected {
        v: u8,
        reason: &'static str,
    },
    Pong {
        v: u8,
    },
    HitTest {
        v: u8,
        id: &'a str,
        window_title: String,
        viewport: Rect,
        point: Point,
    },
    Inspect {
        v: u8,
        id: &'a str,
        window_title: String,
        viewport: Rect,
        #[serde(skip_serializing_if = "Option::is_none")]
        point: Option<Point>,
        #[serde(skip_serializing_if = "Option::is_none")]
        area: Option<Rect>,
    },
    FindSensitive {
        v: u8,
        id: &'a str,
        window_title: String,
        viewport: Rect,
        area: Rect,
    },
}

fn frame(message: &Outgoing<'_>) -> String {
    // Serializing these plain structs cannot fail; an empty frame would be rejected by the peer.
    serde_json::to_string(message).unwrap_or_default()
}

/// Parses one text frame from the extension. `None` for oversize, malformed or wrong-version.
pub fn parse_incoming(raw: &str) -> Option<Incoming> {
    if raw.len() > MAX_FRAME_BYTES {
        return None;
    }
    let message: Incoming = serde_json::from_str(raw).ok()?;
    let version = match &message {
        Incoming::Pair { v, .. }
        | Incoming::Hello { v, .. }
        | Incoming::Ping { v }
        | Incoming::HitTestResult { v, .. }
        | Incoming::InspectResult { v, .. }
        | Incoming::FindSensitiveResult { v, .. } => *v,
    };
    (version == PROTOCOL_VERSION).then_some(message)
}

// ---------------------------------------------------------------------------------------------
// Pure helpers: upgrade validation, pairing, constant-time compare, base64url
// ---------------------------------------------------------------------------------------------

/// `chrome-extension://` followed by exactly 32 characters in `a..=p`.
fn is_extension_origin(origin: &str) -> bool {
    origin
        .strip_prefix("chrome-extension://")
        .is_some_and(|id| id.len() == 32 && id.bytes().all(|byte| (b'a'..=b'p').contains(&byte)))
}

/// Accepts an upgrade only from an extension `Origin` addressed to a local `Host`.
pub fn validate_upgrade(headers: &HeaderMap, port: u16) -> bool {
    let origin = headers.get("origin").and_then(|value| value.to_str().ok());
    let host = headers.get("host").and_then(|value| value.to_str().ok());
    let (Some(origin), Some(host)) = (origin, host) else {
        return false;
    };
    is_extension_origin(origin)
        && (host == format!("127.0.0.1:{port}") || host == format!("localhost:{port}"))
}

/// Compares secrets without an early exit on the first differing byte.
pub fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

fn base64url(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let block = (u32::from(chunk[0]) << 16)
            | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8)
            | u32::from(*chunk.get(2).unwrap_or(&0));
        out.push(char::from(ALPHABET[(block >> 18) as usize & 63]));
        out.push(char::from(ALPHABET[(block >> 12) as usize & 63]));
        if chunk.len() > 1 {
            out.push(char::from(ALPHABET[(block >> 6) as usize & 63]));
        }
        if chunk.len() > 2 {
            out.push(char::from(ALPHABET[block as usize & 63]));
        }
    }
    out
}

/// 32 random bytes from two v4 UUIDs, base64url (43 characters).
fn new_token() -> String {
    let mut bytes = Vec::with_capacity(32);
    bytes.extend_from_slice(Uuid::new_v4().as_bytes());
    bytes.extend_from_slice(Uuid::new_v4().as_bytes());
    base64url(&bytes)
}

fn new_code() -> String {
    let bytes = Uuid::new_v4().into_bytes();
    let mut eight = [0u8; 8];
    eight.copy_from_slice(&bytes[..8]);
    format!("{:06}", u64::from_be_bytes(eight) % 1_000_000)
}

/// The pairing code state machine. Expiry is checked lazily on use; no timer runs.
#[derive(Debug, Default)]
pub struct PairingState {
    code: Option<String>,
    expires_at: Option<DateTime<Utc>>,
    attempts: u8,
}

impl PairingState {
    /// Replaces any previous code. Returns the expiry.
    pub fn start(&mut self, code: String, now: DateTime<Utc>) -> DateTime<Utc> {
        let expires_at = now + chrono::Duration::seconds(PAIRING_SECONDS);
        self.code = Some(code);
        self.expires_at = Some(expires_at);
        self.attempts = 0;
        expires_at
    }

    /// True while a code is live but its guesses are used up.
    pub fn exhausted(&self) -> bool {
        self.code.is_some() && self.attempts >= MAX_PAIRING_ATTEMPTS
    }

    pub fn cancel(&mut self) {
        self.code = None;
        self.expires_at = None;
        self.attempts = 0;
    }

    /// Checks a candidate in the spec's order. A correct code is consumed.
    pub fn verify(&mut self, candidate: &str, now: DateTime<Utc>) -> Result<(), PairReject> {
        let Some(code) = self.code.as_deref() else {
            return Err(PairReject::NotPairing);
        };
        if self.expires_at.is_none_or(|expires_at| now >= expires_at) {
            self.cancel();
            return Err(PairReject::Expired);
        }
        if self.attempts >= MAX_PAIRING_ATTEMPTS {
            self.cancel();
            return Err(PairReject::TooManyAttempts);
        }
        if constant_time_eq(code.as_bytes(), candidate.as_bytes()) {
            self.cancel();
            Ok(())
        } else {
            self.attempts += 1;
            Err(PairReject::WrongCode)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairedRecord {
    origin: String,
    token: String,
    browser: BrowserDto,
    paired_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LinkConfig {
    version: u8,
    enabled: bool,
    paired: Vec<PairedRecord>,
}

impl Default for LinkConfig {
    fn default() -> Self {
        Self {
            version: 1,
            enabled: false,
            paired: Vec::new(),
        }
    }
}

fn load_config(path: &Path) -> LinkConfig {
    let Ok(text) = std::fs::read_to_string(path) else {
        return LinkConfig::default();
    };
    match serde_json::from_str::<LinkConfig>(&text) {
        Ok(config) if config.version == 1 => config,
        _ => {
            eprintln!("SH-LINK-001: browser-link.json is unreadable; starting with it disabled");
            let _ = std::fs::rename(path, path.with_extension("json.bad"));
            LinkConfig::default()
        }
    }
}

/// Writes to a temporary file, then renames over the target.
fn save_config(path: &Path, config: &LinkConfig) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("json.tmp");
    std::fs::write(
        &temporary,
        serde_json::to_vec_pretty(config).map_err(std::io::Error::other)?,
    )?;
    std::fs::rename(temporary, path)
}

// ---------------------------------------------------------------------------------------------
// DTOs shown to the webview. They contain no secrets.
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedBrowserDto {
    pub origin: String,
    pub browser: BrowserDto,
    pub paired_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserLinkStatusDto {
    pub enabled: bool,
    pub state: &'static str,
    pub port: Option<u16>,
    pub error: Option<String>,
    pub pairing_locked: bool,
    pub connected: Vec<BrowserDto>,
    pub paired: Vec<PairedBrowserDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingCodeDto {
    pub code: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectResultDto {
    pub tab: Option<TabInfo>,
    pub css_viewport: Option<CssViewport>,
    pub elements: Vec<ElementDetails>,
}

pub enum InspectTarget {
    Point(Point),
    Area(Rect),
}

/// What the capture path asks of a connected browser. Implemented by `BrowserLinkService`;
/// tests substitute a fake.
pub trait BrowserElementSource: Send + Sync {
    fn is_connected(&self) -> bool;
    fn element_at(&self, viewport: &WebViewport, point: Point) -> Option<Vec<DetectedTargetDto>>;
    fn inspect(&self, viewport: &WebViewport, target: InspectTarget) -> Option<InspectResultDto>;
    fn find_sensitive(&self, viewport: &WebViewport, area: Rect) -> Option<Vec<SensitiveMatchDto>>;
}

// ---------------------------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------------------------

enum Outbound {
    Text(String),
    Close(u16, &'static str),
}

struct Connection {
    origin: String,
    authed: bool,
    browser: Option<BrowserDto>,
    tx: tokio_mpsc::UnboundedSender<Outbound>,
}

enum Reply {
    HitTest {
        status: ResultStatus,
        elements: Vec<HitElement>,
    },
    Inspect {
        status: ResultStatus,
        tab: Option<TabInfo>,
        css_viewport: Option<CssViewport>,
        elements: Vec<ElementDetails>,
    },
    FindSensitive {
        status: ResultStatus,
        matches: Vec<SensitiveMatchDto>,
    },
}

impl Reply {
    fn is_ok(&self) -> bool {
        let status = match self {
            Self::HitTest { status, .. }
            | Self::Inspect { status, .. }
            | Self::FindSensitive { status, .. } => status,
        };
        *status == ResultStatus::Ok
    }
}

struct Pending {
    sender: mpsc::Sender<Reply>,
    /// Only these connections may answer; anything else is dropped.
    from: Vec<u64>,
    kind: PendingKind,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PendingKind {
    HitTest,
    Inspect,
    FindSensitive,
}

struct Listener {
    port: u16,
    handle: tauri::async_runtime::JoinHandle<()>,
}

struct Shared {
    config: LinkConfig,
    config_path: PathBuf,
    pairing: PairingState,
    /// Set once a code ran out of guesses, so Settings can say so. Cleared by a new code.
    pairing_locked: bool,
    listener: Option<Listener>,
    bind_error: Option<String>,
    connections: HashMap<u64, Connection>,
    next_connection: u64,
    pending: HashMap<String, Pending>,
    /// CapKit's theme accent (`#rrggbb`), set by the frontend; sent to the extension.
    accent: Option<String>,
}

type StatusEmitter = dyn Fn(&BrowserLinkStatusDto) + Send + Sync;

struct Inner {
    state: Mutex<Shared>,
    ports: Vec<u16>,
    emit: Arc<StatusEmitter>,
}

#[derive(Clone)]
pub struct BrowserLinkService {
    inner: Arc<Inner>,
}

fn lock(state: &Mutex<Shared>) -> MutexGuard<'_, Shared> {
    state
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn status_of(shared: &Shared) -> BrowserLinkStatusDto {
    let state = if !shared.config.enabled {
        "off"
    } else if shared.bind_error.is_some() {
        "error"
    } else {
        "listening"
    };
    let mut connected: Vec<BrowserDto> = shared
        .connections
        .values()
        .filter(|connection| connection.authed)
        .filter_map(|connection| connection.browser.clone())
        .collect();
    connected.sort_by(|left, right| left.name.cmp(&right.name));
    BrowserLinkStatusDto {
        enabled: shared.config.enabled,
        state,
        port: shared.listener.as_ref().map(|listener| listener.port),
        error: shared.bind_error.clone(),
        pairing_locked: shared.pairing_locked,
        connected,
        paired: shared
            .config
            .paired
            .iter()
            .map(|record| PairedBrowserDto {
                origin: record.origin.clone(),
                browser: record.browser.clone(),
                paired_at: record.paired_at.clone(),
            })
            .collect(),
    }
}

impl Inner {
    fn emit_status(&self) {
        let status = status_of(&lock(&self.state));
        (self.emit)(&status);
    }
}

fn is_hex_color(value: &str) -> bool {
    value.len() == 7 && value.starts_with('#') && value[1..].chars().all(|c| c.is_ascii_hexdigit())
}

fn truncate_title(title: &str) -> String {
    title.chars().take(MAX_TITLE_CHARS).collect()
}

fn forbidden() -> ErrorResponse {
    let mut response = ErrorResponse::new(Some("Forbidden".into()));
    *response.status_mut() = StatusCode::FORBIDDEN;
    response
}

impl BrowserLinkService {
    /// Reads `browser-link.json` and starts listening when it says enabled.
    pub fn new(app: AppHandle, config_path: PathBuf) -> Self {
        let emit: Arc<StatusEmitter> = Arc::new(move |status| {
            let _ = app.emit_to("dashboard", STATUS_EVENT, status);
        });
        Self::with_parts(config_path, LINK_PORTS.to_vec(), emit)
    }

    fn with_parts(config_path: PathBuf, ports: Vec<u16>, emit: Arc<StatusEmitter>) -> Self {
        let config = load_config(&config_path);
        let enabled = config.enabled;
        let service = Self {
            inner: Arc::new(Inner {
                state: Mutex::new(Shared {
                    config,
                    config_path,
                    pairing: PairingState::default(),
                    pairing_locked: false,
                    listener: None,
                    bind_error: None,
                    connections: HashMap::new(),
                    accent: None,
                    next_connection: 1,
                    pending: HashMap::new(),
                }),
                ports,
                emit,
            }),
        };
        if enabled {
            service.start_listener();
        }
        service
    }

    pub fn status(&self) -> BrowserLinkStatusDto {
        status_of(&lock(&self.inner.state))
    }

    pub fn set_enabled(&self, enabled: bool) -> Result<BrowserLinkStatusDto, SnaphubError> {
        {
            let mut shared = lock(&self.inner.state);
            shared.config.enabled = enabled;
            save_config(&shared.config_path, &shared.config)
                .map_err(|error| SnaphubError::Link(error.to_string()))?;
        }
        if enabled {
            self.start_listener();
        } else {
            self.stop_listener();
        }
        let status = self.status();
        (self.inner.emit)(&status);
        Ok(status)
    }

    pub fn start_pairing(&self) -> Result<PairingCodeDto, SnaphubError> {
        let mut shared = lock(&self.inner.state);
        if !shared.config.enabled {
            return Err(SnaphubError::Link("Developer tools is off".into()));
        }
        let code = new_code();
        let expires_at = shared.pairing.start(code.clone(), Utc::now());
        shared.pairing_locked = false;
        Ok(PairingCodeDto {
            code,
            expires_at: expires_at.to_rfc3339(),
        })
    }

    /// Remembers CapKit's accent colour and sends it to every connected extension.
    /// Ignores anything that isn't `#rrggbb`.
    pub fn set_accent(&self, accent: &str) {
        if !is_hex_color(accent) {
            return;
        }
        let mut shared = lock(&self.inner.state);
        if shared.accent.as_deref() == Some(accent) {
            return;
        }
        shared.accent = Some(accent.to_owned());
        let message = frame(&Outgoing::Theme {
            v: PROTOCOL_VERSION,
            accent,
        });
        for connection in shared.connections.values().filter(|c| c.authed) {
            let _ = connection.tx.send(Outbound::Text(message.clone()));
        }
    }

    pub fn cancel_pairing(&self) {
        let mut shared = lock(&self.inner.state);
        shared.pairing.cancel();
        shared.pairing_locked = false;
    }

    /// Removes a pairing and closes that origin's sockets.
    pub fn forget(&self, origin: &str) -> Result<BrowserLinkStatusDto, SnaphubError> {
        {
            let mut shared = lock(&self.inner.state);
            shared
                .config
                .paired
                .retain(|record| record.origin != origin);
            save_config(&shared.config_path, &shared.config)
                .map_err(|error| SnaphubError::Link(error.to_string()))?;
            for connection in shared.connections.values() {
                if connection.origin == origin {
                    let _ = connection.tx.send(Outbound::Close(1008, "forgotten"));
                }
            }
        }
        let status = self.status();
        (self.inner.emit)(&status);
        Ok(status)
    }

    fn start_listener(&self) {
        let mut shared = lock(&self.inner.state);
        if shared.listener.is_some() {
            return;
        }
        let bound = self.inner.ports.iter().find_map(|port| {
            let listener = StdListener::bind(SocketAddr::from(([127, 0, 0, 1], *port))).ok()?;
            listener.set_nonblocking(true).ok()?;
            let bound_port = listener.local_addr().ok()?.port();
            Some((listener, bound_port))
        });
        let Some((listener, port)) = bound else {
            let first = self.inner.ports.first().copied().unwrap_or(0);
            let last = self.inner.ports.last().copied().unwrap_or(0);
            shared.bind_error = Some(format!("Ports {first}\u{2013}{last} are in use"));
            return;
        };
        shared.bind_error = None;
        let handle = tauri::async_runtime::spawn(accept_loop(self.inner.clone(), listener, port));
        shared.listener = Some(Listener { port, handle });
    }

    fn stop_listener(&self) {
        let mut shared = lock(&self.inner.state);
        shared.bind_error = None;
        if let Some(listener) = shared.listener.take() {
            listener.handle.abort();
        }
        for connection in shared.connections.values() {
            let _ = connection.tx.send(Outbound::Close(1001, "going away"));
        }
        // Dropping the senders wakes every waiting caller with no answer.
        shared.pending.clear();
        shared.pairing.cancel();
    }

    /// Sends one request to every authenticated connection and returns the first `ok` reply,
    /// or `None` when all replies are not ok or the timeout passes.
    fn request(
        &self,
        kind: PendingKind,
        wait: Duration,
        build: impl Fn(&str) -> String,
    ) -> Option<Reply> {
        let id = Uuid::new_v4().to_string();
        let (sender, receiver) = mpsc::channel();
        let frame = build(&id);
        let sent = {
            let mut shared = lock(&self.inner.state);
            let targets: Vec<u64> = shared
                .connections
                .iter()
                .filter(|(_, connection)| connection.authed)
                .map(|(connection_id, _)| *connection_id)
                .collect();
            if targets.is_empty() {
                return None;
            }
            let mut from = Vec::new();
            for connection_id in targets {
                if let Some(connection) = shared.connections.get(&connection_id)
                    && connection.tx.send(Outbound::Text(frame.clone())).is_ok()
                {
                    from.push(connection_id);
                }
            }
            let count = from.len();
            if count == 0 {
                return None;
            }
            shared
                .pending
                .insert(id.clone(), Pending { sender, from, kind });
            count
        };
        let deadline = std::time::Instant::now() + wait;
        let mut answered = 0;
        let mut result = None;
        while answered < sent {
            let remaining = deadline.saturating_duration_since(std::time::Instant::now());
            match receiver.recv_timeout(remaining) {
                Ok(reply) => {
                    answered += 1;
                    if reply.is_ok() {
                        result = Some(reply);
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        lock(&self.inner.state).pending.remove(&id);
        result
    }
}

fn to_screen(viewport: &Rect, rect: &Rect) -> Rect {
    Rect {
        x: viewport.x + rect.x,
        y: viewport.y + rect.y,
        width: rect.width,
        height: rect.height,
    }
}

impl BrowserElementSource for BrowserLinkService {
    fn is_connected(&self) -> bool {
        lock(&self.inner.state)
            .connections
            .values()
            .any(|connection| connection.authed)
    }

    fn element_at(&self, viewport: &WebViewport, point: Point) -> Option<Vec<DetectedTargetDto>> {
        let local = Point {
            x: point.x - viewport.viewport.x,
            y: point.y - viewport.viewport.y,
        };
        let reply = self.request(PendingKind::HitTest, HIT_TEST_TIMEOUT, |id| {
            frame(&Outgoing::HitTest {
                v: PROTOCOL_VERSION,
                id,
                window_title: truncate_title(&viewport.window_title),
                viewport: viewport.viewport,
                point: local,
            })
        })?;
        let Reply::HitTest { elements, .. } = reply else {
            return None;
        };
        if elements.is_empty() {
            return None;
        }
        Some(
            elements
                .into_iter()
                .map(|element| DetectedTargetDto {
                    id: format!("ext-{}", element.key),
                    title: element.label,
                    kind: "ui-region",
                    bounds: to_screen(&viewport.viewport, &element.rect),
                })
                .collect(),
        )
    }

    fn inspect(&self, viewport: &WebViewport, target: InspectTarget) -> Option<InspectResultDto> {
        let (point, area) = match target {
            InspectTarget::Point(point) => (
                Some(Point {
                    x: point.x - viewport.viewport.x,
                    y: point.y - viewport.viewport.y,
                }),
                None,
            ),
            InspectTarget::Area(area) => (
                None,
                Some(Rect {
                    x: area.x - viewport.viewport.x,
                    y: area.y - viewport.viewport.y,
                    ..area
                }),
            ),
        };
        let reply = self.request(PendingKind::Inspect, INSPECT_TIMEOUT, |id| {
            frame(&Outgoing::Inspect {
                v: PROTOCOL_VERSION,
                id,
                window_title: truncate_title(&viewport.window_title),
                viewport: viewport.viewport,
                point,
                area,
            })
        })?;
        let Reply::Inspect {
            tab,
            css_viewport,
            mut elements,
            ..
        } = reply
        else {
            return None;
        };
        for element in &mut elements {
            element.rect = to_screen(&viewport.viewport, &element.rect);
        }
        Some(InspectResultDto {
            tab,
            css_viewport,
            elements,
        })
    }

    fn find_sensitive(&self, viewport: &WebViewport, area: Rect) -> Option<Vec<SensitiveMatchDto>> {
        let local = Rect {
            x: area.x - viewport.viewport.x,
            y: area.y - viewport.viewport.y,
            ..area
        };
        let reply = self.request(PendingKind::FindSensitive, FIND_SENSITIVE_TIMEOUT, |id| {
            frame(&Outgoing::FindSensitive {
                v: PROTOCOL_VERSION,
                id,
                window_title: truncate_title(&viewport.window_title),
                viewport: viewport.viewport,
                area: local,
            })
        })?;
        let Reply::FindSensitive { mut matches, .. } = reply else {
            return None;
        };
        for found in &mut matches {
            for rect in &mut found.rects {
                *rect = to_screen(&viewport.viewport, rect);
            }
        }
        Some(matches)
    }
}

// ---------------------------------------------------------------------------------------------
// Network tasks
// ---------------------------------------------------------------------------------------------

async fn accept_loop(inner: Arc<Inner>, std_listener: StdListener, port: u16) {
    let Ok(listener) = TcpListener::from_std(std_listener) else {
        return;
    };
    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                if peer.ip().is_loopback() {
                    tauri::async_runtime::spawn(handle_connection(inner.clone(), stream, port));
                }
            }
            // A failed accept (for example out of handles) must not spin the CPU.
            Err(_) => tokio::time::sleep(Duration::from_millis(250)).await,
        }
    }
}

fn socket_config() -> WebSocketConfig {
    WebSocketConfig::default()
        .max_message_size(Some(MAX_FRAME_BYTES))
        .max_frame_size(Some(MAX_FRAME_BYTES))
}

async fn handle_connection(inner: Arc<Inner>, stream: TcpStream, port: u16) {
    let origin_slot: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let slot = origin_slot.clone();
    // The error type is fixed by tungstenite's handshake callback.
    #[allow(clippy::result_large_err)]
    let callback =
        move |request: &Request, response: Response| -> Result<Response, ErrorResponse> {
            if !validate_upgrade(request.headers(), port) {
                return Err(forbidden());
            }
            if let Some(origin) = request
                .headers()
                .get("origin")
                .and_then(|value| value.to_str().ok())
            {
                *slot
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(origin.to_owned());
            }
            Ok(response)
        };
    let handshake = accept_hdr_async_with_config(stream, callback, Some(socket_config()));
    let Ok(Ok(socket)) = timeout(FIRST_MESSAGE_DEADLINE, handshake).await else {
        return;
    };
    let origin = origin_slot
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .take()
        .unwrap_or_default();

    let (mut sink, mut source) = socket.split();
    let (tx, mut rx) = tokio_mpsc::unbounded_channel::<Outbound>();
    let (done_tx, mut done_rx) = oneshot::channel::<()>();
    tauri::async_runtime::spawn(async move {
        while let Some(outbound) = rx.recv().await {
            match outbound {
                Outbound::Text(text) => {
                    if sink.send(Message::text(text)).await.is_err() {
                        break;
                    }
                }
                Outbound::Close(code, reason) => {
                    let _ = sink
                        .send(Message::Close(Some(CloseFrame {
                            code: CloseCode::from(code),
                            reason: reason.into(),
                        })))
                        .await;
                    break;
                }
            }
        }
        let _ = sink.close().await;
        let _ = done_tx.send(());
    });

    let id = {
        let mut shared = lock(&inner.state);
        let id = shared.next_connection;
        shared.next_connection += 1;
        shared.connections.insert(
            id,
            Connection {
                origin,
                authed: false,
                browser: None,
                tx: tx.clone(),
            },
        );
        id
    };

    let deadline = Instant::now() + FIRST_MESSAGE_DEADLINE;
    loop {
        let authed = lock(&inner.state)
            .connections
            .get(&id)
            .is_some_and(|connection| connection.authed);
        let next = async {
            if authed {
                Some(source.next().await)
            } else {
                timeout_at(deadline, source.next()).await.ok()
            }
        };
        let message = tokio::select! {
            message = next => message,
            _ = &mut done_rx => break,
        };
        let Some(message) = message else {
            let _ = tx.send(Outbound::Close(1008, "no authentication"));
            break;
        };
        match message {
            Some(Ok(Message::Text(text))) => {
                if text.len() > MAX_FRAME_BYTES {
                    let _ = tx.send(Outbound::Close(1009, "too large"));
                } else if let Some((code, reason)) = handle_text(&inner, id, &tx, text.as_str()) {
                    let _ = tx.send(Outbound::Close(code, reason));
                }
            }
            Some(Ok(Message::Binary(_))) => {
                let _ = tx.send(Outbound::Close(1003, "text only"));
            }
            Some(Ok(Message::Close(_))) | None => break,
            Some(Ok(_)) => {}
            Some(Err(tokio_tungstenite::tungstenite::Error::Capacity(_))) => {
                let _ = tx.send(Outbound::Close(1009, "too large"));
            }
            Some(Err(_)) => break,
        }
    }

    {
        let mut shared = lock(&inner.state);
        shared.connections.remove(&id);
    }
    inner.emit_status();
}

/// Handles one validated-size text frame. Returns a close code when the socket must close.
fn handle_text(
    inner: &Arc<Inner>,
    id: u64,
    tx: &tokio_mpsc::UnboundedSender<Outbound>,
    raw: &str,
) -> Option<(u16, &'static str)> {
    let Some(message) = parse_incoming(raw) else {
        return Some((1008, "invalid message"));
    };
    let (authed, origin) = {
        let shared = lock(&inner.state);
        let connection = shared.connections.get(&id)?;
        (connection.authed, connection.origin.clone())
    };
    let send = |outgoing: &Outgoing<'_>| {
        let _ = tx.send(Outbound::Text(frame(outgoing)));
    };

    match message {
        Incoming::Pair { code, browser, .. } if !authed => {
            let result = lock(&inner.state).pairing.verify(&code, Utc::now());
            match result {
                Ok(()) => {
                    let token = new_token();
                    let saved = {
                        let mut shared = lock(&inner.state);
                        shared.pairing_locked = false;
                        shared
                            .config
                            .paired
                            .retain(|record| record.origin != origin);
                        shared.config.paired.push(PairedRecord {
                            origin: origin.clone(),
                            token: token.clone(),
                            browser: browser.clone(),
                            paired_at: Utc::now().to_rfc3339(),
                        });
                        let saved = save_config(&shared.config_path, &shared.config);
                        if let Some(connection) = shared.connections.get_mut(&id) {
                            connection.authed = saved.is_ok();
                            connection.browser = Some(browser);
                        }
                        saved
                    };
                    if saved.is_err() {
                        return Some((1011, "could not save pairing"));
                    }
                    send(&Outgoing::Paired {
                        v: PROTOCOL_VERSION,
                        token: &token,
                    });
                    inner.emit_status();
                    None
                }
                Err(reason) => {
                    let locked = {
                        let mut shared = lock(&inner.state);
                        let locked =
                            reason == PairReject::TooManyAttempts || shared.pairing.exhausted();
                        let changed = locked && !shared.pairing_locked;
                        shared.pairing_locked |= locked;
                        changed
                    };
                    send(&Outgoing::PairRejected {
                        v: PROTOCOL_VERSION,
                        reason,
                    });
                    if locked {
                        inner.emit_status();
                    }
                    Some((1008, "pairing rejected"))
                }
            }
        }
        Incoming::Hello { token, browser, .. } if !authed => {
            let known = {
                let shared = lock(&inner.state);
                shared.config.paired.iter().any(|record| {
                    record.origin == origin
                        && constant_time_eq(record.token.as_bytes(), token.as_bytes())
                })
            };
            if known {
                let accent = {
                    let mut shared = lock(&inner.state);
                    if let Some(connection) = shared.connections.get_mut(&id) {
                        connection.authed = true;
                        connection.browser = Some(browser);
                    }
                    shared.accent.clone()
                };
                send(&Outgoing::Ready {
                    v: PROTOCOL_VERSION,
                    accent,
                });
                inner.emit_status();
                None
            } else {
                send(&Outgoing::HelloRejected {
                    v: PROTOCOL_VERSION,
                    reason: "unknown-token",
                });
                Some((1008, "unknown token"))
            }
        }
        // Anything but pair or hello before authentication, and pair or hello after it.
        Incoming::Pair { .. } | Incoming::Hello { .. } => Some((1008, "unexpected message")),
        _ if !authed => Some((1008, "not authenticated")),
        Incoming::Ping { .. } => {
            send(&Outgoing::Pong {
                v: PROTOCOL_VERSION,
            });
            None
        }
        Incoming::HitTestResult {
            id: request_id,
            status,
            elements,
            ..
        } => {
            route(
                inner,
                id,
                &request_id,
                PendingKind::HitTest,
                Reply::HitTest { status, elements },
            );
            None
        }
        Incoming::InspectResult {
            id: request_id,
            status,
            tab,
            css_viewport,
            elements,
            ..
        } => {
            route(
                inner,
                id,
                &request_id,
                PendingKind::Inspect,
                Reply::Inspect {
                    status,
                    tab,
                    css_viewport,
                    elements,
                },
            );
            None
        }
        Incoming::FindSensitiveResult {
            id: request_id,
            status,
            matches,
            ..
        } => {
            route(
                inner,
                id,
                &request_id,
                PendingKind::FindSensitive,
                Reply::FindSensitive { status, matches },
            );
            None
        }
    }
}

/// Delivers a reply to its waiting caller. A reply for an unknown or finished request, from a
/// connection that was not asked, or of the wrong kind is dropped.
fn route(inner: &Arc<Inner>, connection: u64, request_id: &str, kind: PendingKind, reply: Reply) {
    let shared = lock(&inner.state);
    if let Some(pending) = shared.pending.get(request_id)
        && pending.kind == kind
        && pending.from.contains(&connection)
    {
        let _ = pending.sender.send(reply);
    }
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::HeaderValue};

    const EXTENSION_ORIGIN: &str = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

    fn headers(origin: Option<&str>, host: Option<&str>) -> HeaderMap {
        let mut map = HeaderMap::new();
        if let Some(origin) = origin {
            map.insert("origin", HeaderValue::from_str(origin).unwrap());
        }
        if let Some(host) = host {
            map.insert("host", HeaderValue::from_str(host).unwrap());
        }
        map
    }

    #[test]
    fn upgrade_accepts_an_extension_origin_on_a_local_host() {
        assert!(validate_upgrade(
            &headers(Some(EXTENSION_ORIGIN), Some("127.0.0.1:47811")),
            47811
        ));
        assert!(validate_upgrade(
            &headers(Some(EXTENSION_ORIGIN), Some("localhost:47811")),
            47811
        ));
    }

    #[test]
    fn upgrade_rejects_web_origins_bad_ids_and_foreign_hosts() {
        let good_host = Some("127.0.0.1:47811");
        for origin in [
            Some("https://example.com"),
            Some("http://localhost:3000"),
            Some("chrome-extension://abcdefghijklmnopabcdefghijklmnoq"),
            Some("chrome-extension://abcdefghijklmnopabcdefghijklmno"),
            Some("chrome-extension://ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP"),
            Some("chrome-extension://abcdefghijklmnopabcdefghijklmnop/x"),
            None,
        ] {
            assert!(
                !validate_upgrade(&headers(origin, good_host), 47811),
                "{origin:?}"
            );
        }
        for host in [
            Some("evil.example:47811"),
            Some("127.0.0.1:9999"),
            Some("127.0.0.1"),
            Some("localhost.evil.example:47811"),
            None,
        ] {
            assert!(
                !validate_upgrade(&headers(Some(EXTENSION_ORIGIN), host), 47811),
                "{host:?}"
            );
        }
    }

    #[test]
    fn constant_time_compare_matches_equality() {
        assert!(constant_time_eq(b"123456", b"123456"));
        assert!(!constant_time_eq(b"123456", b"123457"));
        assert!(!constant_time_eq(b"123456", b"12345"));
        assert!(constant_time_eq(b"", b""));
    }

    #[test]
    fn tokens_are_43_url_safe_characters_and_unique() {
        let first = new_token();
        assert_eq!(first.len(), 43);
        assert!(
            first
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        );
        assert_ne!(first, new_token());
        assert_eq!(base64url(b"foobar"), "Zm9vYmFy");
        assert_eq!(base64url(b"fo"), "Zm8");
    }

    #[test]
    fn codes_are_six_digits() {
        for _ in 0..50 {
            let code = new_code();
            assert_eq!(code.len(), 6);
            assert!(code.bytes().all(|byte| byte.is_ascii_digit()));
        }
    }

    fn at(seconds: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(1_800_000_000 + seconds, 0).unwrap()
    }

    #[test]
    fn pairing_code_is_single_use() {
        let mut state = PairingState::default();
        state.start("123456".into(), at(0));
        assert_eq!(state.verify("123456", at(10)), Ok(()));
        assert_eq!(state.verify("123456", at(11)), Err(PairReject::NotPairing));
    }

    #[test]
    fn pairing_without_a_code_is_rejected() {
        let mut state = PairingState::default();
        assert_eq!(state.verify("123456", at(0)), Err(PairReject::NotPairing));
    }

    #[test]
    fn pairing_code_expires_after_120_seconds() {
        let mut state = PairingState::default();
        let expires = state.start("123456".into(), at(0));
        assert_eq!(expires, at(120));
        assert_eq!(state.verify("123456", at(119)), Ok(()));
        state.start("123456".into(), at(0));
        assert_eq!(state.verify("123456", at(120)), Err(PairReject::Expired));
        assert_eq!(state.verify("123456", at(121)), Err(PairReject::NotPairing));
    }

    #[test]
    fn five_wrong_codes_are_allowed_then_the_code_is_burned() {
        let mut state = PairingState::default();
        state.start("123456".into(), at(0));
        for _ in 0..5 {
            assert_eq!(state.verify("000000", at(1)), Err(PairReject::WrongCode));
        }
        assert_eq!(
            state.verify("123456", at(2)),
            Err(PairReject::TooManyAttempts)
        );
        assert_eq!(state.verify("123456", at(3)), Err(PairReject::NotPairing));
    }

    #[test]
    fn the_code_reports_when_its_guesses_are_used_up() {
        let mut state = PairingState::default();
        assert!(!state.exhausted());
        state.start("123456".into(), at(0));
        for _ in 0..4 {
            let _ = state.verify("000000", at(1));
        }
        assert!(!state.exhausted());
        let _ = state.verify("000000", at(1));
        assert!(state.exhausted());
        state.start("654321".into(), at(2));
        assert!(!state.exhausted());
    }

    #[test]
    fn a_new_code_replaces_the_old_one_and_resets_attempts() {
        let mut state = PairingState::default();
        state.start("111111".into(), at(0));
        assert_eq!(state.verify("000000", at(1)), Err(PairReject::WrongCode));
        state.start("222222".into(), at(2));
        assert_eq!(state.verify("111111", at(3)), Err(PairReject::WrongCode));
        assert_eq!(state.verify("222222", at(4)), Ok(()));
    }

    #[test]
    fn every_extension_message_round_trips_and_rejects_unknown_fields() {
        let browser = r#"{"name":"Chrome","version":"130"}"#;
        let frames = [
            format!(r#"{{"v":1,"type":"pair","code":"123456","browser":{browser},"extensionVersion":"0.1.0"}}"#),
            format!(r#"{{"v":1,"type":"hello","token":"t","browser":{browser},"extensionVersion":"0.1.0"}}"#),
            r#"{"v":1,"type":"ping"}"#.to_owned(),
            r#"{"v":1,"type":"hitTestResult","id":"a","status":"ok","tab":{"url":"http://x","title":"X"},"elements":[{"key":"k","label":"button","rect":{"x":1,"y":2,"width":3,"height":4}}]}"#.to_owned(),
            r#"{"v":1,"type":"hitTestResult","id":"a","status":"no-tab","elements":[]}"#.to_owned(),
            r#"{"v":1,"type":"inspectResult","id":"a","status":"mismatch","elements":[]}"#.to_owned(),
            r#"{"v":1,"type":"findSensitiveResult","id":"a","status":"ok","matches":[{"kind":"password","preview":"****","rects":[{"x":1,"y":2,"width":3,"height":4}]}]}"#.to_owned(),
        ];
        for raw in &frames {
            assert!(parse_incoming(raw).is_some(), "{raw}");
            let polluted = raw.replacen('{', r#"{"extra":1,"#, 1);
            assert!(parse_incoming(&polluted).is_none(), "{polluted}");
        }
    }

    #[test]
    fn inspect_result_round_trips_element_details() {
        let raw = r##"{"v":1,"type":"inspectResult","id":"a","status":"ok","cssViewport":{"width":1440,"height":900,"devicePixelRatio":2},"elements":[{"label":"Button","tag":"button","role":"button","accessibleName":"Go","text":"Go","selector":"button","component":{"name":"Cta","ownerPath":["App"]},"source":{"file":"src/a.tsx","line":4,"column":7},"classes":"x","styles":{"color":"#fff","backgroundColor":"#000","fontFamily":"Inter","fontSize":"16px","fontWeight":"600","lineHeight":"24px","padding":"1px","margin":"0","borderRadius":"8px","boxShadow":"none","display":"block","gap":"normal"},"cssRect":{"x":1,"y":2,"width":3,"height":4},"rect":{"x":2,"y":4,"width":6,"height":8}}]}"##;
        let Some(Incoming::InspectResult {
            elements,
            css_viewport,
            ..
        }) = parse_incoming(raw)
        else {
            panic!("did not parse");
        };
        assert_eq!(elements.len(), 1);
        assert_eq!(elements[0].source.as_ref().unwrap().line, 4);
        assert_eq!(css_viewport.unwrap().device_pixel_ratio, 2.0);
        let again = serde_json::to_string(&elements[0]).unwrap();
        assert!(again.contains("\"accessibleName\":\"Go\""));
        assert!(!again.contains("sourceUnavailableReason"));
    }

    #[test]
    fn wrong_versions_and_oversize_frames_are_rejected() {
        assert!(parse_incoming(r#"{"v":2,"type":"ping"}"#).is_none());
        assert!(parse_incoming("not json").is_none());
        let padding = " ".repeat(MAX_FRAME_BYTES);
        assert!(parse_incoming(&format!(r#"{{"v":1,"type":"ping"}}{padding}"#)).is_none());
    }

    #[test]
    fn outgoing_messages_use_the_wire_names() {
        let request = frame(&Outgoing::HitTest {
            v: 1,
            id: "id",
            window_title: "T".into(),
            viewport: Rect {
                x: 1.0,
                y: 2.0,
                width: 3.0,
                height: 4.0,
            },
            point: Point { x: 5.0, y: 6.0 },
        });
        assert_eq!(
            request,
            r#"{"type":"hitTest","v":1,"id":"id","windowTitle":"T","viewport":{"x":1.0,"y":2.0,"width":3.0,"height":4.0},"point":{"x":5.0,"y":6.0}}"#
        );
        let rejected = frame(&Outgoing::PairRejected {
            v: 1,
            reason: PairReject::TooManyAttempts,
        });
        assert_eq!(
            rejected,
            r#"{"type":"pairRejected","v":1,"reason":"too-many-attempts"}"#
        );
    }

    // ---- service tests over a real localhost socket ------------------------------------------

    type Client = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<TcpStream>>;

    fn temp_config(name: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!("capkit-link-{name}-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        directory.join("browser-link.json")
    }

    fn service(path: PathBuf) -> BrowserLinkService {
        // Port 0 binds an ephemeral port so tests never collide with a running CapKit.
        BrowserLinkService::with_parts(path, vec![0], Arc::new(|_| {}))
    }

    async fn connect(
        port: u16,
        origin: &str,
    ) -> Result<Client, tokio_tungstenite::tungstenite::Error> {
        let mut request = format!("ws://127.0.0.1:{port}")
            .into_client_request()
            .unwrap();
        request
            .headers_mut()
            .insert("origin", HeaderValue::from_str(origin).unwrap());
        tokio_tungstenite::connect_async(request)
            .await
            .map(|(socket, _)| socket)
    }

    async fn next_text(socket: &mut Client) -> String {
        loop {
            match timeout(Duration::from_secs(5), socket.next())
                .await
                .unwrap()
            {
                Some(Ok(Message::Text(text))) => return text.to_string(),
                Some(Ok(Message::Close(_))) | None => return "closed".into(),
                Some(Ok(_)) => {}
                Some(Err(_)) => return "error".into(),
            }
        }
    }

    const PAIR_BROWSER: &str = r#"{"name":"Chrome","version":"130"}"#;

    fn pair_frame(code: &str) -> String {
        format!(
            r#"{{"v":1,"type":"pair","code":"{code}","browser":{PAIR_BROWSER},"extensionVersion":"0.1.0"}}"#
        )
    }

    fn hello_frame(token: &str) -> String {
        format!(
            r#"{{"v":1,"type":"hello","token":"{token}","browser":{PAIR_BROWSER},"extensionVersion":"0.1.0"}}"#
        )
    }

    fn token_from(text: &str) -> String {
        serde_json::from_str::<serde_json::Value>(text).unwrap()["token"]
            .as_str()
            .unwrap()
            .to_owned()
    }

    #[test]
    fn no_socket_is_bound_while_developer_tools_is_off() {
        let service = service(temp_config("off"));
        let status = service.status();
        assert!(!status.enabled);
        assert_eq!(status.state, "off");
        assert_eq!(status.port, None);
        assert!(service.start_pairing().is_err());
    }

    #[test]
    fn pairing_a_browser_persists_a_token_and_hello_reuses_it() {
        let path = temp_config("pair");
        let link = service(path.clone());
        link.set_enabled(true).unwrap();
        let port = link.status().port.unwrap();
        let code = link.start_pairing().unwrap().code;

        let token = tauri::async_runtime::block_on(async {
            let mut socket = connect(port, EXTENSION_ORIGIN).await.unwrap();
            socket.send(Message::text(pair_frame(&code))).await.unwrap();
            let reply = next_text(&mut socket).await;
            assert!(reply.contains(r#""type":"paired""#), "{reply}");
            token_from(&reply)
        });
        assert_eq!(token.len(), 43);

        let saved = std::fs::read_to_string(&path).unwrap();
        assert!(saved.contains(&token));
        // Status shown in Settings carries no secrets.
        let status = serde_json::to_string(&link.status()).unwrap();
        assert!(!status.contains(&token));
        assert_eq!(link.status().paired.len(), 1);

        tauri::async_runtime::block_on(async {
            let mut socket = connect(port, EXTENSION_ORIGIN).await.unwrap();
            socket
                .send(Message::text(hello_frame(&token)))
                .await
                .unwrap();
            assert!(next_text(&mut socket).await.contains(r#""type":"ready""#));
            socket
                .send(Message::text(r#"{"v":1,"type":"ping"}"#))
                .await
                .unwrap();
            assert!(next_text(&mut socket).await.contains(r#""type":"pong""#));
            assert!(link.is_connected());

            let mut other = connect(port, "chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba")
                .await
                .unwrap();
            other
                .send(Message::text(hello_frame(&token)))
                .await
                .unwrap();
            assert!(next_text(&mut other).await.contains("helloRejected"));
        });
    }

    #[test]
    fn the_accent_reaches_the_extension_on_connect_and_on_change() {
        let link = service(temp_config("accent"));
        link.set_enabled(true).unwrap();
        let port = link.status().port.unwrap();
        let code = link.start_pairing().unwrap().code;
        link.set_accent("not a colour");
        link.set_accent("#39ff88");

        tauri::async_runtime::block_on(async {
            let mut socket = connect(port, EXTENSION_ORIGIN).await.unwrap();
            socket.send(Message::text(pair_frame(&code))).await.unwrap();
            let token = token_from(&next_text(&mut socket).await);
            let mut socket = connect(port, EXTENSION_ORIGIN).await.unwrap();
            socket
                .send(Message::text(hello_frame(&token)))
                .await
                .unwrap();
            let ready = next_text(&mut socket).await;
            assert!(ready.contains(r##""accent":"#39ff88""##), "{ready}");

            link.set_accent("#7c5cff");
            let theme = next_text(&mut socket).await;
            assert!(
                theme.contains(r##""type":"theme","v":1,"accent":"#7c5cff""##),
                "{theme}"
            );
        });
    }

    #[test]
    fn a_web_origin_never_upgrades() {
        let link = service(temp_config("web"));
        link.set_enabled(true).unwrap();
        let port = link.status().port.unwrap();
        tauri::async_runtime::block_on(async {
            assert!(connect(port, "https://evil.example").await.is_err());
        });
    }

    #[test]
    fn an_unauthenticated_socket_cannot_send_requests_or_pings() {
        let link = service(temp_config("unauth"));
        link.set_enabled(true).unwrap();
        let port = link.status().port.unwrap();
        tauri::async_runtime::block_on(async {
            let mut socket = connect(port, EXTENSION_ORIGIN).await.unwrap();
            socket
                .send(Message::text(r#"{"v":1,"type":"ping"}"#))
                .await
                .unwrap();
            assert_eq!(next_text(&mut socket).await, "closed");
        });
    }

    #[test]
    fn an_oversize_frame_closes_the_socket() {
        let link = service(temp_config("big"));
        link.set_enabled(true).unwrap();
        let port = link.status().port.unwrap();
        tauri::async_runtime::block_on(async {
            let mut socket = connect(port, EXTENSION_ORIGIN).await.unwrap();
            let big = format!(
                r#"{{"v":1,"type":"ping","pad":"{}"}}"#,
                "x".repeat(MAX_FRAME_BYTES)
            );
            let _ = socket.send(Message::text(big)).await;
            assert_ne!(next_text(&mut socket).await, "pong");
        });
    }

    #[test]
    fn forgetting_a_browser_closes_its_sockets_and_removes_the_pairing() {
        let link = service(temp_config("forget"));
        link.set_enabled(true).unwrap();
        let port = link.status().port.unwrap();
        let code = link.start_pairing().unwrap().code;
        tauri::async_runtime::block_on(async {
            let mut socket = connect(port, EXTENSION_ORIGIN).await.unwrap();
            socket.send(Message::text(pair_frame(&code))).await.unwrap();
            assert!(next_text(&mut socket).await.contains("paired"));
            link.forget(EXTENSION_ORIGIN).unwrap();
            assert_eq!(next_text(&mut socket).await, "closed");
        });
        assert!(link.status().paired.is_empty());
    }

    #[test]
    fn turning_the_switch_off_closes_sockets_and_unbinds_the_port() {
        let link = service(temp_config("disable"));
        link.set_enabled(true).unwrap();
        let port = link.status().port.unwrap();
        tauri::async_runtime::block_on(async {
            let mut socket = connect(port, EXTENSION_ORIGIN).await.unwrap();
            link.set_enabled(false).unwrap();
            assert_eq!(next_text(&mut socket).await, "closed");
        });
        assert_eq!(link.status().state, "off");
        assert_eq!(link.status().port, None);
        assert!(!link.is_connected());
    }

    #[test]
    fn requests_reach_the_extension_and_the_first_ok_reply_wins() {
        let link = service(temp_config("request"));
        link.set_enabled(true).unwrap();
        let port = link.status().port.unwrap();
        let code = link.start_pairing().unwrap().code;
        let viewport = WebViewport {
            window_id: 1,
            window_title: "Page - Chrome".into(),
            viewport: Rect {
                x: 100.0,
                y: 200.0,
                width: 800.0,
                height: 600.0,
            },
        };

        let answers = tauri::async_runtime::spawn(async move {
            let mut socket = connect(port, EXTENSION_ORIGIN).await.unwrap();
            socket.send(Message::text(pair_frame(&code))).await.unwrap();
            let _ = next_text(&mut socket).await;
            let request = next_text(&mut socket).await;
            let value: serde_json::Value = serde_json::from_str(&request).unwrap();
            assert_eq!(value["type"], "hitTest");
            assert_eq!(value["point"]["x"], 20.0);
            assert_eq!(value["point"]["y"], 30.0);
            let id = value["id"].as_str().unwrap();
            // A reply with a wrong id is dropped; the right one is delivered.
            socket
                .send(Message::text(
                    r#"{"v":1,"type":"hitTestResult","id":"stale","status":"ok","elements":[]}"#,
                ))
                .await
                .unwrap();
            socket
                .send(Message::text(format!(
                    r#"{{"v":1,"type":"hitTestResult","id":"{id}","status":"ok","elements":[{{"key":"k1","label":"button","rect":{{"x":10,"y":20,"width":30,"height":40}}}}]}}"#
                )))
                .await
                .unwrap();
            socket
        });

        while !link.is_connected() {
            std::thread::sleep(Duration::from_millis(10));
        }
        let targets = link
            .element_at(&viewport, Point { x: 120.0, y: 230.0 })
            .expect("targets");
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].id, "ext-k1");
        assert_eq!(targets[0].kind, "ui-region");
        assert_eq!(
            targets[0].bounds,
            Rect {
                x: 110.0,
                y: 220.0,
                width: 30.0,
                height: 40.0
            }
        );
        let _keep_alive = tauri::async_runtime::block_on(answers).unwrap();
    }

    #[test]
    fn a_request_with_no_browser_returns_none_without_waiting() {
        let link = service(temp_config("none"));
        link.set_enabled(true).unwrap();
        let viewport = WebViewport {
            window_id: 1,
            window_title: "x".into(),
            viewport: Rect {
                x: 0.0,
                y: 0.0,
                width: 10.0,
                height: 10.0,
            },
        };
        let started = std::time::Instant::now();
        assert!(
            link.element_at(&viewport, Point { x: 1.0, y: 1.0 })
                .is_none()
        );
        assert!(started.elapsed() < Duration::from_millis(100));
    }

    #[test]
    fn a_corrupt_config_is_quarantined_and_starts_disabled() {
        let path = temp_config("corrupt");
        std::fs::write(&path, "{ not json").unwrap();
        let link = service(path.clone());
        assert!(!link.status().enabled);
        assert!(link.status().paired.is_empty());
        assert!(!path.exists());
        assert!(path.with_extension("json.bad").exists());
    }

    #[test]
    fn busy_ports_surface_an_error_state() {
        let blocker = StdListener::bind("127.0.0.1:0").unwrap();
        let busy = blocker.local_addr().unwrap().port();
        let link =
            BrowserLinkService::with_parts(temp_config("busy"), vec![busy], Arc::new(|_| {}));
        link.set_enabled(true).unwrap();
        let status = link.status();
        assert_eq!(status.state, "error");
        assert!(status.error.unwrap().contains("are in use"));
    }
}
