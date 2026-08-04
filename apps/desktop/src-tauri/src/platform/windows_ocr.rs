use std::path::Path;

use windows::{
    Graphics::Imaging::BitmapDecoder,
    Media::Ocr::OcrEngine,
    Storage::{FileAccessMode, StorageFile},
    core::HSTRING,
};

use crate::error::SnaphubError;

pub struct OcrText {
    pub text: String,
    pub language: Option<String>,
}

pub fn recognize_file(path: &Path) -> Result<OcrText, SnaphubError> {
    let path = HSTRING::from(path.to_string_lossy().as_ref());
    let file = StorageFile::GetFileFromPathAsync(&path)
        .map_err(SnaphubError::capture)?
        .join()
        .map_err(SnaphubError::capture)?;
    let stream = file
        .OpenAsync(FileAccessMode::Read)
        .map_err(SnaphubError::capture)?
        .join()
        .map_err(SnaphubError::capture)?;
    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(SnaphubError::capture)?
        .join()
        .map_err(SnaphubError::capture)?;
    let bitmap = decoder
        .GetSoftwareBitmapAsync()
        .map_err(SnaphubError::capture)?
        .join()
        .map_err(SnaphubError::capture)?;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages().map_err(SnaphubError::capture)?;
    let result = engine
        .RecognizeAsync(&bitmap)
        .map_err(SnaphubError::capture)?
        .join()
        .map_err(SnaphubError::capture)?;
    let text = result.Text().map_err(SnaphubError::capture)?.to_string();
    let language = engine
        .RecognizerLanguage()
        .ok()
        .and_then(|value| value.LanguageTag().ok())
        .map(|value| value.to_string());
    Ok(OcrText { text, language })
}
