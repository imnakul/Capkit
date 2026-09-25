use std::{cmp::Reverse, fs, path::Path};

use chrono::{DateTime, Utc};

use crate::{
    domain::{MediaFileDto, MediaFolderDto},
    error::SnaphubError,
};

/// Extensions the webview can render directly through the asset protocol.
const SUPPORTED_EXTENSIONS: [&str; 7] = ["png", "jpg", "jpeg", "bmp", "webp", "gif", "avif"];

/// Highest number of images a single attached folder contributes to the picker.
const MAX_FOLDER_IMAGES: usize = 300;

/// Returns `true` when the file extension is one the Showcase studio can render.
pub fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
        .is_some_and(|extension| SUPPORTED_EXTENSIONS.contains(&extension.as_str()))
}

/// Builds the transfer object for a single image the user picked from disk.
pub fn describe_image(path: &Path) -> Result<MediaFileDto, SnaphubError> {
    if !path.is_file() {
        return Err(SnaphubError::Export(format!(
            "{} could not be read as an image",
            path.display()
        )));
    }
    if !is_supported_image(path) {
        return Err(SnaphubError::Export(format!(
            "{} is not a supported image format",
            path.display()
        )));
    }
    let metadata = fs::metadata(path).map_err(SnaphubError::export)?;
    let modified = metadata.modified().map_err(SnaphubError::export)?;
    let file_name = path
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .ok_or_else(|| SnaphubError::Export("The selected image has no file name".into()))?;
    Ok(MediaFileDto {
        path: path.to_string_lossy().into_owned(),
        file_name,
        size_bytes: metadata.len(),
        modified_at: DateTime::<Utc>::from(modified).to_rfc3339(),
    })
}

/// Lists the renderable images inside `directory`, newest first.
///
/// Unreadable entries are skipped rather than failing the whole folder, so one
/// locked file cannot hide an otherwise usable background library.
pub fn read_folder(directory: &Path) -> Result<MediaFolderDto, SnaphubError> {
    if !directory.is_dir() {
        return Err(SnaphubError::Export(format!(
            "{} is not a folder",
            directory.display()
        )));
    }
    let mut entries = fs::read_dir(directory)
        .map_err(SnaphubError::export)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && is_supported_image(path))
        .filter_map(|path| {
            let metadata = fs::metadata(&path).ok()?;
            let modified = metadata.modified().ok()?;
            Some((path, modified))
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|(_, modified)| Reverse(*modified));
    entries.truncate(MAX_FOLDER_IMAGES);

    let name = directory
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| directory.to_string_lossy().into_owned());
    Ok(MediaFolderDto {
        path: directory.to_string_lossy().into_owned(),
        name: if name.is_empty() {
            directory.to_string_lossy().into_owned()
        } else {
            name
        },
        images: entries
            .into_iter()
            .filter_map(|(path, _)| describe_image(&path).ok())
            .collect(),
    })
}
