//! Drawing file validation and small filesystem helpers.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use tauri::ipc::Response;

use crate::error::{AppError, AppResult};

/// Must match MAX_DRAWING_BYTES in src/config/app.ts.
pub const MAX_DRAWING_BYTES: u64 = 100 * 1024 * 1024;

pub fn has_pdf_header(bytes: &[u8]) -> bool {
    // The PDF spec tolerates up to 1024 bytes of junk before the header.
    let window = &bytes[..bytes.len().min(1024 + 5)];
    window.windows(5).any(|w| w == b"%PDF-")
}

/// Cheap structural checks before any bytes are read or copied.
pub fn validate_drawing_path(path: &Path) -> AppResult<u64> {
    let is_pdf = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);
    if !is_pdf {
        return Err(AppError::new("INVALID_FILE_TYPE", "Only PDF drawings are supported"));
    }
    let meta = fs::metadata(path).map_err(|_| AppError::new("FILE_NOT_FOUND", "The file could not be found"))?;
    if !meta.is_file() {
        return Err(AppError::new("INVALID_FILE_TYPE", "The selection is not a file"));
    }
    if meta.len() == 0 {
        return Err(AppError::new("PDF_EMPTY", "This file is empty"));
    }
    if meta.len() > MAX_DRAWING_BYTES {
        return Err(AppError::new("FILE_TOO_LARGE", "Drawings up to 100 MB are supported"));
    }
    let mut head = [0u8; 1029];
    let mut file = fs::File::open(path)?;
    let n = file.read(&mut head)?;
    if !has_pdf_header(&head[..n]) {
        return Err(AppError::new("PDF_CORRUPTED", "This file is not a valid PDF"));
    }
    Ok(meta.len())
}

/// Keeps a file name safe for use inside a project folder.
pub fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if matches!(c, '/' | '\\' | ':' | '\0') || c.is_control() { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_start_matches('.').to_string();
    if trimmed.is_empty() { "drawing.pdf".into() } else { trimmed }
}

/// Folder-friendly slug: "Mounting Bracket (Rev B)" -> "mounting-bracket-rev-b".
pub fn slugify(name: &str) -> String {
    let mut out = String::new();
    let mut dash = false;
    for c in name.chars() {
        if c.is_alphanumeric() {
            out.extend(c.to_lowercase());
            dash = false;
        } else if !dash && !out.is_empty() {
            out.push('-');
            dash = true;
        }
    }
    let out = out.trim_end_matches('-').chars().take(48).collect::<String>();
    if out.is_empty() { "project".into() } else { out }
}

/// Writes via a temporary file and rename so readers never see partial files.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let tmp = path.with_extension("partial");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path)?;
    Ok(())
}

pub fn dir_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else { return 0 };
    entries
        .flatten()
        .map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => dir_size(&e.path()),
            Ok(m) => m.len(),
            Err(_) => 0,
        })
        .sum()
}

/// Reads a user-selected drawing after validation and returns raw bytes
/// (delivered to the webview as an ArrayBuffer, not JSON).
#[tauri::command]
pub async fn drawing_read(path: String) -> AppResult<Response> {
    let path = PathBuf::from(path);
    validate_drawing_path(&path)?;
    let bytes = tokio::task::spawn_blocking(move || fs::read(path))
        .await
        .map_err(|e| AppError::new("UNKNOWN", "Read task failed").with_detail(e.to_string()))??;
    Ok(Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_pdf_header() {
        assert!(has_pdf_header(b"%PDF-1.7\n..."));
        assert!(has_pdf_header(b"\xef\xbb\xbf%PDF-1.4"));
        assert!(!has_pdf_header(b"PK\x03\x04 zip file"));
        assert!(!has_pdf_header(b""));
    }

    #[test]
    fn validates_paths() {
        let dir = tempfile::tempdir().unwrap();
        let good = dir.path().join("a.PDF");
        fs::write(&good, b"%PDF-1.4\nhello").unwrap();
        assert!(validate_drawing_path(&good).is_ok());

        let wrong_ext = dir.path().join("a.png");
        fs::write(&wrong_ext, b"%PDF-1.4").unwrap();
        assert_eq!(validate_drawing_path(&wrong_ext).unwrap_err().code, "INVALID_FILE_TYPE");

        let empty = dir.path().join("empty.pdf");
        fs::write(&empty, b"").unwrap();
        assert_eq!(validate_drawing_path(&empty).unwrap_err().code, "PDF_EMPTY");

        let fake = dir.path().join("fake.pdf");
        fs::write(&fake, b"not a pdf at all").unwrap();
        assert_eq!(validate_drawing_path(&fake).unwrap_err().code, "PDF_CORRUPTED");

        assert_eq!(validate_drawing_path(&dir.path().join("missing.pdf")).unwrap_err().code, "FILE_NOT_FOUND");
    }

    #[test]
    fn slugs_and_names() {
        assert_eq!(slugify("Mounting Bracket (Rev B)"), "mounting-bracket-rev-b");
        assert_eq!(slugify("***"), "project");
        assert_eq!(sanitize_file_name("../etc/passwd.pdf"), "_etc_passwd.pdf");
        assert_eq!(sanitize_file_name("  "), "drawing.pdf");
    }
}
