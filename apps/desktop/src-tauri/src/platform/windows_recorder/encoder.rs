use std::path::Path;

use windows::Win32::Graphics::Direct3D11::{ID3D11Device, ID3D11Texture2D};
use windows::Win32::Media::MediaFoundation::{
    IMF2DBuffer, IMFDXGIDeviceManager, IMFMediaType, IMFSinkWriter, MF_MT_AVG_BITRATE,
    MF_MT_FRAME_RATE, MF_MT_FRAME_SIZE, MF_MT_INTERLACE_MODE, MF_MT_MAJOR_TYPE,
    MF_MT_MPEG2_PROFILE, MF_MT_PIXEL_ASPECT_RATIO, MF_MT_SUBTYPE,
    MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS, MF_SINK_WRITER_D3D_MANAGER,
    MF_SINK_WRITER_DISABLE_THROTTLING, MF_VERSION, MFCreateAttributes, MFCreateDXGIDeviceManager,
    MFCreateDXGISurfaceBuffer, MFCreateMediaType, MFCreateSample, MFCreateSinkWriterFromURL,
    MFMediaType_Video, MFSTARTUP_LITE, MFStartup, MFVideoFormat_ARGB32, MFVideoFormat_H264,
    MFVideoInterlace_Progressive, eAVEncH264VProfile_High,
};
use windows::core::{HSTRING, Interface};

use crate::error::SnaphubError;

/// Ticks per second in Media Foundation's timeline.
const HNS_PER_SECOND: i64 = 10_000_000;

/// Bitrate that keeps screen content sharp without producing huge files.
///
/// Screen recordings are mostly flat colour and text, so they compress far
/// better than camera footage; these are deliberately generous rather than
/// tuned, since a soft screenshot is the one artefact users notice immediately.
/// Scales the base bitrate with the frame rate, capped at 80 Mbps, so high
/// refresh recordings stay sharp without unbounded files.
fn target_bitrate_for_fps(width: u32, height: u32, fps: u32) -> u32 {
    let pixels = u64::from(width) * u64::from(height);
    let base = match pixels {
        p if p <= 1_280 * 720 => 8_000_000,
        p if p <= 1_920 * 1_080 => 12_000_000,
        p if p <= 2_560 * 1_440 => 24_000_000,
        _ => 40_000_000,
    };
    let scale = f64::from(fps).max(60.0) / 60.0;
    ((base as f64 * scale).round() as u64).clamp(1, 80_000_000) as u32
}

/// Highest frame rate the H.264 level 5.2 macroblock rate allows.
pub(crate) fn max_fps_for(width: u32, height: u32) -> u32 {
    let blocks = width.div_ceil(16) as u64 * height.div_ceil(16) as u64;
    (2_073_600 / blocks.max(1)) as u32
}

fn pack_u64(high: u32, low: u32) -> u64 {
    (u64::from(high) << 32) | u64::from(low)
}

/// Writes H.264 into an MP4 through the OS sink writer.
///
/// The whole point of this path is that frames never leave GPU memory: the
/// capture texture is wrapped as a DXGI surface buffer and handed straight to a
/// hardware transform, so there is no per-frame CPU copy.
pub struct VideoEncoder {
    writer: IMFSinkWriter,
    stream: u32,
    frame_duration_hns: i64,
    frames: u64,
    // Held for the writer's lifetime; releasing it early invalidates the
    // hardware transform's device reference.
    _device_manager: IMFDXGIDeviceManager,
}

// SAFETY: the sink writer and device manager are free-threaded, and this struct
// is only ever driven from the single encoder thread that owns it.
unsafe impl Send for VideoEncoder {}

/// Initialises Media Foundation for the calling thread.
pub fn startup() -> Result<(), SnaphubError> {
    // SAFETY: MFStartup is idempotent per-process and matched by MFShutdown at
    // process exit, which Windows performs for us.
    unsafe { MFStartup(MF_VERSION, MFSTARTUP_LITE) }.map_err(SnaphubError::encode)
}

impl VideoEncoder {
    pub fn new(
        path: &Path,
        device: &ID3D11Device,
        width: u32,
        height: u32,
        fps: u32,
    ) -> Result<Self, SnaphubError> {
        let fps = fps.clamp(1, 240);

        // Share our capture device with the encoder so the hardware transform
        // reads the same textures rather than copying through system memory.
        let mut reset_token = 0u32;
        let mut manager: Option<IMFDXGIDeviceManager> = None;
        // SAFETY: both out-parameters are owned locals, checked immediately.
        unsafe { MFCreateDXGIDeviceManager(&mut reset_token, &mut manager) }
            .map_err(SnaphubError::encode)?;
        let manager = manager.ok_or_else(|| {
            SnaphubError::Encode("Media Foundation returned no device manager".into())
        })?;
        // SAFETY: `device` outlives the manager, which this struct holds.
        unsafe { manager.ResetDevice(device, reset_token) }.map_err(SnaphubError::encode)?;

        // SAFETY: the out-parameter is a local checked on the next line.
        let attributes = unsafe {
            let mut attributes = None;
            MFCreateAttributes(&mut attributes, 4).map_err(SnaphubError::encode)?;
            attributes.ok_or_else(|| {
                SnaphubError::Encode("Media Foundation returned no attribute store".into())
            })?
        };
        // SAFETY: `attributes` is a live store and every key is a valid GUID.
        unsafe {
            attributes
                .SetUINT32(&MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS, 1)
                .map_err(SnaphubError::encode)?;
            attributes
                .SetUINT32(&MF_SINK_WRITER_DISABLE_THROTTLING, 1)
                .map_err(SnaphubError::encode)?;
            attributes
                .SetUnknown(&MF_SINK_WRITER_D3D_MANAGER, &manager)
                .map_err(SnaphubError::encode)?;
        }

        let url = HSTRING::from(path.as_os_str());
        // SAFETY: the URL and attribute store are live for the duration.
        let writer = unsafe { MFCreateSinkWriterFromURL(&url, None, &attributes) }
            .map_err(SnaphubError::encode)?;

        let output = Self::media_type(
            &MFVideoFormat_H264,
            width,
            height,
            fps,
            Some(target_bitrate_for_fps(width, height, fps)),
        )?;
        // SAFETY: `output` is a fully configured media type.
        let stream = unsafe { writer.AddStream(&output) }.map_err(SnaphubError::encode)?;

        // The capture texture is BGRA, which Media Foundation calls ARGB32.
        // Declaring the true input format lets the pipeline insert a GPU video
        // processor for the conversion to NV12 rather than rejecting samples.
        let input = Self::media_type(&MFVideoFormat_ARGB32, width, height, fps, None)?;
        // SAFETY: `stream` was just returned by AddStream.
        unsafe { writer.SetInputMediaType(stream, &input, None) }.map_err(SnaphubError::encode)?;
        // SAFETY: the writer is configured and not yet writing.
        unsafe { writer.BeginWriting() }.map_err(SnaphubError::encode)?;

        Ok(Self {
            writer,
            stream,
            frame_duration_hns: HNS_PER_SECOND / i64::from(fps),
            frames: 0,
            _device_manager: manager,
        })
    }

    fn media_type(
        subtype: &windows::core::GUID,
        width: u32,
        height: u32,
        fps: u32,
        bitrate: Option<u32>,
    ) -> Result<IMFMediaType, SnaphubError> {
        // SAFETY: the out-parameter is a local checked immediately.
        let media_type = unsafe { MFCreateMediaType() }.map_err(SnaphubError::encode)?;
        // SAFETY: `media_type` is live and each attribute key is a valid GUID.
        unsafe {
            media_type
                .SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)
                .map_err(SnaphubError::encode)?;
            media_type
                .SetGUID(&MF_MT_SUBTYPE, subtype)
                .map_err(SnaphubError::encode)?;
            media_type
                .SetUINT64(&MF_MT_FRAME_SIZE, pack_u64(width, height))
                .map_err(SnaphubError::encode)?;
            media_type
                .SetUINT64(&MF_MT_FRAME_RATE, pack_u64(fps, 1))
                .map_err(SnaphubError::encode)?;
            media_type
                .SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, pack_u64(1, 1))
                .map_err(SnaphubError::encode)?;
            media_type
                .SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)
                .map_err(SnaphubError::encode)?;
            if let Some(bitrate) = bitrate {
                media_type
                    .SetUINT32(&MF_MT_AVG_BITRATE, bitrate)
                    .map_err(SnaphubError::encode)?;
                media_type
                    .SetUINT32(&MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_High.0 as u32)
                    .map_err(SnaphubError::encode)?;
            }
        }
        Ok(media_type)
    }

    /// Submits one frame, timestamped by its index so the output is constant-rate.
    pub fn write_frame(&mut self, texture: &ID3D11Texture2D) -> Result<(), SnaphubError> {
        // SAFETY: the texture belongs to the device shared with this writer and
        // stays alive until the sample is released below.
        let buffer = unsafe { MFCreateDXGISurfaceBuffer(&ID3D11Texture2D::IID, texture, 0, false) }
            .map_err(|e| SnaphubError::Encode(format!("surface buffer: {e}")))?;

        // A DXGI-backed buffer reports a current length of zero until it is set,
        // and the sink writer rejects a zero-length sample outright. The 2D view
        // is the only thing that knows the real size of the surface.
        let two_d: IMF2DBuffer = buffer.cast().map_err(SnaphubError::encode)?;
        // SAFETY: `two_d` is a live view of the buffer created above.
        let length = unsafe { two_d.GetContiguousLength() }.map_err(SnaphubError::encode)?;
        // SAFETY: `length` came from the buffer itself.
        unsafe { buffer.SetCurrentLength(length) }.map_err(SnaphubError::encode)?;

        // SAFETY: the buffer is live and the sample takes a reference to it.
        let sample = unsafe { MFCreateSample() }.map_err(SnaphubError::encode)?;
        // SAFETY: `sample` and `buffer` are both live.
        unsafe {
            sample.AddBuffer(&buffer).map_err(SnaphubError::encode)?;
            sample
                .SetSampleTime(self.frames as i64 * self.frame_duration_hns)
                .map_err(SnaphubError::encode)?;
            sample
                .SetSampleDuration(self.frame_duration_hns)
                .map_err(SnaphubError::encode)?;
            self.writer
                .WriteSample(self.stream, &sample)
                .map_err(|e| SnaphubError::Encode(format!("write sample: {e}")))?;
        }
        self.frames += 1;
        Ok(())
    }

    pub fn frames(&self) -> u64 {
        self.frames
    }

    pub fn duration_seconds(&self) -> f64 {
        (self.frames as f64 * self.frame_duration_hns as f64) / HNS_PER_SECOND as f64
    }

    /// Flushes and closes the file. Consumes the encoder; there is no reopening.
    pub fn finish(self) -> Result<(), SnaphubError> {
        // SAFETY: the writer is live and has not been finalized yet.
        unsafe { self.writer.Finalize() }.map_err(SnaphubError::encode)
    }
}

#[cfg(test)]
mod bitrate_tests {
    use super::{max_fps_for, target_bitrate_for_fps};

    #[test]
    fn max_fps_follows_the_level_52_macroblock_rate() {
        assert_eq!(max_fps_for(1920, 1080), 254);
        assert_eq!(max_fps_for(2560, 1440), 144);
        assert_eq!(max_fps_for(3840, 2160), 64);
    }

    #[test]
    fn bitrate_holds_at_60_and_scales_above() {
        assert_eq!(target_bitrate_for_fps(1920, 1080, 30), 12_000_000);
        assert_eq!(target_bitrate_for_fps(1920, 1080, 60), 12_000_000);
        assert_eq!(target_bitrate_for_fps(1920, 1080, 120), 24_000_000);
        assert_eq!(target_bitrate_for_fps(1920, 1080, 144), 28_800_000);
    }

    #[test]
    fn bitrate_caps_at_80_mbps() {
        assert_eq!(target_bitrate_for_fps(3840, 2160, 240), 80_000_000);
    }
}
