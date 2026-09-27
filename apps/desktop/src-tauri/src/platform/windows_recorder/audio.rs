use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Media::Audio::{
    AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
    DEVICE_STATE_ACTIVE, IAudioCaptureClient, IAudioClient, IMMDevice, IMMDeviceEnumerator,
    MMDeviceEnumerator, WAVE_FORMAT_PCM, WAVEFORMATEX, eCapture, eConsole, eRender,
};
use windows::Win32::Media::MediaFoundation::{
    IMFSinkWriter, MF_MT_AUDIO_AVG_BYTES_PER_SECOND, MF_MT_AUDIO_BITS_PER_SAMPLE,
    MF_MT_AUDIO_BLOCK_ALIGNMENT, MF_MT_AUDIO_NUM_CHANNELS, MF_MT_AUDIO_SAMPLES_PER_SECOND,
    MF_MT_MAJOR_TYPE, MF_MT_SUBTYPE, MFAudioFormat_AAC, MFAudioFormat_PCM, MFCreateMediaType,
    MFCreateMemoryBuffer, MFCreateSample, MFCreateSinkWriterFromURL, MFMediaType_Audio,
};
use windows::Win32::System::Com::{
    CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree, STGM_READ,
};
use windows::core::HSTRING;

use crate::domain::AudioDeviceDto;
use crate::error::SnaphubError;

/// Everything is resampled to this rate so the two tracks mix without work.
const TARGET_RATE: u32 = 48_000;
const TARGET_CHANNELS: u32 = 2;
const BYTES_PER_SAMPLE: u32 = 2;
const HNS_PER_SECOND: i64 = 10_000_000;

/// Which endpoint a track is recorded from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AudioSource {
    /// Everything the machine is playing, via a loopback render endpoint.
    /// `None` follows the user's default output.
    System(Option<String>),
    /// A capture endpoint. `None` follows the user's default microphone.
    Microphone(Option<String>),
}

impl AudioSource {
    fn is_loopback(&self) -> bool {
        matches!(self, Self::System(_))
    }

    /// The explicitly chosen device id, if any.
    fn explicit_id(&self) -> Option<&str> {
        match self {
            Self::System(id) | Self::Microphone(id) => id.as_deref().filter(|id| !id.is_empty()),
        }
    }

    /// `system` or `microphone`, for failure reporting.
    pub fn kind(&self) -> &'static str {
        match self {
            Self::System(_) => "system",
            Self::Microphone(_) => "microphone",
        }
    }
}

/// Lists the endpoints the user can choose between.
pub fn capture_devices() -> Result<Vec<AudioDeviceDto>, SnaphubError> {
    // SAFETY: COM is initialised per-thread; a repeat call returns S_FALSE and
    // is harmless.
    unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
        .ok()
        .map_err(SnaphubError::audio)?;

    // SAFETY: the class and interface identifiers are matched.
    let enumerator: IMMDeviceEnumerator =
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
            .map_err(SnaphubError::audio)?;

    let mut devices = Vec::new();
    for (flow, kind) in [(eCapture, "microphone"), (eRender, "system")] {
        // SAFETY: `enumerator` is live for the whole loop.
        let default_id = unsafe { enumerator.GetDefaultAudioEndpoint(flow, eConsole) }
            .ok()
            .and_then(|device| device_id(&device));

        // SAFETY: same.
        let Ok(collection) = (unsafe { enumerator.EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE) })
        else {
            continue;
        };
        // SAFETY: the collection is live.
        let count = unsafe { collection.GetCount() }.unwrap_or(0);
        for index in 0..count {
            // SAFETY: `index` is bounded by the reported count.
            let Ok(device) = (unsafe { collection.Item(index) }) else {
                continue;
            };
            let Some(id) = device_id(&device) else {
                continue;
            };
            let name = device_name(&device).unwrap_or_else(|| "Audio device".to_owned());
            devices.push(AudioDeviceDto {
                is_default: default_id.as_deref() == Some(id.as_str()),
                id,
                name,
                kind,
            });
        }
    }
    Ok(devices)
}

fn device_id(device: &IMMDevice) -> Option<String> {
    // SAFETY: `device` is live; the returned string is freed below.
    let raw = unsafe { device.GetId() }.ok()?;
    // SAFETY: `raw` points at a COM-allocated wide string.
    let value = unsafe { raw.to_string() }.ok();
    // SAFETY: `raw` was allocated by the callee and is released exactly once.
    unsafe { CoTaskMemFree(Some(raw.0.cast())) };
    value
}

fn device_name(device: &IMMDevice) -> Option<String> {
    // SAFETY: `device` is live and the property store is released on drop.
    let store = unsafe { device.OpenPropertyStore(STGM_READ) }.ok()?;
    // SAFETY: the key is a well-known device property.
    let value = unsafe { store.GetValue(&PKEY_Device_FriendlyName) }.ok()?;
    value.to_string().into()
}

/// Wraps the sink writer for one AAC track.
struct AudioEncoder {
    writer: IMFSinkWriter,
    stream: u32,
    written_frames: u64,
}

// SAFETY: the sink writer is free-threaded and only driven from its own thread.
unsafe impl Send for AudioEncoder {}

impl AudioEncoder {
    fn new(path: &Path) -> Result<Self, SnaphubError> {
        let url = HSTRING::from(path.as_os_str());
        // SAFETY: the URL is live for the duration of the call.
        let writer =
            unsafe { MFCreateSinkWriterFromURL(&url, None, None) }.map_err(SnaphubError::audio)?;

        // SAFETY: out-parameter is a local, checked on use.
        let output = unsafe { MFCreateMediaType() }.map_err(SnaphubError::audio)?;
        // SAFETY: `output` is live and every key is a valid GUID.
        unsafe {
            output
                .SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)
                .map_err(SnaphubError::audio)?;
            output
                .SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_AAC)
                .map_err(SnaphubError::audio)?;
            output
                .SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)
                .map_err(SnaphubError::audio)?;
            output
                .SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, TARGET_RATE)
                .map_err(SnaphubError::audio)?;
            output
                .SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, TARGET_CHANNELS)
                .map_err(SnaphubError::audio)?;
            // 128 kbps stereo AAC.
            output
                .SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, 16_000)
                .map_err(SnaphubError::audio)?;
        }
        // SAFETY: `output` is fully configured.
        let stream = unsafe { writer.AddStream(&output) }.map_err(SnaphubError::audio)?;

        // SAFETY: out-parameter is a local.
        let input = unsafe { MFCreateMediaType() }.map_err(SnaphubError::audio)?;
        let block_align = TARGET_CHANNELS * BYTES_PER_SAMPLE;
        // SAFETY: `input` is live and every key is a valid GUID.
        unsafe {
            input
                .SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)
                .map_err(SnaphubError::audio)?;
            input
                .SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_PCM)
                .map_err(SnaphubError::audio)?;
            input
                .SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, BYTES_PER_SAMPLE * 8)
                .map_err(SnaphubError::audio)?;
            input
                .SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, TARGET_RATE)
                .map_err(SnaphubError::audio)?;
            input
                .SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, TARGET_CHANNELS)
                .map_err(SnaphubError::audio)?;
            input
                .SetUINT32(&MF_MT_AUDIO_BLOCK_ALIGNMENT, block_align)
                .map_err(SnaphubError::audio)?;
            input
                .SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, TARGET_RATE * block_align)
                .map_err(SnaphubError::audio)?;
        }
        // SAFETY: `stream` was just returned by AddStream.
        unsafe { writer.SetInputMediaType(stream, &input, None) }.map_err(SnaphubError::audio)?;
        // SAFETY: the writer is configured.
        unsafe { writer.BeginWriting() }.map_err(SnaphubError::audio)?;

        Ok(Self {
            writer,
            stream,
            written_frames: 0,
        })
    }

    /// Appends interleaved 16-bit stereo frames.
    fn write(&mut self, pcm: &[i16]) -> Result<(), SnaphubError> {
        if pcm.is_empty() {
            return Ok(());
        }
        let bytes = std::mem::size_of_val(pcm);
        let length = u32::try_from(bytes).map_err(SnaphubError::audio)?;
        // SAFETY: out-parameter is a local.
        let buffer = unsafe { MFCreateMemoryBuffer(length) }.map_err(SnaphubError::audio)?;

        // SAFETY: `Lock` yields a writable region of at least `length` bytes,
        // which is exactly what is copied in, and is released before use.
        unsafe {
            let mut target = std::ptr::null_mut();
            buffer
                .Lock(&mut target, None, None)
                .map_err(SnaphubError::audio)?;
            std::ptr::copy_nonoverlapping(pcm.as_ptr().cast::<u8>(), target, bytes);
            buffer.Unlock().map_err(SnaphubError::audio)?;
            buffer
                .SetCurrentLength(length)
                .map_err(SnaphubError::audio)?;
        }

        let frames = pcm.len() as u64 / u64::from(TARGET_CHANNELS);
        let time = (self.written_frames as i64 * HNS_PER_SECOND) / i64::from(TARGET_RATE);
        let duration = (frames as i64 * HNS_PER_SECOND) / i64::from(TARGET_RATE);

        // SAFETY: sample and buffer are both live.
        unsafe {
            let sample = MFCreateSample().map_err(SnaphubError::audio)?;
            sample.AddBuffer(&buffer).map_err(SnaphubError::audio)?;
            sample.SetSampleTime(time).map_err(SnaphubError::audio)?;
            sample
                .SetSampleDuration(duration)
                .map_err(SnaphubError::audio)?;
            self.writer
                .WriteSample(self.stream, &sample)
                .map_err(SnaphubError::audio)?;
        }
        self.written_frames += frames;
        Ok(())
    }

    fn finish(self) -> Result<(), SnaphubError> {
        // SAFETY: the writer is live and not yet finalized.
        unsafe { self.writer.Finalize() }.map_err(SnaphubError::audio)
    }
}

/// Reads a WASAPI endpoint and encodes it to its own AAC file.
///
/// Each source gets its own sidecar rather than a second track in the MP4:
/// most players surface only the first audio track, and the editor has to
/// balance microphone against system audio independently.
pub struct AudioTrack {
    running: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
    path: PathBuf,
}

impl AudioTrack {
    pub fn start(source: AudioSource, path: PathBuf) -> Result<Self, SnaphubError> {
        let running = Arc::new(AtomicBool::new(true));
        let thread_running = Arc::clone(&running);
        let thread_path = path.clone();

        let handle = thread::spawn(move || {
            if let Err(error) = capture_loop(source, &thread_path, &thread_running) {
                // A failed audio track must not take the recording down with it;
                // the video is the artefact the user cannot recreate.
                eprintln!("SH-AUDIO-001: {error}");
            }
        });

        Ok(Self {
            running,
            handle: Some(handle),
            path,
        })
    }

    /// Stops the thread and reports the file, or `None` if nothing was written.
    pub fn finish(mut self) -> Option<PathBuf> {
        self.running.store(false, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
        match std::fs::metadata(&self.path) {
            Ok(meta) if meta.len() > 0 => Some(self.path.clone()),
            _ => None,
        }
    }
}

impl Drop for AudioTrack {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

/// Converts one packet to interleaved 16-bit stereo at the target rate.
///
/// Endpoints usually hand back 32-bit float at 48 kHz, but the rate and channel
/// count are whatever the device mix format says, so both are normalised here.
fn convert(raw: &[u8], format: &WAVEFORMATEX, out: &mut Vec<i16>) {
    let channels = usize::from(format.nChannels).max(1);
    let bytes_per_sample = usize::from(format.wBitsPerSample) / 8;
    if bytes_per_sample == 0 {
        return;
    }
    let frame_bytes = channels * bytes_per_sample;
    if frame_bytes == 0 || raw.len() < frame_bytes {
        return;
    }
    let frames = raw.len() / frame_bytes;
    let is_float = format.wFormatTag != WAVE_FORMAT_PCM as u16 && bytes_per_sample == 4;

    let read = |frame: usize, channel: usize| -> f32 {
        let offset = frame * frame_bytes + channel * bytes_per_sample;
        let Some(slice) = raw.get(offset..offset + bytes_per_sample) else {
            return 0.0;
        };
        if is_float {
            f32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]])
        } else if bytes_per_sample == 2 {
            f32::from(i16::from_le_bytes([slice[0], slice[1]])) / 32_768.0
        } else {
            0.0
        }
    };

    // Linear resampling is enough here: the ratio is 1.0 on almost every device,
    // and a dedicated resampler would be another dependency for no audible gain.
    let ratio = f64::from(format.nSamplesPerSec) / f64::from(TARGET_RATE);
    let target_frames = ((frames as f64) / ratio).floor() as usize;
    for index in 0..target_frames {
        let source = ((index as f64) * ratio) as usize;
        let source = source.min(frames.saturating_sub(1));
        let left = read(source, 0);
        let right = if channels > 1 { read(source, 1) } else { left };
        out.push((left.clamp(-1.0, 1.0) * 32_767.0) as i16);
        out.push((right.clamp(-1.0, 1.0) * 32_767.0) as i16);
    }
}

/// Resolves the endpoint for a source: an explicitly chosen id first, then the
/// default endpoint of the same flow. A System id must resolve to a render
/// endpoint; anything else falls back to the default rather than failing.
fn resolve_endpoint(
    enumerator: &IMMDeviceEnumerator,
    source: &AudioSource,
) -> windows::core::Result<IMMDevice> {
    if let Some(id) = source.explicit_id() {
        let wide = HSTRING::from(id);
        // SAFETY: `enumerator` and `wide` are live for the call.
        if let Ok(device) = unsafe { enumerator.GetDevice(&wide) } {
            let usable = match source {
                AudioSource::System(_) => is_render_endpoint(&device),
                AudioSource::Microphone(_) => true,
            };
            if usable {
                return Ok(device);
            }
        }
    }
    let flow = if source.is_loopback() {
        eRender
    } else {
        eCapture
    };
    // SAFETY: `enumerator` is live.
    unsafe { enumerator.GetDefaultAudioEndpoint(flow, eConsole) }
}

fn is_render_endpoint(device: &IMMDevice) -> bool {
    use windows::Win32::Media::Audio::IMMEndpoint;
    use windows::core::Interface as _;
    device
        .cast::<IMMEndpoint>()
        .ok()
        // SAFETY: the endpoint is live.
        .and_then(|endpoint| unsafe { endpoint.GetDataFlow() }.ok())
        .is_some_and(|flow| flow == eRender)
}

/// Synchronously checks that a requested source can be opened, without
/// recording anything. Used at recording start so a broken audio choice
/// warns instead of silently producing no track.
pub fn probe_source(source: &AudioSource) -> Result<(), SnaphubError> {
    // SAFETY: COM is initialised for this thread; S_FALSE on repeat is fine.
    unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
        .ok()
        .map_err(SnaphubError::audio)?;
    // SAFETY: class and interface identifiers are matched.
    let enumerator: IMMDeviceEnumerator =
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
            .map_err(SnaphubError::audio)?;
    let device = resolve_endpoint(&enumerator, source).map_err(SnaphubError::audio)?;
    // SAFETY: `device` is live and the interface identifier matches.
    let client: IAudioClient =
        unsafe { device.Activate(CLSCTX_ALL, None) }.map_err(SnaphubError::audio)?;
    // SAFETY: the returned pointer is owned by us and freed below.
    let format_ptr = unsafe { client.GetMixFormat() }.map_err(SnaphubError::audio)?;
    // SAFETY: the format was allocated by GetMixFormat and is released once.
    unsafe { CoTaskMemFree(Some(format_ptr.cast())) };
    Ok(())
}

fn capture_loop(
    source: AudioSource,
    path: &Path,
    running: &AtomicBool,
) -> Result<(), SnaphubError> {
    // SAFETY: COM is initialised for this thread; S_FALSE on repeat is fine.
    unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
        .ok()
        .map_err(SnaphubError::audio)?;

    // SAFETY: class and interface identifiers are matched.
    let enumerator: IMMDeviceEnumerator =
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
            .map_err(SnaphubError::audio)?;

    let device = resolve_endpoint(&enumerator, &source).map_err(SnaphubError::audio)?;
    // SAFETY: `device` is live and the interface identifier matches.
    let client: IAudioClient =
        unsafe { device.Activate(CLSCTX_ALL, None) }.map_err(SnaphubError::audio)?;

    // SAFETY: the returned pointer is owned by us and freed below.
    let format_ptr = unsafe { client.GetMixFormat() }.map_err(SnaphubError::audio)?;
    // SAFETY: `GetMixFormat` guarantees a valid WAVEFORMATEX.
    let format = unsafe { *format_ptr };

    let flags = if source.is_loopback() {
        AUDCLNT_STREAMFLAGS_LOOPBACK
    } else {
        0
    };
    // SAFETY: the format pointer is still valid at this point.
    let init = unsafe {
        client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            flags,
            HNS_PER_SECOND, // a one-second ring buffer
            0,
            format_ptr,
            None,
        )
    };
    // SAFETY: the format was allocated by GetMixFormat and is released once.
    unsafe { CoTaskMemFree(Some(format_ptr.cast())) };
    init.map_err(SnaphubError::audio)?;

    // SAFETY: the client is initialised.
    let capture: IAudioCaptureClient =
        unsafe { client.GetService() }.map_err(SnaphubError::audio)?;
    // SAFETY: same.
    unsafe { client.Start() }.map_err(SnaphubError::audio)?;

    let mut encoder = AudioEncoder::new(path)?;
    let mut pcm: Vec<i16> = Vec::with_capacity(TARGET_RATE as usize);
    let mut elapsed = Duration::ZERO;
    let poll = Duration::from_millis(10);

    while running.load(Ordering::Relaxed) {
        loop {
            // SAFETY: `capture` is live for the whole loop.
            let available = unsafe { capture.GetNextPacketSize() }.unwrap_or(0);
            if available == 0 {
                break;
            }
            let mut data = std::ptr::null_mut();
            let mut frames = 0u32;
            let mut flags = 0u32;
            // SAFETY: all out-parameters are owned locals; the buffer is released
            // immediately after being copied out.
            let taken =
                unsafe { capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None) };
            if taken.is_err() {
                break;
            }
            if frames > 0 && !data.is_null() {
                let silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32) != 0;
                if silent {
                    // The endpoint says this span is silence and the buffer
                    // contents are undefined, so emit real zeroes for it.
                    pcm.extend(std::iter::repeat_n(
                        0i16,
                        frames as usize * TARGET_CHANNELS as usize,
                    ));
                } else {
                    let bytes = frames as usize * usize::from(format.nBlockAlign);
                    // SAFETY: WASAPI guarantees `frames * nBlockAlign` readable
                    // bytes at `data` until ReleaseBuffer is called.
                    let raw = unsafe { std::slice::from_raw_parts(data, bytes) };
                    convert(raw, &format, &mut pcm);
                }
            }
            // SAFETY: matches the GetBuffer above exactly once.
            let _ = unsafe { capture.ReleaseBuffer(frames) };
        }

        if pcm.len() >= TARGET_RATE as usize {
            encoder.write(&pcm)?;
            pcm.clear();
        }

        thread::sleep(poll);
        elapsed += poll;
        // A loopback endpoint delivers nothing at all while the machine is
        // silent. Without this the track ends up shorter than the video and
        // drifts further out of sync the longer the recording runs.
        if source.is_loopback() {
            let expected = (elapsed.as_secs_f64() * f64::from(TARGET_RATE)) as u64;
            let written = encoder.written_frames + pcm.len() as u64 / u64::from(TARGET_CHANNELS);
            if expected > written + u64::from(TARGET_RATE) / 10 {
                let missing = (expected - written) as usize * TARGET_CHANNELS as usize;
                pcm.extend(std::iter::repeat_n(0i16, missing));
            }
        }
    }

    if !pcm.is_empty() {
        encoder.write(&pcm)?;
    }
    // SAFETY: the client was started above.
    let _ = unsafe { client.Stop() };
    encoder.finish()
}

#[cfg(test)]
mod device_tests {
    /// Prints the WASAPI endpoints on the dev machine.
    ///
    /// Ignored by default: it needs real audio hardware. Run it with
    /// `cargo test -- --ignored --nocapture`.
    #[test]
    #[ignore = "needs audio hardware"]
    fn lists_audio_endpoints() {
        let devices = super::capture_devices().expect("endpoints enumerate");
        let microphones = devices
            .iter()
            .filter(|device| device.kind == "microphone")
            .count();
        let systems = devices
            .iter()
            .filter(|device| device.kind == "system")
            .count();
        println!("microphones={microphones} systems={systems}");
        for device in &devices {
            println!(
                "kind={} default={} name={}",
                device.kind, device.is_default, device.name
            );
        }
    }
}
