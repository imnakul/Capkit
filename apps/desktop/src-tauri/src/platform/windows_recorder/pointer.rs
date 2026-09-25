use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use windows::Win32::Foundation::POINT;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CURSORINFO, GetCursorInfo, HCURSOR, IDC_APPSTARTING, IDC_ARROW, IDC_CROSS, IDC_HAND, IDC_IBEAM,
    IDC_NO, IDC_SIZEALL, IDC_SIZENESW, IDC_SIZENS, IDC_SIZENWSE, IDC_SIZEWE, IDC_WAIT, LoadCursorW,
};

use crate::domain::{CursorEventDto, CursorShapeSpanDto, CursorTrackDto, Rect};
use crate::error::SnaphubError;

/// Sampling rate. Fine enough to reconstruct motion and catch any real click,
/// and cheap enough to disappear into the noise floor: each tick is two reads
/// and a push, well under 0.05% of one core.
const SAMPLE_HZ: u64 = 250;

/// Buttons tracked, in the order they are reported.
const BUTTONS: [(i32, &str); 3] = [
    (VK_LBUTTON.0 as i32, "left"),
    (VK_RBUTTON.0 as i32, "right"),
    (VK_MBUTTON.0 as i32, "middle"),
];

#[derive(Default)]
struct Samples {
    times: Vec<f64>,
    xs: Vec<f32>,
    ys: Vec<f32>,
    events: Vec<CursorEventDto>,
    shapes: Vec<CursorShapeSpanDto>,
}

/// Records where the cursor went and what it clicked, alongside the video.
///
/// This data cannot be reconstructed after the fact, which is why it is
/// captured even when the editor features that consume it are not in use: the
/// hardware cursor is excluded from the video precisely so the editor can draw
/// a smoothed one later.
pub struct PointerSampler {
    running: Arc<AtomicBool>,
    samples: Arc<Mutex<Samples>>,
    handle: Option<JoinHandle<()>>,
    display_bounds: Rect,
    scale_factor: f64,
}

/// Resolves the standard cursor handles once so each tick is a pointer compare.
fn standard_shapes() -> Vec<(isize, &'static str)> {
    let ids = [
        (IDC_ARROW, "default"),
        (IDC_IBEAM, "text"),
        (IDC_HAND, "pointer"),
        (IDC_CROSS, "crosshair"),
        (IDC_WAIT, "wait"),
        (IDC_APPSTARTING, "progress"),
        (IDC_NO, "not-allowed"),
        (IDC_SIZEALL, "move"),
        (IDC_SIZENS, "ns-resize"),
        (IDC_SIZEWE, "ew-resize"),
        (IDC_SIZENWSE, "nwse-resize"),
        (IDC_SIZENESW, "nesw-resize"),
    ];
    ids.iter()
        .filter_map(|(id, name)| {
            // SAFETY: `id` is a predefined system cursor identifier; the returned
            // handle is owned by the system and must not be destroyed.
            unsafe { LoadCursorW(None, *id) }
                .ok()
                .map(|cursor| (cursor.0 as isize, *name))
        })
        .collect()
}

fn current_shape(known: &[(isize, &'static str)]) -> &'static str {
    let mut info = CURSORINFO {
        cbSize: u32::try_from(size_of::<CURSORINFO>()).unwrap_or(0),
        ..Default::default()
    };
    // SAFETY: `info` is fully initialised with its size field set, as required.
    if unsafe { GetCursorInfo(&mut info) }.is_err() {
        return "default";
    }
    let handle: HCURSOR = info.hCursor;
    let raw = handle.0 as isize;
    known
        .iter()
        .find(|(candidate, _)| *candidate == raw)
        .map(|(_, name)| *name)
        .unwrap_or("custom")
}

fn cursor_position() -> Option<POINT> {
    let mut point = POINT::default();
    // SAFETY: `point` is an owned local.
    unsafe { windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut point) }
        .ok()
        .map(|()| point)
}

/// True while the button is physically down.
///
/// This polls rather than installing `WH_MOUSE_LL`: a low-level mouse hook runs
/// inside every process's input path and Windows silently unhooks it on
/// timeout, which is the usual reason a recorder makes the pointer feel laggy.
/// At 250 Hz no real click is short enough to be missed.
fn button_down(vk: i32) -> bool {
    // SAFETY: GetAsyncKeyState only reads global input state.
    (unsafe { GetAsyncKeyState(vk) } as u16 & 0x8000) != 0
}

impl PointerSampler {
    pub fn start(display_bounds: Rect, scale_factor: f64) -> Self {
        let running = Arc::new(AtomicBool::new(true));
        let samples = Arc::new(Mutex::new(Samples::default()));

        let thread_running = Arc::clone(&running);
        let thread_samples = Arc::clone(&samples);
        let origin_x = display_bounds.x;
        let origin_y = display_bounds.y;

        let handle = thread::spawn(move || {
            let known = standard_shapes();
            let interval = Duration::from_nanos(1_000_000_000 / SAMPLE_HZ);
            let started = std::time::Instant::now();
            let mut pressed = [false; BUTTONS.len()];
            let mut last_shape = "";

            while thread_running.load(Ordering::Relaxed) {
                let elapsed = started.elapsed().as_secs_f64();
                if let Some(point) = cursor_position() {
                    let x = (f64::from(point.x) - origin_x) as f32;
                    let y = (f64::from(point.y) - origin_y) as f32;
                    let shape = current_shape(&known);

                    if let Ok(mut buffer) = thread_samples.lock() {
                        buffer.times.push(elapsed);
                        buffer.xs.push(x);
                        buffer.ys.push(y);
                        if shape != last_shape {
                            buffer.shapes.push(CursorShapeSpanDto {
                                time: elapsed,
                                shape,
                            });
                            last_shape = shape;
                        }
                        for (index, (vk, name)) in BUTTONS.iter().enumerate() {
                            let down = button_down(*vk);
                            if down != pressed[index] {
                                pressed[index] = down;
                                buffer.events.push(CursorEventDto {
                                    time: elapsed,
                                    kind: if down { "down" } else { "up" },
                                    button: name,
                                    x,
                                    y,
                                });
                            }
                        }
                    }
                }
                thread::sleep(interval);
            }
        });

        Self {
            running,
            samples,
            handle: Some(handle),
            display_bounds,
            scale_factor,
        }
    }

    /// Stops sampling and returns the track. Everything is written once, here,
    /// so nothing touches the filesystem on the sampling path.
    pub fn finish(mut self) -> Result<CursorTrackDto, SnaphubError> {
        self.running.store(false, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
        let samples = self
            .samples
            .lock()
            .map_err(|_| SnaphubError::Record("Cursor samples were poisoned".into()))?;
        Ok(CursorTrackDto {
            version: 1,
            times: samples.times.clone(),
            xs: samples.xs.clone(),
            ys: samples.ys.clone(),
            events: samples.events.clone(),
            shapes: samples.shapes.clone(),
            display_bounds: self.display_bounds,
            scale_factor: self.scale_factor,
        })
    }
}

impl Drop for PointerSampler {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}
