//! Storage settings and maintenance commands.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_opener::OpenerExt;

use crate::db;
use crate::error::{AppError, AppResult};
use crate::files::dir_size;
use crate::projects::{projects_root, SETTING_PROJECTS_DIR};
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageSettings {
    pub project_directory: String,
    pub temp_directory: String,
    pub database_path: String,
}

fn current(state: &AppState) -> AppResult<StorageSettings> {
    let conn = state.db.lock().map_err(|_| AppError::storage("Database lock poisoned"))?;
    Ok(StorageSettings {
        project_directory: projects_root(state, &conn)?.to_string_lossy().into_owned(),
        temp_directory: state.paths.temp_dir.to_string_lossy().into_owned(),
        database_path: state.paths.database.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn storage_get(state: State<'_, AppState>) -> AppResult<StorageSettings> {
    current(&state)
}

#[tauri::command]
pub fn storage_set_project_dir(state: State<'_, AppState>, path: String) -> AppResult<StorageSettings> {
    let dir = PathBuf::from(&path);
    fs::create_dir_all(&dir)?;
    // Confirm the folder is writable before accepting it.
    let probe = dir.join(".cadify-write-test");
    fs::write(&probe, b"ok").map_err(|e| AppError::storage("The folder is not writable").with_detail(e.to_string()))?;
    let _ = fs::remove_file(probe);
    {
        let conn = state.db.lock().map_err(|_| AppError::storage("Database lock poisoned"))?;
        db::set_setting(&conn, SETTING_PROJECTS_DIR, &dir.to_string_lossy())?;
    }
    current(&state)
}

#[tauri::command]
pub fn storage_open_project_dir<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>) -> AppResult<()> {
    let dir = PathBuf::from(current(&state)?.project_directory);
    fs::create_dir_all(&dir)?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::new("UNKNOWN", "Could not open the folder").with_detail(e.to_string()))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearResult {
    pub freed_bytes: u64,
}

#[tauri::command]
pub async fn storage_clear_temp(state: State<'_, AppState>) -> AppResult<ClearResult> {
    // Never clear while a generation might be using its working directory.
    if !state.runs.lock().await.is_empty() {
        return Err(AppError::storage("Temporary files are in use by a running generation"));
    }
    let dir = state.paths.temp_dir.clone();
    let freed = tokio::task::spawn_blocking(move || -> AppResult<u64> {
        let size = dir_size(&dir);
        if dir.exists() {
            fs::remove_dir_all(&dir)?;
        }
        fs::create_dir_all(&dir)?;
        Ok(size)
    })
    .await
    .map_err(|e| AppError::storage("Cleanup task failed").with_detail(e.to_string()))??;
    Ok(ClearResult { freed_bytes: freed })
}
