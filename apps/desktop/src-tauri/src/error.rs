use thiserror::Error;

#[derive(Debug, Error)]
pub enum SnaphubError {
    #[error("SH-CAPTURE-001: {0}")]
    Capture(String),
    #[error("SH-CLIPBOARD-001: {0}")]
    Clipboard(String),
    #[error("SH-EXPORT-001: {0}")]
    Export(String),
    #[error("SH-SESSION-001: {0}")]
    Session(String),
    #[error("SH-SHORTCUT-001: {0}")]
    Shortcut(String),
    #[error("SH-WINDOW-001: {0}")]
    Window(String),
}

impl SnaphubError {
    pub fn capture(error: impl std::fmt::Display) -> Self {
        Self::Capture(error.to_string())
    }

    pub fn clipboard(error: impl std::fmt::Display) -> Self {
        Self::Clipboard(error.to_string())
    }

    pub fn export(error: impl std::fmt::Display) -> Self {
        Self::Export(error.to_string())
    }
}

impl serde::Serialize for SnaphubError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
