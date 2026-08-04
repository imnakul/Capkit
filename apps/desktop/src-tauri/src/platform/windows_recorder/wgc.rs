use std::sync::{Arc, Mutex};

use windows::Foundation::TypedEventHandler;
use windows::Graphics::Capture::{
    Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession,
};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Graphics::SizeInt32;
use windows::Win32::Foundation::HMODULE;
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11_BOX, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_CREATE_DEVICE_VIDEO_SUPPORT,
    D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT, D3D11CreateDevice, ID3D11Device,
    ID3D11DeviceContext, ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::Graphics::Gdi::HMONITOR;
use windows::Win32::System::WinRT::Direct3D11::{
    CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess,
};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::core::{Interface, Result as WindowsResult};

use crate::error::SnaphubError;

/// The most recent frame, plus the counters the pacer needs.
///
/// Windows Graphics Capture only delivers a frame when the content changes, so
/// a static screen produces nothing at all. The encoder therefore reads from
/// this slot on a fixed schedule rather than being driven by frame arrival.
pub struct LatestFrame {
    pub texture: Option<ID3D11Texture2D>,
    pub arrived: u64,
    pub closed: bool,
}

pub struct CaptureStream {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    session: GraphicsCaptureSession,
    frame_pool: Direct3D11CaptureFramePool,
    latest: Arc<Mutex<LatestFrame>>,
    /// Staging texture the crop is copied into; also the encoder's input size.
    staging: ID3D11Texture2D,
    crop: D3D11_BOX,
    pub width: u32,
    pub height: u32,
}

// SAFETY: every COM interface held here is free-threaded (the frame pool is
// created with `CreateFreeThreaded`, and the D3D11 device is created without
// `SINGLETHREADED`), and all mutable state is behind a mutex.
unsafe impl Send for CaptureStream {}

/// True when this Windows build exposes Windows Graphics Capture at all.
pub fn is_supported() -> bool {
    GraphicsCaptureSession::IsSupported().unwrap_or(false)
}

fn create_device() -> WindowsResult<(ID3D11Device, ID3D11DeviceContext)> {
    let mut device = None;
    let mut context = None;
    // SAFETY: out-parameters are owned locals and checked immediately after.
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            // BGRA for the capture format, VIDEO for the encoder's transform.
            D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )?;
    }
    Ok((
        device.expect("D3D11CreateDevice returned success without a device"),
        context.expect("D3D11CreateDevice returned success without a context"),
    ))
}

impl CaptureStream {
    /// Begins capturing one monitor, cropped to `region` in display-local pixels.
    pub fn start(
        monitor: HMONITOR,
        region: Option<(u32, u32, u32, u32)>,
        capture_cursor: bool,
    ) -> Result<Self, SnaphubError> {
        if !is_supported() {
            return Err(SnaphubError::Record(
                "Screen recording needs Windows 10 version 2004 or newer".into(),
            ));
        }

        let (device, context) = create_device().map_err(SnaphubError::record)?;
        let dxgi: IDXGIDevice = device.cast().map_err(SnaphubError::record)?;
        // SAFETY: `dxgi` is a live interface obtained from our own device.
        let winrt_device: IDirect3DDevice = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi) }
            .map_err(SnaphubError::record)?
            .cast()
            .map_err(SnaphubError::record)?;

        let interop = windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
            .map_err(SnaphubError::record)?;
        // SAFETY: `monitor` is a live HMONITOR from the enumeration below.
        let item: GraphicsCaptureItem =
            unsafe { interop.CreateForMonitor(monitor) }.map_err(SnaphubError::record)?;

        let item_size: SizeInt32 = item.Size().map_err(SnaphubError::record)?;
        let source_width = item_size.Width.max(1) as u32;
        let source_height = item_size.Height.max(1) as u32;

        // Encoders reject odd dimensions, so every crop is rounded down to even.
        let (left, top, width, height) = match region {
            Some((x, y, w, h)) => {
                let left = x.min(source_width.saturating_sub(2));
                let top = y.min(source_height.saturating_sub(2));
                let width = w.min(source_width - left).max(2) & !1;
                let height = h.min(source_height - top).max(2) & !1;
                (left, top, width, height)
            }
            None => (0, 0, source_width & !1, source_height & !1),
        };

        // `CreateFreeThreaded` rather than `Create`: the plain constructor needs a
        // DispatcherQueue on the calling thread, which a worker thread lacks.
        let frame_pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &winrt_device,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            2,
            item_size,
        )
        .map_err(SnaphubError::record)?;

        let session = frame_pool
            .CreateCaptureSession(&item)
            .map_err(SnaphubError::record)?;
        // The hardware cursor is deliberately excluded by default: burning it in
        // makes the smooth-cursor track impossible to render later.
        let _ = session.SetIsCursorCaptureEnabled(capture_cursor);
        // Only Windows 11 permits suppressing the capture border, so this is
        // best-effort and its failure is not worth surfacing.
        let _ = session.SetIsBorderRequired(false);

        let latest = Arc::new(Mutex::new(LatestFrame {
            texture: None,
            arrived: 0,
            closed: false,
        }));

        let sink = Arc::clone(&latest);
        frame_pool
            .FrameArrived(&TypedEventHandler::new(
                move |pool: windows::core::Ref<'_, Direct3D11CaptureFramePool>, _| {
                    let Some(pool) = pool.as_ref() else {
                        return Ok(());
                    };
                    let frame = pool.TryGetNextFrame()?;
                    let surface = frame.Surface()?;
                    let access: IDirect3DDxgiInterfaceAccess = surface.cast()?;
                    // SAFETY: the surface is alive for the duration of this handler.
                    let texture: ID3D11Texture2D = unsafe { access.GetInterface() }?;
                    // A frame arriving after `stop` is dropped rather than
                    // handed to an encoder that is already finalizing.
                    if let Ok(mut slot) = sink.lock()
                        && !slot.closed
                    {
                        slot.texture = Some(texture);
                        slot.arrived = slot.arrived.wrapping_add(1);
                    }
                    Ok(())
                },
            ))
            .map_err(SnaphubError::record)?;

        session.StartCapture().map_err(SnaphubError::record)?;

        let staging = Self::create_staging(&device, width, height)?;

        Ok(Self {
            device,
            context,
            session,
            frame_pool,
            latest,
            staging,
            crop: D3D11_BOX {
                left,
                top,
                front: 0,
                right: left + width,
                bottom: top + height,
                back: 1,
            },
            width,
            height,
        })
    }

    fn create_staging(
        device: &ID3D11Device,
        width: u32,
        height: u32,
    ) -> Result<ID3D11Texture2D, SnaphubError> {
        let desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: 0,
            CPUAccessFlags: 0,
            MiscFlags: 0,
        };
        let mut texture = None;
        // SAFETY: `desc` is fully initialised and the out-parameter is a local.
        unsafe { device.CreateTexture2D(&desc, None, Some(&mut texture)) }
            .map_err(SnaphubError::record)?;
        texture.ok_or_else(|| SnaphubError::Record("Could not allocate a capture texture".into()))
    }

    pub fn device(&self) -> &ID3D11Device {
        &self.device
    }

    /// Copies the most recent frame into the staging texture.
    ///
    /// Returns `false` when nothing has arrived yet; the caller repeats the
    /// previous frame so the output keeps a constant frame rate.
    pub fn take_frame(&self) -> Result<bool, SnaphubError> {
        let texture = {
            let slot = self
                .latest
                .lock()
                .map_err(|_| SnaphubError::Record("Capture frame slot was poisoned".into()))?;
            slot.texture.clone()
        };
        let Some(texture) = texture else {
            return Ok(false);
        };
        // SAFETY: both textures belong to this device and the box is clamped to
        // the source bounds in `start`.
        unsafe {
            self.context.CopySubresourceRegion(
                &self.staging,
                0,
                0,
                0,
                0,
                &texture,
                0,
                Some(&self.crop),
            );
        }
        Ok(true)
    }

    /// The texture the encoder reads. Always the cropped output size.
    pub fn staging(&self) -> &ID3D11Texture2D {
        &self.staging
    }

    pub fn stop(&self) {
        if let Ok(mut slot) = self.latest.lock() {
            slot.closed = true;
            slot.texture = None;
        }
        let _ = self.session.Close();
        let _ = self.frame_pool.Close();
    }
}

impl Drop for CaptureStream {
    fn drop(&mut self) {
        self.stop();
    }
}
