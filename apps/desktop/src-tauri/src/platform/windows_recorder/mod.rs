pub mod audio;
pub mod encoder;
pub mod pointer;
pub mod wgc;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use windows::Win32::Foundation::POINT;
use windows::Win32::Graphics::Gdi::{HMONITOR, MONITOR_DEFAULTTOPRIMARY, MonitorFromPoint};

use image::{DynamicImage, RgbaImage};

use crate::domain::{
    AudioDeviceDto, RecordingArtifactsDto, RecordingRequestDto, RecordingSourceDto,
    RecordingStatsDto, Rect,
};
use crate::error::SnaphubError;
use crate::platform::{
    AudioDeviceBackend, RecordingSession, ScreenRecordingBackend, WindowCaptureExclusionBackend,
    windows_display::WindowsDisplayBackend,
};

use audio::{AudioSource, AudioTrack};
use encoder::VideoEncoder;
use pointer::PointerSampler;
use wgc::CaptureStream;

/// Screen recording on Windows, built on Windows Graphics Capture and the
/// Media Foundation sink writer.
///
/// Both are part of the operating system, so recording costs roughly a
/// megabyte of binding code rather than the tens of megabytes a bundled
/// encoder would add to the installer.
pub struct WindowsRecorderBackend {
    exclusion: WindowsDisplayBackend,
}

impl Default for WindowsRecorderBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl WindowsRecorderBackend {
    pub fn new() -> Self {
        Self {
            exclusion: WindowsDisplayBackend,
        }
    }
}

/// Where one-off source-picker previews are cached for this run.
///
/// These are throwaway: regenerated every time the picker opens, so they live
/// beside the recordings themselves rather than anywhere durable.
fn thumbnails_root() -> PathBuf {
    std::env::temp_dir()
        .join("CapKit")
        .join("recorder-thumbnails")
}

/// Captures one frame of `image` and writes a small preview to disk.
///
/// Best-effort: a source the user cannot preview (a protected window, a
/// display that failed to capture) is still worth listing and picking by
/// name, so failures here return `None` rather than dropping the source.
fn save_thumbnail(id: &str, image: RgbaImage) -> Option<String> {
    let directory = thumbnails_root();
    std::fs::create_dir_all(&directory).ok()?;
    // The id already encodes kind and a stable native handle/serial, so it
    // doubles as a cache key: the same source overwrites its old preview
    // instead of accumulating one file per capture.
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    std::hash::Hash::hash(id, &mut hasher);
    let path = directory.join(format!("{:016x}.png", std::hash::Hasher::finish(&hasher)));
    DynamicImage::ImageRgba8(image)
        .thumbnail(240, 150)
        .save_with_format(&path, image::ImageFormat::Png)
        .ok()?;
    Some(path.to_string_lossy().into_owned())
}

/// Resolves a display id back to its monitor handle and physical bounds.
fn find_monitor(display_id: &str) -> Result<(HMONITOR, Rect, f64), SnaphubError> {
    let monitors = xcap::Monitor::all().map_err(SnaphubError::record)?;
    let monitor = monitors
        .iter()
        .find(|candidate| {
            candidate
                .id()
                .map(|id| id.to_string() == display_id)
                .unwrap_or(false)
        })
        .or_else(|| monitors.first())
        .ok_or_else(|| SnaphubError::Record("No display available to record".into()))?;

    let x = monitor.x().map_err(SnaphubError::record)?;
    let y = monitor.y().map_err(SnaphubError::record)?;
    let width = monitor.width().map_err(SnaphubError::record)?;
    let height = monitor.height().map_err(SnaphubError::record)?;
    let scale = monitor.scale_factor().map_err(SnaphubError::record)?;

    // `MonitorFromPoint` on the display's own centre is the cheapest way back to
    // an HMONITOR without duplicating xcap's enumeration in raw Win32.
    let centre = POINT {
        x: x + (width as i32) / 2,
        y: y + (height as i32) / 2,
    };
    // SAFETY: `centre` is an owned local and the flag is a documented constant.
    let handle = unsafe { MonitorFromPoint(centre, MONITOR_DEFAULTTOPRIMARY) };

    Ok((
        handle,
        Rect {
            x: f64::from(x),
            y: f64::from(y),
            width: f64::from(width),
            height: f64::from(height),
        },
        f64::from(scale),
    ))
}

/// The desktop area the video actually covers, in physical px.
///
/// Without a region it is the whole display; otherwise the display-local
/// region's desktop origin with the video's width and height, so cursor
/// samples line up with the cropped frames.
fn recorded_area(display: Rect, region: Option<&Rect>, width: u32, height: u32) -> Rect {
    match region {
        None => display,
        Some(region) => Rect {
            x: display.x + region.x,
            y: display.y + region.y,
            width: f64::from(width),
            height: f64::from(height),
        },
    }
}

#[cfg(test)]
mod recorded_area_tests {
    use super::recorded_area;
    use crate::domain::Rect;

    fn rect(x: f64, y: f64, width: f64, height: f64) -> Rect {
        Rect {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn no_region_covers_the_whole_display() {
        assert_eq!(
            recorded_area(rect(0.0, 0.0, 1920.0, 1080.0), None, 1920, 1080),
            rect(0.0, 0.0, 1920.0, 1080.0)
        );
    }

    #[test]
    fn a_region_offsets_by_the_display_origin() {
        assert_eq!(
            recorded_area(
                rect(0.0, 0.0, 1920.0, 1080.0),
                Some(&rect(100.0, 100.0, 640.0, 360.0)),
                640,
                360
            ),
            rect(100.0, 100.0, 640.0, 360.0)
        );
    }

    #[test]
    fn a_negative_origin_display_stays_negative() {
        assert_eq!(
            recorded_area(
                rect(-1920.0, 0.0, 1920.0, 1080.0),
                Some(&rect(100.0, 100.0, 200.0, 150.0)),
                200,
                150
            ),
            rect(-1820.0, 100.0, 200.0, 150.0)
        );
    }
}

impl ScreenRecordingBackend for WindowsRecorderBackend {
    fn is_supported(&self) -> bool {
        wgc::is_supported()
    }

    fn sources(&self) -> Result<Vec<RecordingSourceDto>, SnaphubError> {
        let mut sources = Vec::new();

        for monitor in xcap::Monitor::all().map_err(SnaphubError::record)? {
            let (Ok(id), Ok(x), Ok(y), Ok(width), Ok(height)) = (
                monitor.id(),
                monitor.x(),
                monitor.y(),
                monitor.width(),
                monitor.height(),
            ) else {
                continue;
            };
            let display_id = id.to_string();
            let source_id = format!("display:{display_id}");
            let thumbnail_path = monitor
                .capture_image()
                .ok()
                .and_then(|image| save_thumbnail(&source_id, image));
            sources.push(RecordingSourceDto {
                title: monitor
                    .name()
                    .unwrap_or_else(|_| format!("Display {display_id}")),
                id: source_id,
                kind: "display",
                bounds: Rect {
                    x: f64::from(x),
                    y: f64::from(y),
                    width: f64::from(width),
                    height: f64::from(height),
                },
                display_id,
                scale_factor: f64::from(monitor.scale_factor().unwrap_or(1.0)),
                is_primary: monitor.is_primary().unwrap_or(false),
                thumbnail_path,
            });
        }

        // Windows are recorded as a crop of their display, so each one carries
        // the display it currently sits on.
        for window in xcap::Window::all().map_err(SnaphubError::record)? {
            if window.is_minimized().unwrap_or(true) {
                continue;
            }
            let Ok(title) = window.title() else { continue };
            if title.is_empty() || title.starts_with("CapKit") {
                continue;
            }
            let (Ok(id), Ok(x), Ok(y), Ok(width), Ok(height)) = (
                window.id(),
                window.x(),
                window.y(),
                window.width(),
                window.height(),
            ) else {
                continue;
            };
            if width < 2 || height < 2 {
                continue;
            }
            let Ok(monitor) = window.current_monitor() else {
                continue;
            };
            let display_id = monitor
                .id()
                .map(|value| value.to_string())
                .unwrap_or_default();
            let source_id = format!("window:{id}");
            let thumbnail_path = window
                .capture_image()
                .ok()
                .and_then(|image| save_thumbnail(&source_id, image));
            sources.push(RecordingSourceDto {
                id: source_id,
                kind: "window",
                title,
                bounds: Rect {
                    x: f64::from(x),
                    y: f64::from(y),
                    width: f64::from(width),
                    height: f64::from(height),
                },
                display_id,
                scale_factor: f64::from(monitor.scale_factor().unwrap_or(1.0)),
                is_primary: false,
                thumbnail_path,
            });
        }

        Ok(sources)
    }

    fn start(
        &self,
        request: &RecordingRequestDto,
        directory: &Path,
    ) -> Result<(Box<dyn RecordingSession>, Vec<&'static str>), SnaphubError> {
        let (session, audio_failures) = WindowsRecordingSession::start(request, directory)?;
        Ok((Box::new(session), audio_failures))
    }
}

impl AudioDeviceBackend for WindowsRecorderBackend {
    fn capture_devices(&self) -> Result<Vec<AudioDeviceDto>, SnaphubError> {
        audio::capture_devices()
    }
}

impl WindowCaptureExclusionBackend for WindowsRecorderBackend {
    fn set_excluded(&self, hwnd: isize, excluded: bool) -> Result<(), SnaphubError> {
        self.exclusion.set_excluded(hwnd, excluded)
    }
}

/// Counters shared between the encoder thread and the status command.
#[derive(Default)]
struct Counters {
    encoded: AtomicU64,
    dropped: AtomicU64,
}

struct EncoderOutcome {
    frames: u64,
    duration_seconds: f64,
}

pub struct WindowsRecordingSession {
    id: String,
    directory: PathBuf,
    video_path: PathBuf,
    width: u32,
    height: u32,
    fps: u32,
    started: Instant,
    running: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    counters: Arc<Counters>,
    worker: Option<JoinHandle<Result<EncoderOutcome, SnaphubError>>>,
    outcome: Arc<Mutex<Option<EncoderOutcome>>>,
    pointer: Option<PointerSampler>,
    system_audio: Option<AudioTrack>,
    microphone: Option<AudioTrack>,
}

impl WindowsRecordingSession {
    fn start(
        request: &RecordingRequestDto,
        directory: &Path,
    ) -> Result<(Self, Vec<&'static str>), SnaphubError> {
        std::fs::create_dir_all(directory).map_err(SnaphubError::record)?;
        encoder::startup()?;

        let (monitor, bounds, scale) = find_monitor(&request.display_id)?;

        // The request carries desktop coordinates; the frame pool works in
        // display-local pixels.
        let region = request.region.map(|region| {
            (
                (region.x - bounds.x).max(0.0) as u32,
                (region.y - bounds.y).max(0.0) as u32,
                region.width.max(2.0) as u32,
                region.height.max(2.0) as u32,
            )
        });

        let fps = request.fps.clamp(10, 120);
        let id = uuid::Uuid::new_v4().to_string();
        let video_path = directory.join("video.mp4");

        let stream = CaptureStream::start(monitor, region, request.capture_cursor)?;
        let width = stream.width;
        let height = stream.height;
        // The request region is in desktop coordinates; the area is computed
        // from its display-local form, matching the frame pool above.
        let local = request.region.map(|region| Rect {
            x: (region.x - bounds.x).max(0.0),
            y: (region.y - bounds.y).max(0.0),
            width: region.width,
            height: region.height,
        });
        let area = recorded_area(bounds, local.as_ref(), width, height);
        let mut video = VideoEncoder::new(&video_path, stream.device(), width, height, fps)?;

        let running = Arc::new(AtomicBool::new(true));
        let paused = Arc::new(AtomicBool::new(false));
        let counters = Arc::new(Counters::default());
        let outcome = Arc::new(Mutex::new(None));

        let thread_running = Arc::clone(&running);
        let thread_paused = Arc::clone(&paused);
        let thread_counters = Arc::clone(&counters);
        let thread_outcome = Arc::clone(&outcome);

        let worker = thread::spawn(move || {
            // A fixed-rate pacer rather than an arrival-driven loop: the frame
            // pool only delivers when the screen changes, so a static desktop
            // would otherwise produce a file with no frames in it.
            let interval = Duration::from_nanos(1_000_000_000 / u64::from(fps));
            let start = Instant::now();
            let mut index: u64 = 0;
            let mut result = Ok(());

            while thread_running.load(Ordering::Relaxed) {
                let target = start + interval * u32::try_from(index).unwrap_or(u32::MAX);
                let now = Instant::now();
                if target > now {
                    thread::sleep(target - now);
                }
                index += 1;

                // While paused the pacer keeps its schedule but writes nothing,
                // so paused time simply does not exist in the output rather than
                // appearing as a frozen stretch.
                if thread_paused.load(Ordering::Relaxed) {
                    continue;
                }

                match stream.take_frame() {
                    Ok(fresh) => {
                        if !fresh {
                            // Nothing new arrived, so the previous contents of the
                            // staging texture are re-encoded to hold the frame rate.
                            thread_counters.dropped.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                    Err(error) => {
                        result = Err(error);
                        break;
                    }
                }

                if let Err(error) = video.write_frame(stream.staging()) {
                    result = Err(error);
                    break;
                }
                thread_counters.encoded.fetch_add(1, Ordering::Relaxed);
            }

            stream.stop();
            let frames = video.frames();
            let duration_seconds = video.duration_seconds();
            // The pacer's own error is the useful one; finalizing an empty sink
            // reports a downstream symptom that would mask it.
            result?;
            video.finish()?;

            let finished = EncoderOutcome {
                frames,
                duration_seconds,
            };
            if let Ok(mut slot) = thread_outcome.lock() {
                *slot = Some(EncoderOutcome {
                    frames,
                    duration_seconds,
                });
            }
            Ok(finished)
        });

        // The cursor track is recorded unconditionally: it cannot be
        // reconstructed later, and the smooth-cursor and zoom-on-click features
        // are worthless without it. The sampler works in the recorded area's
        // coordinates, so crops line up with the video.
        let pointer = Some(PointerSampler::start(area, scale));

        let mut audio_failures = Vec::new();
        let system_audio = if request.system_audio {
            let source = AudioSource::System(request.system_audio_device_id.clone());
            if audio::probe_source(&source).is_err() {
                audio_failures.push(source.kind());
                None
            } else {
                AudioTrack::start(source, directory.join("audio-system.m4a")).ok()
            }
        } else {
            None
        };
        let microphone = if request.microphone {
            let source = AudioSource::Microphone(request.microphone_device_id.clone());
            if audio::probe_source(&source).is_err() {
                audio_failures.push(source.kind());
                None
            } else {
                AudioTrack::start(source, directory.join("audio-mic.m4a")).ok()
            }
        } else {
            None
        };

        Ok((
            Self {
                id,
                directory: directory.to_path_buf(),
                video_path,
                width,
                height,
                fps,
                started: Instant::now(),
                running,
                paused,
                counters,
                worker: Some(worker),
                outcome,
                pointer,
                system_audio,
                microphone,
            },
            audio_failures,
        ))
    }

    fn write_cursor_track(&mut self) -> Option<PathBuf> {
        let sampler = self.pointer.take()?;
        let track = sampler.finish().ok()?;
        let path = self.directory.join("cursor.json");
        let json = serde_json::to_vec(&track).ok()?;
        std::fs::write(&path, json).ok()?;
        Some(path)
    }
}

impl RecordingSession for WindowsRecordingSession {
    fn set_paused(&self, paused: bool) {
        self.paused.store(paused, Ordering::Relaxed);
    }

    fn is_paused(&self) -> bool {
        self.paused.load(Ordering::Relaxed)
    }

    fn stats(&self) -> RecordingStatsDto {
        let bytes = std::fs::metadata(&self.video_path)
            .map(|meta| meta.len())
            .unwrap_or(0);
        RecordingStatsDto {
            paused: self.paused.load(Ordering::Relaxed),
            elapsed_seconds: self.started.elapsed().as_secs_f64(),
            encoded_frames: self.counters.encoded.load(Ordering::Relaxed),
            dropped_frames: self.counters.dropped.load(Ordering::Relaxed),
            bytes_written: bytes,
        }
    }

    fn stop(mut self: Box<Self>) -> Result<RecordingArtifactsDto, SnaphubError> {
        let stats = self.stats();
        self.running.store(false, Ordering::Relaxed);

        let worker_result = self.worker.take().map(|handle| handle.join());
        match worker_result {
            Some(Ok(Ok(_))) | None => {}
            Some(Ok(Err(error))) => return Err(error),
            Some(Err(_)) => {
                return Err(SnaphubError::Record("The recorder thread panicked".into()));
            }
        }

        let outcome = self
            .outcome
            .lock()
            .ok()
            .and_then(|slot| {
                slot.as_ref()
                    .map(|value| (value.frames, value.duration_seconds))
            })
            .unwrap_or((stats.encoded_frames, stats.elapsed_seconds));

        let cursor_path = self.write_cursor_track();
        let system_audio_path = self.system_audio.take().and_then(AudioTrack::finish);
        let microphone_path = self.microphone.take().and_then(AudioTrack::finish);

        if outcome.0 == 0 {
            return Err(SnaphubError::Record(
                "The recording captured no frames".into(),
            ));
        }

        Ok(RecordingArtifactsDto {
            id: self.id.clone(),
            directory: self.directory.to_string_lossy().into_owned(),
            video_path: self.video_path.to_string_lossy().into_owned(),
            cursor_path: cursor_path.map(|path| path.to_string_lossy().into_owned()),
            system_audio_path: system_audio_path.map(|path| path.to_string_lossy().into_owned()),
            microphone_path: microphone_path.map(|path| path.to_string_lossy().into_owned()),
            width: self.width,
            height: self.height,
            fps: self.fps,
            duration_seconds: outcome.1,
            stats,
        })
    }

    fn cancel(mut self: Box<Self>) {
        self.running.store(false, Ordering::Relaxed);
        if let Some(handle) = self.worker.take() {
            let _ = handle.join();
        }
        self.pointer.take();
        self.system_audio.take();
        self.microphone.take();
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Records the primary display for a few seconds and checks the artefacts.
    ///
    /// Ignored by default: it needs a real desktop session with a GPU, so it is
    /// a developer smoke test rather than part of the unit suite. Run it with
    /// `cargo test -- --ignored --nocapture`.
    #[test]
    #[ignore = "requires an interactive desktop session"]
    fn records_the_primary_display_to_a_playable_file() {
        let backend = WindowsRecorderBackend::new();
        assert!(
            backend.is_supported(),
            "Windows Graphics Capture unavailable"
        );

        let sources = backend.sources().expect("sources");
        let display = sources
            .iter()
            .find(|source| source.kind == "display")
            .expect("at least one display");

        let directory = std::env::temp_dir().join("CapKit").join("record-smoke");
        let _ = std::fs::remove_dir_all(&directory);

        let request = RecordingRequestDto {
            display_id: display.display_id.clone(),
            region: None,
            fps: 30,
            capture_cursor: false,
            system_audio: false,
            microphone: false,
            microphone_device_id: None,
            system_audio_device_id: None,
        };

        let (session, _) = backend.start(&request, &directory).expect("start");
        std::thread::sleep(Duration::from_secs(4));
        let stats = session.stats();
        let artifacts = session.stop().expect("stop");

        println!(
            "encoded={} dropped={} bytes={} {}x{} {:.2}s",
            artifacts.stats.encoded_frames,
            artifacts.stats.dropped_frames,
            artifacts.stats.bytes_written,
            artifacts.width,
            artifacts.height,
            artifacts.duration_seconds
        );
        assert!(stats.elapsed_seconds > 3.0, "recording ran for long enough");

        let size = std::fs::metadata(&artifacts.video_path)
            .expect("video file exists")
            .len();
        assert!(
            size > 10_000,
            "video file has real content, was {size} bytes"
        );
        assert!(artifacts.width >= 2 && artifacts.height >= 2);
        assert!(artifacts.stats.encoded_frames > 60, "roughly 30fps for 4s");

        let cursor = artifacts.cursor_path.expect("cursor track written");
        let raw = std::fs::read_to_string(&cursor).expect("cursor readable");
        assert!(raw.contains("\"times\""), "cursor track has samples");
    }

    /// Records with system audio and checks every artefact the editor needs.
    ///
    /// Ignored by default for the same reason as the test above.
    #[test]
    #[ignore = "requires an interactive desktop session"]
    fn records_audio_and_a_usable_cursor_track() {
        let backend = WindowsRecorderBackend::new();
        let sources = backend.sources().expect("sources");
        let display = sources
            .iter()
            .find(|source| source.kind == "display")
            .expect("at least one display");

        let directory = std::env::temp_dir().join("CapKit").join("record-av");
        let _ = std::fs::remove_dir_all(&directory);

        let request = RecordingRequestDto {
            display_id: display.display_id.clone(),
            region: Some(Rect {
                x: display.bounds.x,
                y: display.bounds.y,
                width: 640.0,
                height: 480.0,
            }),
            fps: 30,
            capture_cursor: false,
            system_audio: true,
            microphone: false,
            microphone_device_id: None,
            system_audio_device_id: None,
        };

        let (session, _) = backend.start(&request, &directory).expect("start");
        std::thread::sleep(Duration::from_secs(5));
        let artifacts = session.stop().expect("stop");

        // The crop is honoured and rounded to even dimensions for the encoder.
        assert_eq!(artifacts.width, 640);
        assert_eq!(artifacts.height, 480);

        let cursor = artifacts.cursor_path.clone().expect("cursor track");
        let track: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&cursor).expect("cursor readable"))
                .expect("cursor is valid json");
        let times = track["times"].as_array().expect("times array").len();
        let xs = track["xs"].as_array().expect("xs array").len();
        println!(
            "cursor samples={times} audio={:?} shapes={}",
            artifacts.system_audio_path,
            track["shapes"].as_array().map(Vec::len).unwrap_or(0)
        );
        assert_eq!(times, xs, "parallel arrays stay the same length");
        // 250 Hz for five seconds, with generous slack for scheduling.
        assert!(times > 800, "cursor sampled at roughly 250 Hz, got {times}");
        assert!(
            track["shapes"].as_array().map(Vec::len).unwrap_or(0) > 0,
            "at least one cursor shape span"
        );

        let audio = artifacts.system_audio_path.expect("system audio recorded");
        let size = std::fs::metadata(&audio).expect("audio file exists").len();
        println!("audio bytes={size}");
        assert!(
            size > 1_000,
            "audio track has real content, was {size} bytes"
        );
    }

    /// Confirms a real window can be hidden from screen capture.
    ///
    /// This is what keeps the recorder's own dock out of the video, so a
    /// failure here is a product bug rather than a missing nicety.
    #[test]
    #[ignore = "requires an interactive desktop session"]
    fn excludes_a_window_from_capture() {
        use windows::Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DestroyWindow, WINDOW_EX_STYLE, WS_OVERLAPPEDWINDOW,
        };
        use windows::core::w;

        // SAFETY: a plain top-level window using the predefined STATIC class.
        let hwnd = unsafe {
            CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                w!("STATIC"),
                w!("CapKit exclusion probe"),
                WS_OVERLAPPEDWINDOW,
                0,
                0,
                200,
                120,
                None,
                None,
                None,
                None,
            )
        }
        .expect("probe window");

        let backend = WindowsRecorderBackend::new();
        let raw = hwnd.0 as isize;
        backend
            .set_excluded(raw, true)
            .expect("WDA_EXCLUDEFROMCAPTURE is accepted");
        backend.set_excluded(raw, false).expect("exclusion clears");

        // SAFETY: the window was created above and is not used afterwards.
        let _ = unsafe { DestroyWindow(hwnd) };
    }
}
