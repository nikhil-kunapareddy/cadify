//! CADify native backend: project storage (SQLite + project folders),
//! Keychain-backed credentials, exports and the CAD worker bridge.

mod credentials;
mod db;
mod error;
mod exports;
mod files;
mod generation;
mod projects;
mod settings;
mod state;

#[cfg(test)]
mod ipc_tests;

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, Runtime};

use crate::credentials::CredentialCache;
use crate::state::{AppState, Paths};

/// Every command exposed to the webview. Shared by the app and IPC tests.
pub(crate) fn handler<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        files::drawing_read,
        projects::project_list,
        projects::project_get,
        projects::project_create,
        projects::project_attach_drawing,
        projects::project_remove_drawing,
        projects::project_read_file,
        projects::project_write_artifact,
        projects::project_record_generation,
        projects::project_rename,
        projects::project_delete,
        projects::project_reveal,
        exports::export_artifact,
        exports::export_to_directory,
        exports::reveal_path,
        credentials::credentials_status,
        credentials::credentials_save,
        credentials::credentials_remove,
        credentials::credentials_validate,
        settings::storage_get,
        settings::storage_set_project_dir,
        settings::storage_open_project_dir,
        settings::storage_clear_temp,
        generation::generation_start,
        generation::generation_cancel,
        generation::generation_answer,
    ]
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let path = app.path();
            let data_dir = path.app_data_dir()?;
            let temp_dir = path.app_cache_dir()?.join("tmp");
            std::fs::create_dir_all(&data_dir)?;
            std::fs::create_dir_all(&temp_dir)?;
            let default_projects_dir = path
                .document_dir()
                .or_else(|_| path.home_dir())?
                .join("CADify Projects");
            let database = data_dir.join("cadify.db");
            let conn = db::open(&database)?;

            let http = reqwest::Client::builder()
                .user_agent(concat!("CADify/", env!("CARGO_PKG_VERSION")))
                .connect_timeout(Duration::from_secs(8))
                .build()?;

            app.manage(AppState {
                db: Mutex::new(conn),
                paths: Paths { temp_dir, database, default_projects_dir },
                credentials: CredentialCache::default(),
                runs: tokio::sync::Mutex::new(HashMap::new()),
                http,
            });
            Ok(())
        })
        .invoke_handler(handler())
        .run(tauri::generate_context!())
        .expect("error while running CADify");
}
