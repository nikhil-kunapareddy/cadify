//! End-to-end IPC tests: invoke commands exactly as the webview does
//! (camelCase JSON args, raw binary bodies, headers) against a mock runtime.
//! Keychain and Trash commands are excluded so tests never touch the
//! user's Keychain or Trash.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::ipc::{CallbackFn, InvokeBody, InvokeResponseBody};
use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

use crate::credentials::CredentialCache;
use crate::state::{AppState, Paths};

fn sample_pdf() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../samples/mounting-bracket-drawing.pdf")
}

struct Harness {
    _app: tauri::App<MockRuntime>,
    webview: WebviewWindow<MockRuntime>,
}

impl Harness {
    fn new(root: &Path) -> Self {
        Self::with_credentials(root, CredentialCache::default())
    }

    fn with_credentials(root: &Path, credentials: CredentialCache) -> Self {
        let app = mock_builder()
            .invoke_handler(crate::handler())
            .build(mock_context(noop_assets()))
            .expect("mock app");
        let temp_dir = root.join("tmp");
        std::fs::create_dir_all(&temp_dir).unwrap();
        let database = root.join("cadify.db");
        app.manage(AppState {
            db: Mutex::new(crate::db::open(&database).unwrap()),
            paths: Paths { temp_dir, database, default_projects_dir: root.join("projects") },
            credentials,
            runs: tokio::sync::Mutex::new(HashMap::new()),
            http: reqwest::Client::new(),
        });
        let webview = WebviewWindowBuilder::new(&app, "main", Default::default()).build().expect("webview");
        Self { _app: app, webview }
    }

    fn request(&self, cmd: &str, body: InvokeBody, headers: &[(&'static str, &str)]) -> Result<InvokeResponseBody, Value> {
        let mut map = tauri::http::HeaderMap::new();
        for (k, v) in headers {
            map.insert(*k, v.parse().unwrap());
        }
        get_ipc_response(
            &self.webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body,
                headers: map,
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
    }

    fn call(&self, cmd: &str, args: Value) -> Result<Value, Value> {
        self.request(cmd, InvokeBody::Json(args), &[]).map(|r| r.deserialize::<Value>().unwrap())
    }

    fn bytes(&self, cmd: &str, args: Value) -> Result<Vec<u8>, Value> {
        self.request(cmd, InvokeBody::Json(args), &[]).map(|r| match r {
            InvokeResponseBody::Raw(b) => b,
            InvokeResponseBody::Json(s) => serde_json::from_str::<Vec<u8>>(&s).unwrap(),
        })
    }

    fn write_artifact(&self, project_id: &str, kind: &str, bytes: &[u8]) -> Result<Value, Value> {
        self.request(
            "project_write_artifact",
            InvokeBody::Raw(bytes.to_vec()),
            &[("x-project-id", project_id), ("x-artifact-kind", kind)],
        )
        .map(|r| r.deserialize::<Value>().unwrap())
    }
}

fn code(err: Value) -> String {
    err["code"].as_str().unwrap_or_default().to_string()
}

#[test]
fn project_lifecycle_over_ipc() {
    let root = tempfile::tempdir().unwrap();
    let h = Harness::new(root.path());

    assert_eq!(h.call("project_list", json!({})).unwrap(), json!([]));

    // Drawing validation happens before any bytes are read.
    let not_pdf = root.path().join("notes.txt");
    std::fs::write(&not_pdf, "hello").unwrap();
    assert_eq!(code(h.bytes("drawing_read", json!({ "path": not_pdf })).unwrap_err()), "INVALID_FILE_TYPE");
    let pdf_bytes = std::fs::read(sample_pdf()).unwrap();
    assert_eq!(h.bytes("drawing_read", json!({ "path": sample_pdf() })).unwrap(), pdf_bytes);

    // Create and attach (camelCase args, as sent by the frontend).
    let project = h.call("project_create", json!({ "name": "Bracket Test" })).unwrap();
    let id = project["id"].as_str().unwrap().to_string();
    let dir = PathBuf::from(project["directory"].as_str().unwrap());
    assert!(dir.starts_with(root.path().join("projects")));
    assert_eq!(project["generationStatus"], "none");

    let drawing = json!({ "fileName": "mounting-bracket-drawing.pdf", "sizeBytes": pdf_bytes.len(), "pageCount": 2,
                          "pageSizes": [], "importedAt": "2026-11-24T00:00:00Z" });
    let attached = h
        .call("project_attach_drawing", json!({ "projectId": id, "sourcePath": sample_pdf(), "drawing": drawing, "thumbnail": "data:image/jpeg;base64,AA==" }))
        .unwrap();
    assert_eq!(attached["drawingFileName"], "mounting-bracket-drawing.pdf");
    assert_eq!(attached["drawing"]["pageCount"], 2);
    assert!(dir.join("mounting-bracket-drawing.pdf").is_file());
    assert_eq!(h.bytes("project_read_file", json!({ "projectId": id, "kind": "drawing" })).unwrap(), pdf_bytes);

    // Generated files arrive as raw binary bodies.
    assert_eq!(h.write_artifact(&id, "step", b"ISO-10303-21;").unwrap(), json!(13));
    h.write_artifact(&id, "stl", b"solid x").unwrap();
    h.write_artifact(&id, "preview", b"solid preview").unwrap();
    assert_eq!(code(h.write_artifact(&id, "../evil", b"x").unwrap_err()), "UNKNOWN");
    assert_eq!(h.bytes("project_read_file", json!({ "projectId": id, "kind": "preview" })).unwrap(), b"solid preview");

    // Nothing is exportable until a validated result is recorded.
    let out = root.path().join("out.step");
    assert_eq!(
        code(h.call("export_artifact", json!({ "projectId": id, "format": "step", "destination": out })).unwrap_err()),
        "ARTIFACT_NOT_FOUND"
    );

    let result = json!({ "runId": "r1", "artifacts": [
        { "format": "step", "fileName": "model.step", "sizeBytes": 13, "validated": true },
        { "format": "stl", "fileName": "model.stl", "sizeBytes": 7, "validated": false }
    ]});
    let recorded = h.call("project_record_generation", json!({ "projectId": id, "status": "succeeded", "result": result })).unwrap();
    assert_eq!(recorded["availableFormats"], json!(["step"]), "only validated formats become exportable");
    assert_eq!(recorded["generation"]["runId"], "r1");

    let exported = h.call("export_artifact", json!({ "projectId": id, "format": "step", "destination": out })).unwrap();
    assert_eq!(exported["sizeBytes"], 13);
    assert_eq!(std::fs::read(&out).unwrap(), b"ISO-10303-21;");
    assert_eq!(
        code(h.call("export_artifact", json!({ "projectId": id, "format": "stl", "destination": root.path().join("out.stl") })).unwrap_err()),
        "ARTIFACT_NOT_FOUND"
    );

    // Export to folder refuses to overwrite unless asked.
    let args = |overwrite: bool| json!({ "projectId": id, "formats": ["step"], "directory": root.path(), "baseName": "out", "overwrite": overwrite });
    let exists = h.call("export_to_directory", args(false)).unwrap_err();
    assert_eq!(code(exists.clone()), "EXPORT_EXISTS");
    assert_eq!(exists["detail"], "out.step");
    assert_eq!(h.call("export_to_directory", args(true)).unwrap().as_array().unwrap().len(), 1);

    // A failed rerun keeps the previous model.
    let failed = h.call("project_record_generation", json!({ "projectId": id, "status": "failed", "result": null })).unwrap();
    assert_eq!(failed["generationStatus"], "failed");
    assert_eq!(failed["availableFormats"], json!(["step"]));

    let renamed = h.call("project_rename", json!({ "id": id, "name": "Renamed" })).unwrap();
    assert_eq!(renamed["name"], "Renamed");
    let list = h.call("project_list", json!({})).unwrap();
    assert_eq!(list[0]["name"], "Renamed");
    assert_eq!(list[0]["thumbnail"], "data:image/jpeg;base64,AA==");

    // Removing the drawing clears generated files too.
    let removed = h.call("project_remove_drawing", json!({ "projectId": id })).unwrap();
    assert!(removed.get("drawing").is_none());
    assert_eq!(removed["availableFormats"], json!([]));
    assert!(!dir.join("model.step").exists());
    assert!(!dir.join("mounting-bracket-drawing.pdf").exists());

    assert_eq!(code(h.call("project_get", json!({ "id": "missing" })).unwrap_err()), "PROJECT_NOT_FOUND");
}

#[test]
fn storage_settings_over_ipc() {
    let root = tempfile::tempdir().unwrap();
    let h = Harness::new(root.path());
    let storage = h.call("storage_get", json!({})).unwrap();
    assert_eq!(PathBuf::from(storage["projectDirectory"].as_str().unwrap()), root.path().join("projects"));

    let custom = root.path().join("Custom Projects");
    let updated = h.call("storage_set_project_dir", json!({ "path": custom })).unwrap();
    assert_eq!(PathBuf::from(updated["projectDirectory"].as_str().unwrap()), custom);
    let project = h.call("project_create", json!({ "name": "In custom dir" })).unwrap();
    assert!(PathBuf::from(project["directory"].as_str().unwrap()).starts_with(&custom));

    std::fs::write(root.path().join("tmp").join("leftover.bin"), vec![0u8; 2048]).unwrap();
    let cleared = h.call("storage_clear_temp", json!({})).unwrap();
    assert_eq!(cleared["freedBytes"], 2048);
}

#[test]
fn generation_requires_key_and_worker() {
    let root = tempfile::tempdir().unwrap();
    let h = Harness::new(root.path());
    let project = h.call("project_create", json!({ "name": "Gen" })).unwrap();
    let request = json!({ "request": { "projectId": project["id"], "outputs": ["step", "dxf"],
                          "drawingFileName": "a.pdf", "pageCount": 1, "modelName": "Gen" } });
    // Invalid outputs are rejected before the Keychain is consulted.
    assert_eq!(code(h.call("generation_start", request).unwrap_err()), "UNKNOWN");
}

const STUB_WORKER: &str = r#"
import json, os, sys, time
start = json.loads(sys.stdin.readline())
def emit(e): print(json.dumps(e), flush=True)
if start["modelName"] == "slow":
    emit({"type": "stage_started", "stage": "prepare"})
    time.sleep(30)
emit({"type": "stage_started", "stage": "prepare"})
emit({"type": "stage_completed", "stage": "prepare", "detail": "ok"})
emit({"type": "clarification_required", "request": {"id": "c1", "summary": "s", "questions": []}})
answer = json.loads(sys.stdin.readline())
open(os.path.join(start["outputDir"], "model.step"), "w").write("ISO-10303-21;")
emit({"type": "completed", "result": {
    "runId": start["runId"],
    "answers": len(answer["answers"]),
    "keyOk": os.environ.get("ANTHROPIC_API_KEY") == "sk-ant-api03-test-key-0000000000",
    "outputs": start["outputs"],
}})
"#;

#[test]
fn worker_bridge_relays_events_answers_and_cancel() {
    use std::sync::mpsc;
    use std::time::Duration;
    use tauri::Listener;

    let root = tempfile::tempdir().unwrap();
    let script = root.path().join("stub_worker.py");
    std::fs::write(&script, STUB_WORKER).unwrap();
    // SAFETY: only this test reads CADIFY_WORKER_CMD.
    std::env::set_var("CADIFY_WORKER_CMD", format!("python3 {}", script.display()));

    let h = Harness::with_credentials(root.path(), CredentialCache::with_key("sk-ant-api03-test-key-0000000000"));
    let (tx, rx) = mpsc::channel::<Value>();
    h.webview.app_handle().listen_any("generation://event", move |e| {
        tx.send(serde_json::from_str(e.payload()).unwrap()).unwrap();
    });

    let project = h.call("project_create", json!({ "name": "Worker" })).unwrap();
    let id = project["id"].as_str().unwrap().to_string();
    let drawing = json!({ "fileName": "d.pdf", "pageCount": 2, "pageSizes": [], "sizeBytes": 1, "importedAt": "x" });
    h.call("project_attach_drawing", json!({ "projectId": id, "sourcePath": sample_pdf(), "drawing": drawing, "thumbnail": null }))
        .unwrap();

    let start = |model: &str| {
        h.call("generation_start", json!({ "request": { "projectId": id, "outputs": ["step"], "drawingFileName": "d.pdf",
                                                        "pageCount": 2, "modelName": model } }))
            .unwrap()
            .as_str()
            .unwrap()
            .to_string()
    };
    let next = |run: &str| loop {
        let env = rx.recv_timeout(Duration::from_secs(20)).expect("event");
        if env["runId"] == run {
            return env["event"].clone();
        }
    };

    // Happy path with a clarification round-trip over stdin.
    let run = start("bracket");
    assert_eq!(next(&run)["type"], "stage_started");
    assert_eq!(next(&run)["type"], "stage_completed");
    assert_eq!(next(&run)["type"], "clarification_required");
    h.call("generation_answer", json!({ "runId": run, "answers": [{ "questionId": "q", "optionId": "a" }] })).unwrap();
    let done = next(&run);
    assert_eq!(done["type"], "completed");
    assert_eq!(done["result"]["answers"], 1);
    assert_eq!(done["result"]["keyOk"], true, "API key reaches the worker via its environment");
    assert_eq!(done["result"]["outputs"], json!(["step"]));
    assert!(PathBuf::from(project["directory"].as_str().unwrap()).join("model.step").is_file());

    // Cancellation kills the worker and reports `cancelled`.
    let slow = start("slow");
    assert_eq!(next(&slow)["type"], "stage_started");
    h.call("generation_cancel", json!({ "runId": slow })).unwrap();
    assert_eq!(next(&slow)["type"], "cancelled");

    std::env::remove_var("CADIFY_WORKER_CMD");
}
