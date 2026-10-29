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

use crate::domain::{CursorEventDto, CursorShapeSpanDto, CursorTrackDto, KeyEventDto, Rect};
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

/// Keys are polled every fourth pointer tick (62.5 Hz). A deliberate key press
/// lasts 50 ms or more, so none is missed, and the ~90 reads per poll stay
/// a fraction of a percent of one core.
const KEY_POLL_EVERY: u64 = 4;

const VK_SHIFT_CODE: i32 = 0x10;
const VK_CONTROL_CODE: i32 = 0x11;
const VK_MENU_CODE: i32 = 0x12;
const VK_LWIN_CODE: i32 = 0x5B;
const VK_RWIN_CODE: i32 = 0x5C;

const LETTERS: [&str; 26] = [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S",
    "T", "U", "V", "W", "X", "Y", "Z",
];
const DIGITS: [&str; 10] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const FUNCTION_KEYS: [&str; 12] = [
    "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
];
const NAMED_KEYS: [(i32, &str); 14] = [
    (0x08, "Backspace"),
    (0x09, "Tab"),
    (0x0D, "Enter"),
    (0x1B, "Esc"),
    (0x21, "PageUp"),
    (0x22, "PageDown"),
    (0x23, "End"),
    (0x24, "Home"),
    (0x25, "Left"),
    (0x26, "Up"),
    (0x27, "Right"),
    (0x28, "Down"),
    (0x2D, "Insert"),
    (0x2E, "Delete"),
];
// TODO(nakul): punctuation names assume a US layout; ToUnicodeEx could name
// them per layout if non-US shortcut labels turn out to matter.
const PUNCTUATION_KEYS: [(i32, &str); 11] = [
    (0xBA, ";"),
    (0xBB, "="),
    (0xBC, ","),
    (0xBD, "-"),
    (0xBE, "."),
    (0xBF, "/"),
    (0xC0, "`"),
    (0xDB, "["),
    (0xDC, "\\"),
    (0xDD, "]"),
    (0xDE, "'"),
];
const NUMPAD_KEYS: [(i32, &str); 15] = [
    (0x60, "0"),
    (0x61, "1"),
    (0x62, "2"),
    (0x63, "3"),
    (0x64, "4"),
    (0x65, "5"),
    (0x66, "6"),
    (0x67, "7"),
    (0x68, "8"),
    (0x69, "9"),
    (0x6A, "*"),
    (0x6B, "+"),
    (0x6D, "-"),
    (0x6E, "."),
    (0x6F, "/"),
];

/// One polled key: virtual-key code, display name, and whether pressing it
/// without a command modifier types a character.
type PolledKey = (i32, &'static str, bool);

fn polled_keys() -> Vec<PolledKey> {
    let mut keys = Vec::with_capacity(90);
    keys.extend(
        LETTERS
            .iter()
            .zip(0x41..)
            .map(|(name, code)| (code, *name, true)),
    );
    keys.extend(
        DIGITS
            .iter()
            .zip(0x30..)
            .map(|(name, code)| (code, *name, true)),
    );
    keys.extend(
        FUNCTION_KEYS
            .iter()
            .zip(0x70..)
            .map(|(name, code)| (code, *name, false)),
    );
    keys.push((0x20, "Space", true));
    keys.extend(NAMED_KEYS.iter().map(|(code, name)| (*code, *name, false)));
    keys.extend(
        PUNCTUATION_KEYS
            .iter()
            .map(|(code, name)| (*code, *name, true)),
    );
    keys.extend(NUMPAD_KEYS.iter().map(|(code, name)| (*code, *name, true)));
    keys
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct Modifiers {
    ctrl: bool,
    shift: bool,
    alt: bool,
    meta: bool,
}

fn modifiers() -> Modifiers {
    Modifiers {
        ctrl: button_down(VK_CONTROL_CODE),
        shift: button_down(VK_SHIFT_CODE),
        alt: button_down(VK_MENU_CODE),
        meta: button_down(VK_LWIN_CODE) || button_down(VK_RWIN_CODE),
    }
}

/// Builds the stored event. Typed characters keep no identity and no
/// modifiers; Ctrl+Alt counts as typing because that is how AltGr reports.
fn key_event(time: f64, key: &'static str, types_character: bool, held: Modifiers) -> KeyEventDto {
    let alt_gr = held.ctrl && held.alt && !held.meta;
    let is_text = types_character && (alt_gr || !(held.ctrl || held.alt || held.meta));
    if is_text {
        return KeyEventDto {
            time,
            kind: "text",
            key: "",
            ctrl: false,
            shift: false,
            alt: false,
            meta: false,
        };
    }
    KeyEventDto {
        time,
        kind: "key",
        key,
        ctrl: held.ctrl,
        shift: held.shift,
        alt: held.alt,
        meta: held.meta,
    }
}

#[derive(Default)]
struct Samples {
    times: Vec<f64>,
    xs: Vec<f32>,
    ys: Vec<f32>,
    events: Vec<CursorEventDto>,
    shapes: Vec<CursorShapeSpanDto>,
    keys: Vec<KeyEventDto>,
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
    keys_recorded: bool,
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

/// Reads every polled key and returns the ones that went down since the last
/// poll. Modifiers are read only when something was pressed.
fn poll_key_presses(keys: &[PolledKey], held: &mut [bool], time: f64) -> Vec<KeyEventDto> {
    let mut pressed = Vec::new();
    let mut held_modifiers = None;
    for ((vk, name, types_character), was_down) in keys.iter().zip(held.iter_mut()) {
        let down = button_down(*vk);
        if down && !*was_down {
            let current = *held_modifiers.get_or_insert_with(modifiers);
            pressed.push(key_event(time, name, *types_character, current));
        }
        *was_down = down;
    }
    pressed
}

impl PointerSampler {
    /// `capture_keys` is the user's opt-in. When it is off no key state is ever
    /// read, so a recording without the overlay carries no keyboard data at all.
    pub fn start(display_bounds: Rect, scale_factor: f64, capture_keys: bool) -> Self {
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
            let keys = if capture_keys {
                polled_keys()
            } else {
                Vec::new()
            };
            let mut keys_held = vec![false; keys.len()];
            let mut tick: u64 = 0;

            while thread_running.load(Ordering::Relaxed) {
                let elapsed = started.elapsed().as_secs_f64();
                if capture_keys && tick.is_multiple_of(KEY_POLL_EVERY) {
                    let pressed_now = poll_key_presses(&keys, &mut keys_held, elapsed);
                    if !pressed_now.is_empty()
                        && let Ok(mut buffer) = thread_samples.lock()
                    {
                        buffer.keys.extend(pressed_now);
                    }
                }
                tick = tick.wrapping_add(1);
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
            keys_recorded: capture_keys,
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
            keys_recorded: self.keys_recorded,
            keys: samples.keys.clone(),
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

#[cfg(test)]
mod tests {
    use super::*;

    const NONE: Modifiers = Modifiers {
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
    };

    #[test]
    fn typed_characters_keep_no_identity() {
        let event = key_event(
            1.5,
            "Q",
            true,
            Modifiers {
                shift: true,
                ..NONE
            },
        );
        assert_eq!(event.kind, "text");
        assert_eq!(event.key, "");
        assert!(!event.shift);
        assert!((event.time - 1.5).abs() < f64::EPSILON);
    }

    #[test]
    fn shortcuts_keep_their_name_and_modifiers() {
        let event = key_event(
            0.0,
            "S",
            true,
            Modifiers {
                ctrl: true,
                shift: true,
                ..NONE
            },
        );
        assert_eq!(event.kind, "key");
        assert_eq!(event.key, "S");
        assert!(event.ctrl && event.shift && !event.alt && !event.meta);

        let windows_shortcut = key_event(0.0, "D", true, Modifiers { meta: true, ..NONE });
        assert_eq!(windows_shortcut.kind, "key");
    }

    #[test]
    fn alt_gr_counts_as_typing() {
        let event = key_event(
            0.0,
            "Q",
            true,
            Modifiers {
                ctrl: true,
                alt: true,
                ..NONE
            },
        );
        assert_eq!(event.kind, "text");
    }

    #[test]
    fn named_keys_are_always_shown() {
        let enter = key_event(0.0, "Enter", false, NONE);
        assert_eq!((enter.kind, enter.key), ("key", "Enter"));
    }

    #[test]
    fn polled_keys_have_unique_codes_and_names() {
        let keys = polled_keys();
        let mut codes: Vec<i32> = keys.iter().map(|(code, _, _)| *code).collect();
        codes.sort_unstable();
        codes.dedup();
        assert_eq!(codes.len(), keys.len());
        assert!(keys.iter().all(|(_, name, _)| !name.is_empty()));
        assert!(keys.contains(&(0x41, "A", true)));
        assert!(keys.contains(&(0x39, "9", true)));
        assert!(keys.contains(&(0x7B, "F12", false)));
        assert!(!keys.iter().any(|(code, _, _)| {
            [
                VK_SHIFT_CODE,
                VK_CONTROL_CODE,
                VK_MENU_CODE,
                VK_LWIN_CODE,
                VK_RWIN_CODE,
            ]
            .contains(code)
        }));
    }
}
