//! Project records (SQLite) and project folders on disk.
//!
//! Layout of a project folder:
//!   <projects root>/<slug>-<short id>/
//!       <original drawing name>.pdf
//!       model.step          (when generated)
//!       model.stl           (when generated)
//!       preview-mesh.stl    (viewport preview)

use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::State;

use crate::db;
use crate::error::{AppError, AppResult};
use crate::files::{sanitize_file_name, slugify, validate_drawing_path, write_atomic};
use crate::state::AppState;

pub const SETTING_PROJECTS_DIR: &str = "projects_directory";
const STAGED_DRAWING: &str = ".staged-drawing.pdf";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drawing_file_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub generation_status: String,
    pub available_formats: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    #[serde(flatten)]
    pub summary: ProjectSummary,
    pub directory: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drawing: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation: Option<Value>,
}

struct ProjectRow {
    project: Project,
    drawing_file: Option<String>,
}

const COLUMNS: &str = "id, name, directory, drawing_file, drawing_file_name, drawing_json, thumbnail, \
                       generation_status, generation_json, available_formats, created_at, updated_at";

fn from_row(row: &Row<'_>) -> rusqlite::Result<ProjectRow> {
    let parse = |s: Option<String>| s.and_then(|v| serde_json::from_str::<Value>(&v).ok());
    let formats: String = row.get(9)?;
    Ok(ProjectRow {
        drawing_file: row.get(3)?,
        project: Project {
            summary: ProjectSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                drawing_file_name: row.get(4)?,
                thumbnail: row.get(6)?,
                generation_status: row.get(7)?,
                available_formats: serde_json::from_str(&formats).unwrap_or_default(),
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            },
            directory: row.get(2)?,
            drawing: parse(row.get(5)?),
            generation: parse(row.get(8)?),
        },
    })
}

fn load(conn: &Connection, id: &str) -> AppResult<ProjectRow> {
    Ok(conn.query_row(&format!("SELECT {COLUMNS} FROM projects WHERE id = ?1"), params![id], from_row)?)
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

pub fn projects_root(state: &AppState, conn: &Connection) -> AppResult<PathBuf> {
    Ok(db::get_setting(conn, SETTING_PROJECTS_DIR)?
        .map(PathBuf::from)
        .unwrap_or_else(|| state.paths.default_projects_dir.clone()))
}

/// Maps an artifact kind from the frontend to its file inside the project.
fn artifact_file(kind: &str) -> AppResult<&'static str> {
    match kind {
        "step" => Ok("model.step"),
        "stl" => Ok("model.stl"),
        "preview" => Ok("preview-mesh.stl"),
        "drawing" => Ok(STAGED_DRAWING),
        _ => Err(AppError::new("UNKNOWN", "Unknown artifact kind").with_detail(kind.to_string())),
    }
}

fn clear_generated_files(dir: &Path) {
    for name in ["model.step", "model.stl", "preview-mesh.stl"] {
        let _ = fs::remove_file(dir.join(name));
    }
}

pub fn project_dir(state: &AppState, id: &str) -> AppResult<PathBuf> {
    let conn = state.db.lock().map_err(|_| AppError::storage("Database lock poisoned"))?;
    Ok(PathBuf::from(load(&conn, id)?.project.directory))
}

/// Absolute path of the project's drawing PDF.
pub fn drawing_path(state: &AppState, id: &str) -> AppResult<PathBuf> {
    let conn = state.db.lock().map_err(|_| AppError::storage("Database lock poisoned"))?;
    let row = load(&conn, id)?;
    let file = row.drawing_file.ok_or_else(|| AppError::new("FILE_NOT_FOUND", "This project has no drawing"))?;
    Ok(PathBuf::from(row.project.directory).join(file))
}

// ---------------------------------------------------------------- commands

#[tauri::command]
pub fn project_list(state: State<'_, AppState>) -> AppResult<Vec<ProjectSummary>> {
    let conn = state.db.lock().map_err(|_| AppError::storage("Database lock poisoned"))?;
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM projects ORDER BY updated_at DESC"))?;
    let rows = stmt.query_map([], from_row)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?.project.summary);
    }
    Ok(out)
}

#[tauri::command]
pub fn project_get(state: State<'_, AppState>, id: String) -> AppResult<Project> {
    let conn = state.db.lock().map_err(|_| AppError::storage("Database lock poisoned"))?;
    Ok(load(&conn, &id)?.project)
}

#[tauri::command]
pub fn project_create(state: State<'_, AppState>, name: String) -> AppResult<Project> {
    let conn = state.db.lock().map_err(|_| AppError::storage("Database lock poisoned"))?;
    let name = name.trim();
    let name = if name.is_empty() { "Untitled project" } else { name };
    let id = uuid::Uuid::new_v4().to_string();
    let root = projects_root(&state, &conn)?;
    let dir = root.join(format!("{}-{}", slugify(name), &id[..8]));
    fs::create_dir_all(&dir)?;
    let ts = now();
    conn.execute(
        "INSERT INTO projects (id, name, directory, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        params![id, name, dir.to_string_lossy(), ts],
    )?;
    Ok(load(&conn, &id)?.project)
}

#[tauri::command]
pub fn project_attach_drawing(
    state: State<'_, AppState>,
    project_id: String,
    source_path: Option<String>,
    drawing: Value,
    thumbnail: Option<String>,
) -> AppResult<Project> {
    let conn = state.db.lock().map_err(|_| AppError::storage("Database lock poisoned"))?;
    let row = load(&conn, &project_id)?;
    let dir = PathBuf::from(&row.project.directory);
    fs::create_dir_all(&dir)?;

    let file_name = drawing
        .get("fileName")
        .and_then(Value::as_str)
        .map(sanitize_file_name)
        .unwrap_or_else(|| "drawing.pdf".into());
    let target = dir.join(&file_name);

    match source_path {
        Some(src) => {
            let src = PathBuf::from(src);
            validate_drawing_path(&src)?;
            // Copy via a temp name so a failed copy never leaves a broken drawing.
            let tmp = dir.join(".incoming-drawing.pdf");
            fs::copy(&src, &tmp)?;
            fs::rename(&tmp, &target)?;
        }
        None => {
            let staged = dir.join(STAGED_DRAWING);
            if !staged.exists() {
                return Err(AppError::new("FILE_NOT_FOUND", "No staged drawing to attach"));
            }
            fs::rename(staged, &target)?;
        }
    }

    // Remove the previous drawing (if it had another name) and any model
    // generated from it.
    if let Some(old) = row.drawing_file.filter(|old| *old != file_name) {
        let _ = fs::remove_file(dir.join(old));
    }
    clear_generated_files(&dir);

    conn.execute(
        "UPDATE projects SET drawing_file = ?2, drawing_file_name = ?3, drawing_json = ?4, thumbnail = ?5,
                generation_status = 'none', generation_json = NULL, available_formats = '[]', updated_at = ?6
         WHERE id = ?1",
        params![
            project_id,
            file_name,
            drawing.get("fileName").and_then(Value::as_str).unwrap_or(&file_name),
            serde_json::to_string(&drawing)?,
            thumbnail,
            now()
        ],
    )?;
    Ok(load(&conn, &project_id)?.project)
}

#[tauri::command]
pub fn project_remove_drawing(state: State<'_, AppState>, project_id: String) -> AppResult<Project> {
    let conn = state.db.lock().map_err(|_| AppError::storage("Database lock poisoned"))?;
    let row = load(&conn, &project_id)?;
    let dir = PathBuf::from(&row.project.directory);
    if let Some(file) = row.drawing_file {
        let _ = fs::remove_file(dir.join(file));
    }
    clear_generated_files(&dir);
    conn.execute(
        "UPDATE projects SET drawing_file = NULL, drawing_file_name = NULL, drawing_json = NULL, thumbnail = NULL,
                generation_status = 'none', generation_json = NULL, available_formats = '[]', updated_at = ?2
         WHERE id = ?1",
        params![project_id, now()],
    )?;
    Ok(load(&conn, &project_id)?.project)
}

#[tauri::command]
pub async fn project_read_file(state: State<'_, AppState>, project_id: String, kind: String) -> AppResult<Response> {
    let path = if kind == "drawing" {
        drawing_path(&state, &project_id)?
    } else {
        project_dir(&state, &project_id)?.join(artifact_file(&kind)?)
    };
    let bytes = tokio::task::spawn_blocking(move || fs::read(&path))
        .await
        .map_err(|e| AppError::new("UNKNOWN", "Read task failed").with_detail(e.to_string()))?
        .map_err(|err| match err.kind() {
            std::io::ErrorKind::NotFound if kind == "drawing" => {
                AppError::new("FILE_NOT_FOUND", "The drawing is missing from the project folder")
            }
            std::io::ErrorKind::NotFound => AppError::new("ARTIFACT_NOT_FOUND", "The model file is missing from the project folder"),
            _ => AppError::from(err),
        })?;
    Ok(Response::new(bytes))
}

/// Receives raw bytes (no JSON encoding). Metadata travels in headers.
#[tauri::command]
pub async fn project_write_artifact(state: State<'_, AppState>, request: Request<'_>) -> AppResult<u64> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::new("UNKNOWN", "Expected a binary request body"));
    };
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
            .ok_or_else(|| AppError::new("UNKNOWN", format!("Missing {name} header")))
    };
    let project_id = header("x-project-id")?;
    let kind = header("x-artifact-kind")?;
    let dir = project_dir(&state, &project_id)?;
    fs::create_dir_all(&dir)?;
    let path = dir.join(artifact_file(&kind)?);
    let len = bytes.len() as u64;
    let data = bytes.clone();
    tokio::task::spawn_blocking(move || write_atomic(&path, &data))
        .await
        .map_err(|e| AppError::new("UNKNOWN", "Write task failed").with_detail(e.to_string()))??;
    Ok(len)
}

#[derive(Debug, Deserialize)]
struct ArtifactMeta {
    format: String,
    validated: bool,
}

#[tauri::command]
pub fn project_record_generation(
    state: State<'_, AppState>,
    project_id: String,
    status: String,
    result: Option<Value>,
) -> AppResult<Project> {
    const ALLOWED: [&str; 5] = ["none", "succeeded", "failed", "needs_clarification", "cancelled"];
    if !ALLOWED.contains(&status.as_str()) {
        return Err(AppError::new("UNKNOWN", "Invalid generation status").with_detail(status));
    }
    let conn = state.db.lock().map_err(|_| AppError::storage("Database lock poisoned"))?;
    let row = load(&conn, &project_id)?;
    let dir = PathBuf::from(&row.project.directory);

    if status == "succeeded" {
        let result = result.ok_or_else(|| AppError::new("UNKNOWN", "A successful generation needs a result"))?;
        // Only formats that were validated AND exist on disk become exportable.
        let artifacts: Vec<ArtifactMeta> = result
            .get("artifacts")
            .cloned()
            .map(serde_json::from_value)
            .transpose()?
            .unwrap_or_default();
        let formats: Vec<String> = artifacts
            .into_iter()
            .filter(|a| a.validated && artifact_file(&a.format).map(|f| dir.join(f).is_file()).unwrap_or(false))
            .map(|a| a.format)
            .collect();
        conn.execute(
            "UPDATE projects SET generation_status = ?2, generation_json = ?3, available_formats = ?4, updated_at = ?5 WHERE id = ?1",
            params![project_id, status, serde_json::to_string(&result)?, serde_json::to_string(&formats)?, now()],
        )?;
    } else {
        // A failed or cancelled run keeps the previous model available.
        conn.execute(
            "UPDATE projects SET generation_status = ?2, updated_at = ?3 WHERE id = ?1",
            params![project_id, status, now()],
        )?;
    }
    Ok(load(&conn, &project_id)?.project)
}

#[tauri::command]
pub fn project_rename(state: State<'_, AppState>, id: String, name: String) -> AppResult<Project> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::new("UNKNOWN", "Project name cannot be empty"));
    }
    let conn = state.db.lock().map_err(|_| AppError::storage("Database lock poisoned"))?;
    let changed = conn.execute("UPDATE projects SET name = ?2, updated_at = ?3 WHERE id = ?1", params![id, name, now()])?;
    if changed == 0 {
        return Err(AppError::new("PROJECT_NOT_FOUND", "Project not found"));
    }
    Ok(load(&conn, &id)?.project)
}

#[tauri::command]
pub fn project_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().map_err(|_| AppError::storage("Database lock poisoned"))?;
    let row = load(&conn, &id)?;
    let dir = PathBuf::from(&row.project.directory);
    if dir.exists() {
        trash::delete(&dir).map_err(|e| AppError::storage("Could not move the project folder to the Trash").with_detail(e.to_string()))?;
    }
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
    Ok(())
}

#[tauri::command]
pub fn project_reveal(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let target = drawing_path(&state, &id).ok().filter(|p| p.exists()).map(Ok).unwrap_or_else(|| project_dir(&state, &id))?;
    if !target.exists() {
        return Err(AppError::new("FILE_NOT_FOUND", "The project folder no longer exists"));
    }
    tauri_plugin_opener::reveal_item_in_dir(&target)
        .map_err(|e| AppError::new("UNKNOWN", "Could not reveal in Finder").with_detail(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn artifact_kinds_map_to_files() {
        assert_eq!(artifact_file("step").unwrap(), "model.step");
        assert_eq!(artifact_file("stl").unwrap(), "model.stl");
        assert_eq!(artifact_file("preview").unwrap(), "preview-mesh.stl");
        assert!(artifact_file("../../etc").is_err());
    }

    #[test]
    fn rows_round_trip() {
        let conn = db::open_in_memory().unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, directory, created_at, updated_at, available_formats)
             VALUES ('p1', 'Bracket', '/tmp/x', 't0', 't1', '[\"step\"]')",
            [],
        )
        .unwrap();
        let row = load(&conn, "p1").unwrap();
        assert_eq!(row.project.summary.name, "Bracket");
        assert_eq!(row.project.summary.available_formats, vec!["step".to_string()]);
        assert_eq!(row.project.summary.generation_status, "none");
        assert!(matches!(load(&conn, "missing"), Err(e) if e.code == "PROJECT_NOT_FOUND"));
    }
}
