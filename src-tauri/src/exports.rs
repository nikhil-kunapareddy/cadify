//! Exporting generated files to user-chosen locations.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOutcome {
    pub format: String,
    pub path: String,
    pub size_bytes: u64,
}

/// Returns the source file for `format`, but only if the project lists the
/// format as validated and available (set by project_record_generation).
fn exportable_source(state: &AppState, project_id: &str, format: &str) -> AppResult<PathBuf> {
    let file = match format {
        "step" => "model.step",
        "stl" => "model.stl",
        _ => return Err(AppError::new("EXPORT_FAILED", "Unsupported export format").with_detail(format.to_string())),
    };
    let conn = state.db.lock().map_err(|_| AppError::storage("Database lock poisoned"))?;
    let (dir, formats): (String, String) = conn.query_row(
        "SELECT directory, available_formats FROM projects WHERE id = ?1",
        params![project_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let formats: Vec<String> = serde_json::from_str(&formats).unwrap_or_default();
    if !formats.iter().any(|f| f == format) {
        return Err(AppError::new("ARTIFACT_NOT_FOUND", format!("{} has not been generated and validated", format.to_uppercase())));
    }
    let path = Path::new(&dir).join(file);
    if !path.is_file() {
        return Err(AppError::new("ARTIFACT_NOT_FOUND", "The model file is missing from the project folder"));
    }
    Ok(path)
}

fn copy_to(src: &Path, dest: &Path, format: &str) -> AppResult<ExportOutcome> {
    if let Some(parent) = dest.parent() {
        if !parent.is_dir() {
            return Err(AppError::new("EXPORT_FAILED", "The destination folder does not exist"));
        }
    }
    let size = fs::copy(src, dest).map_err(|e| AppError::new("EXPORT_FAILED", "The file could not be written").with_detail(e.to_string()))?;
    Ok(ExportOutcome { format: format.to_string(), path: dest.to_string_lossy().into_owned(), size_bytes: size })
}

#[tauri::command]
pub async fn export_artifact(state: State<'_, AppState>, project_id: String, format: String, destination: String) -> AppResult<ExportOutcome> {
    let src = exportable_source(&state, &project_id, &format)?;
    let dest = PathBuf::from(destination);
    tokio::task::spawn_blocking(move || copy_to(&src, &dest, &format))
        .await
        .map_err(|e| AppError::new("EXPORT_FAILED", "Export task failed").with_detail(e.to_string()))?
}

#[tauri::command]
pub async fn export_to_directory(
    state: State<'_, AppState>,
    project_id: String,
    formats: Vec<String>,
    directory: String,
    base_name: String,
    overwrite: bool,
) -> AppResult<Vec<ExportOutcome>> {
    let dir = PathBuf::from(directory);
    if !dir.is_dir() {
        return Err(AppError::new("EXPORT_FAILED", "The destination folder does not exist"));
    }
    let base = crate::files::sanitize_file_name(&base_name);
    let mut plan = Vec::new();
    for format in &formats {
        let src = exportable_source(&state, &project_id, format)?;
        plan.push((src, dir.join(format!("{base}.{format}")), format.clone()));
    }
    if !overwrite {
        let existing: Vec<String> = plan
            .iter()
            .filter(|(_, dest, _)| dest.exists())
            .filter_map(|(_, dest, _)| dest.file_name().map(|n| n.to_string_lossy().into_owned()))
            .collect();
        if !existing.is_empty() {
            return Err(AppError::new("EXPORT_EXISTS", "Files already exist").with_detail(existing.join(",")));
        }
    }
    tokio::task::spawn_blocking(move || plan.iter().map(|(src, dest, f)| copy_to(src, dest, f)).collect::<AppResult<Vec<_>>>())
        .await
        .map_err(|e| AppError::new("EXPORT_FAILED", "Export task failed").with_detail(e.to_string()))?
}

#[tauri::command]
pub fn reveal_path(path: String) -> AppResult<()> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return Err(AppError::new("FILE_NOT_FOUND", "The file no longer exists"));
    }
    tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|e| AppError::new("UNKNOWN", "Could not reveal in Finder").with_detail(e.to_string()))
}
