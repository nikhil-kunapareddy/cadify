//! Runs the local CAD worker and relays its progress to the webview.
//!
//! Protocol (JSON lines, see docs/worker-protocol.md):
//!   stdin  <- {"type":"start", ...} then optional {"type":"answer", ...}
//!   stdout -> GenerationEvent objects, one per line
//! The API key is passed to the worker through its environment
//! (ANTHROPIC_API_KEY) and never crosses the webview boundary.

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, Command};
use tokio::sync::{oneshot, Mutex};

use crate::credentials::stored_key;
use crate::error::{AppError, AppResult};
use crate::projects;
use crate::state::AppState;

pub const EVENT_NAME: &str = "generation://event";
const EVENT_TYPES: [&str; 8] = [
    "stage_started",
    "stage_progress",
    "stage_completed",
    "warning",
    "clarification_required",
    "completed",
    "failed",
    "cancelled",
];
const TERMINAL: [&str; 3] = ["completed", "failed", "cancelled"];

pub struct RunHandle {
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    cancel: Option<oneshot::Sender<()>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationRequest {
    pub project_id: String,
    pub outputs: Vec<String>,
    pub drawing_file_name: String,
    pub page_count: u32,
    pub model_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Envelope {
    run_id: String,
    event: Value,
}

fn emit<R: Runtime>(app: &AppHandle<R>, run_id: &str, event: Value) {
    let _ = app.emit(EVENT_NAME, Envelope { run_id: run_id.to_string(), event });
}

fn failed(code: &str, message: &str, detail: Option<String>) -> Value {
    let mut error = json!({ "code": code, "message": message });
    if let Some(d) = detail {
        error["detail"] = Value::String(d);
    }
    json!({ "type": "failed", "error": error })
}

/// Resolves the worker command: $CADIFY_WORKER_CMD, then a bundled script,
/// then (debug builds only) the repository's worker with its own venv.
fn worker_command<R: Runtime>(app: &AppHandle<R>) -> AppResult<(String, Vec<String>)> {
    if let Ok(cmd) = std::env::var("CADIFY_WORKER_CMD") {
        let mut parts = cmd.split_whitespace().map(str::to_owned);
        if let Some(program) = parts.next() {
            return Ok((program, parts.collect()));
        }
    }
    if let Ok(dir) = app.path().resource_dir() {
        let script = dir.join("worker").join("cadify_worker.py");
        if script.is_file() {
            return Ok(("python3".into(), vec![script.to_string_lossy().into_owned()]));
        }
    }
    #[cfg(debug_assertions)]
    {
        let repo_worker = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("worker");
        let python = repo_worker.join(".venv").join("bin").join("python");
        let script = repo_worker.join("cadify_worker.py");
        if python.is_file() && script.is_file() {
            return Ok((python.to_string_lossy().into_owned(), vec![script.to_string_lossy().into_owned()]));
        }
    }
    Err(AppError::new("WORKER_UNAVAILABLE", "The CAD worker is not installed")
        .with_detail("Set CADIFY_WORKER_CMD or bundle worker/cadify_worker.py with the app."))
}

#[tauri::command]
pub async fn generation_start<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>, request: GenerationRequest) -> AppResult<String> {
    if request.outputs.is_empty() || request.outputs.iter().any(|o| o != "step" && o != "stl") {
        return Err(AppError::new("UNKNOWN", "Invalid output formats"));
    }
    let api_key = stored_key(&state.credentials)?.ok_or_else(|| AppError::new("API_KEY_MISSING", "No API key is configured"))?;
    let drawing = projects::drawing_path(&state, &request.project_id)?;
    if !drawing.is_file() {
        return Err(AppError::new("FILE_NOT_FOUND", "The drawing is missing from the project folder"));
    }
    let output_dir = projects::project_dir(&state, &request.project_id)?;
    let (program, args) = worker_command(&app)?;

    let run_id = uuid::Uuid::new_v4().to_string();
    let work_dir: PathBuf = state.paths.temp_dir.join(&run_id);
    std::fs::create_dir_all(&work_dir)?;

    let mut command = Command::new(&program);
    // Own process group, so cancelling also stops CAD subprocesses the
    // worker started (they would otherwise outlive a killed worker).
    #[cfg(unix)]
    command.process_group(0);
    let mut child = command
        .args(&args)
        .current_dir(&work_dir)
        .env("ANTHROPIC_API_KEY", api_key)
        .env("CADIFY_PROTOCOL_VERSION", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| AppError::new("WORKER_UNAVAILABLE", "The CAD worker could not be started").with_detail(e.to_string()))?;

    let mut stdin = child.stdin.take().ok_or_else(|| AppError::new("WORKER_PROTOCOL", "Worker stdin unavailable"))?;
    let stdout = child.stdout.take().ok_or_else(|| AppError::new("WORKER_PROTOCOL", "Worker stdout unavailable"))?;
    let mut stderr = child.stderr.take().ok_or_else(|| AppError::new("WORKER_PROTOCOL", "Worker stderr unavailable"))?;

    let start = json!({
        "type": "start",
        "runId": run_id,
        "drawingPath": drawing,
        "drawingFileName": request.drawing_file_name,
        "pageCount": request.page_count,
        "modelName": request.model_name,
        "outputDir": output_dir,
        "workDir": work_dir,
        "outputs": request.outputs,
    });
    stdin
        .write_all(format!("{start}\n").as_bytes())
        .await
        .map_err(|e| AppError::new("WORKER_PROTOCOL", "Could not send the job to the worker").with_detail(e.to_string()))?;

    let pid = child.id();
    let stdin = Arc::new(Mutex::new(Some(stdin)));
    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
    state.runs.lock().await.insert(run_id.clone(), RunHandle { stdin, cancel: Some(cancel_tx) });

    let task_app = app.clone();
    let task_run = run_id.clone();
    tauri::async_runtime::spawn(async move {
        let stderr_tail = tokio::spawn(async move {
            let mut buf = Vec::new();
            let _ = stderr.read_to_end(&mut buf).await;
            let text = String::from_utf8_lossy(&buf).into_owned();
            text.chars().rev().take(2000).collect::<Vec<_>>().into_iter().rev().collect::<String>()
        });

        let mut lines = BufReader::new(stdout).lines();
        let mut terminal = false;
        loop {
            tokio::select! {
                _ = &mut cancel_rx => {
                    kill_process_group(pid);
                    let _ = child.kill().await;
                    emit(&task_app, &task_run, json!({ "type": "cancelled" }));
                    terminal = true;
                    break;
                }
                line = lines.next_line() => match line {
                    Ok(Some(line)) if line.trim().is_empty() => continue,
                    Ok(Some(line)) => {
                        let event: Value = match serde_json::from_str(&line) {
                            Ok(v) => v,
                            Err(e) => {
                                emit(&task_app, &task_run, failed("WORKER_PROTOCOL", "The CAD worker sent invalid data", Some(e.to_string())));
                                terminal = true;
                                kill_process_group(pid);
                                let _ = child.kill().await;
                                break;
                            }
                        };
                        let kind = event.get("type").and_then(Value::as_str).unwrap_or("");
                        if !EVENT_TYPES.contains(&kind) {
                            continue; // ignore unknown events for forward compatibility
                        }
                        if TERMINAL.contains(&kind) {
                            terminal = true;
                        }
                        emit(&task_app, &task_run, event);
                    }
                    Ok(None) => break,
                    Err(e) => {
                        emit(&task_app, &task_run, failed("WORKER_PROTOCOL", "Lost contact with the CAD worker", Some(e.to_string())));
                        terminal = true;
                        break;
                    }
                }
            }
        }

        let status = child.wait().await;
        let tail = stderr_tail.await.unwrap_or_default();
        if !terminal {
            let code = status.ok().and_then(|s| s.code()).map(|c| c.to_string()).unwrap_or_else(|| "signal".into());
            emit(
                &task_app,
                &task_run,
                failed("WORKER_PROTOCOL", &format!("The CAD worker exited unexpectedly ({code})"), Some(tail)),
            );
        }
        let state = task_app.state::<AppState>();
        state.runs.lock().await.remove(&task_run);
        let _ = std::fs::remove_dir_all(state.paths.temp_dir.join(&task_run));
    });

    Ok(run_id)
}

fn kill_process_group(pid: Option<u32>) {
    #[cfg(unix)]
    if let Some(pid) = pid {
        // SAFETY: plain syscall; the group id is the worker's pid (process_group(0)).
        unsafe {
            libc::killpg(pid as libc::pid_t, libc::SIGKILL);
        }
    }
    #[cfg(not(unix))]
    let _ = pid;
}

#[tauri::command]
pub async fn generation_cancel(state: State<'_, AppState>, run_id: String) -> AppResult<()> {
    if let Some(handle) = state.runs.lock().await.get_mut(&run_id) {
        if let Some(tx) = handle.cancel.take() {
            let _ = tx.send(());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn generation_answer(state: State<'_, AppState>, run_id: String, answers: Value) -> AppResult<()> {
    let stdin = {
        let runs = state.runs.lock().await;
        let handle = runs.get(&run_id).ok_or_else(|| AppError::new("WORKER_PROTOCOL", "This generation is no longer running"))?;
        handle.stdin.clone()
    };
    let mut guard = stdin.lock().await;
    let pipe = guard.as_mut().ok_or_else(|| AppError::new("WORKER_PROTOCOL", "Worker input closed"))?;
    let line = json!({ "type": "answer", "answers": answers });
    pipe.write_all(format!("{line}\n").as_bytes())
        .await
        .map_err(|e| AppError::new("WORKER_PROTOCOL", "Could not send answers to the worker").with_detail(e.to_string()))?;
    pipe.flush().await.map_err(|e| AppError::new("WORKER_PROTOCOL", "Could not send answers").with_detail(e.to_string()))?;
    Ok(())
}
