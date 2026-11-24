//! Error type shared by every command. Serialized as `{ code, message, detail? }`
//! and mapped to user-facing copy by the frontend (src/utils/errors.ts).

use serde::Serialize;

#[derive(Debug, Clone, Serialize, thiserror::Error)]
#[error("{code}: {message}")]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), detail: None }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    pub fn storage(message: impl Into<String>) -> Self {
        Self::new("STORAGE_ERROR", message)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        match err {
            rusqlite::Error::QueryReturnedNoRows => AppError::new("PROJECT_NOT_FOUND", "Project not found"),
            other => AppError::storage("Project database error").with_detail(other.to_string()),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => AppError::new("FILE_NOT_FOUND", "File not found").with_detail(err.to_string()),
            std::io::ErrorKind::PermissionDenied => {
                AppError::storage("Permission denied").with_detail(err.to_string())
            }
            _ => AppError::storage("File system error").with_detail(err.to_string()),
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::storage("Invalid stored data").with_detail(err.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(err: tauri::Error) -> Self {
        AppError::new("UNKNOWN", "Application error").with_detail(err.to_string())
    }
}
