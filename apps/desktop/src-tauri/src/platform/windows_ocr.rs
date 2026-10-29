//! Offline text recognition through `Windows.Media.Ocr`.
//!
//! The engine ships with Windows and uses the OCR packs of the user's display
//! languages, so this adds no model to the app and nothing leaves the machine.

use image::{RgbaImage, imageops};
use windows::{
    Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap},
    Media::Ocr::OcrEngine,
    Storage::Streams::DataWriter,
    Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx},
};

use crate::{
    domain::{RecognizedLineDto, RecognizedTextDto, RecognizedWordDto, Rect},
    error::SnaphubError,
};

/// Text below roughly 20 px tall reads poorly; doubling small captures is the
/// accuracy fix Microsoft documents for this engine.
const UPSCALE_BELOW_PIXELS: u32 = 1_600 * 900;

/// Recognises text in `image`. Word bounds are in `image` pixels.
///
/// Blocks on the WinRT async call, so run it off the main thread.
pub(crate) fn recognize(image: &RgbaImage) -> Result<RecognizedTextDto, SnaphubError> {
    // SAFETY: joins (or creates) this thread's MTA; a repeat call returns S_FALSE.
    // RPC_E_CHANGED_MODE on an STA thread is fine too, because WinRT works there.
    let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };

    let engine = OcrEngine::TryCreateFromUserProfileLanguages().map_err(|_| {
        SnaphubError::Ocr(
            "No text recognition language is installed. Add one in Settings > Time & language > Language & region.".into(),
        )
    })?;
    let language = engine
        .RecognizerLanguage()
        .and_then(|language| language.LanguageTag())
        .map(|tag| tag.to_string_lossy())
        .unwrap_or_default();

    let max_dimension = OcrEngine::MaxImageDimension().unwrap_or(10_000).max(1);
    let factor = recognition_factor(image.width(), image.height(), max_dimension);
    let prepared = if (factor - 1.0).abs() < f64::EPSILON {
        image.clone()
    } else {
        let width = ((f64::from(image.width()) * factor).round() as u32).max(1);
        let height = ((f64::from(image.height()) * factor).round() as u32).max(1);
        imageops::resize(image, width, height, imageops::FilterType::CatmullRom)
    };

    let bitmap = software_bitmap(&prepared)?;
    let result = engine
        .RecognizeAsync(&bitmap)
        .and_then(|operation| operation.join())
        .map_err(|error| SnaphubError::Ocr(format!("Text recognition failed: {error}")))?;

    let mut lines = Vec::new();
    for line in result.Lines().map_err(ocr_error)? {
        let mut words = Vec::new();
        for word in line.Words().map_err(ocr_error)? {
            let rect = word.BoundingRect().map_err(ocr_error)?;
            words.push(RecognizedWordDto {
                text: word.Text().map_err(ocr_error)?.to_string_lossy(),
                bounds: Rect {
                    x: f64::from(rect.X) / factor,
                    y: f64::from(rect.Y) / factor,
                    width: f64::from(rect.Width) / factor,
                    height: f64::from(rect.Height) / factor,
                },
            });
        }
        lines.push(RecognizedLineDto {
            text: line.Text().map_err(ocr_error)?.to_string_lossy(),
            words,
        });
    }
    let text = lines
        .iter()
        .map(|line| line.text.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    Ok(RecognizedTextDto {
        text,
        lines,
        language,
    })
}

/// The scale applied before recognition: 2× for small captures, and down to
/// the engine's limit for oversized ones. Bounds are divided back by it.
fn recognition_factor(width: u32, height: u32, max_dimension: u32) -> f64 {
    let longest = f64::from(width.max(height).max(1));
    let limit = f64::from(max_dimension);
    if longest > limit {
        return limit / longest;
    }
    if width.saturating_mul(height) < UPSCALE_BELOW_PIXELS && longest * 2.0 <= limit {
        return 2.0;
    }
    1.0
}

fn software_bitmap(image: &RgbaImage) -> Result<SoftwareBitmap, SnaphubError> {
    let mut bgra = image.as_raw().clone();
    for pixel in bgra.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }
    let writer = DataWriter::new().map_err(ocr_error)?;
    writer.WriteBytes(&bgra).map_err(ocr_error)?;
    let buffer = writer.DetachBuffer().map_err(ocr_error)?;
    let width = i32::try_from(image.width())
        .map_err(|_| SnaphubError::Ocr("Selection is too wide to read".into()))?;
    let height = i32::try_from(image.height())
        .map_err(|_| SnaphubError::Ocr("Selection is too tall to read".into()))?;
    SoftwareBitmap::CreateCopyFromBuffer(&buffer, BitmapPixelFormat::Bgra8, width, height)
        .map_err(ocr_error)
}

fn ocr_error(error: windows::core::Error) -> SnaphubError {
    SnaphubError::Ocr(format!("Text recognition failed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::recognition_factor;

    #[test]
    fn small_captures_are_doubled_within_the_engine_limit() {
        assert_eq!(recognition_factor(400, 120, 10_000), 2.0);
        assert_eq!(recognition_factor(6_000, 100, 10_000), 1.0);
    }

    #[test]
    fn large_captures_are_left_alone_or_shrunk_to_the_limit() {
        assert_eq!(recognition_factor(2_560, 1_440, 10_000), 1.0);
        assert_eq!(recognition_factor(20_000, 1_000, 10_000), 0.5);
    }

    /// Drives the real engine; needs an installed OCR language, so it is opt-in.
    #[test]
    #[ignore = "needs a Windows OCR language pack"]
    fn blank_image_reads_as_empty_text() {
        let image = image::RgbaImage::from_pixel(320, 120, image::Rgba([255, 255, 255, 255]));
        let recognized = super::recognize(&image).expect("engine should run");
        assert!(recognized.text.trim().is_empty());
        assert!(!recognized.language.is_empty());
    }
}
