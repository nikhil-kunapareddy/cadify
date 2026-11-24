use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;

use crate::credentials::CredentialCache;
use crate::generation::RunHandle;

pub struct Paths {
    pub temp_dir: PathBuf,
    pub database: PathBuf,
    pub default_projects_dir: PathBuf,
}

pub struct AppState {
    pub db: Mutex<Connection>,
    pub paths: Paths,
    pub credentials: CredentialCache,
    pub runs: tokio::sync::Mutex<HashMap<String, RunHandle>>,
    pub http: reqwest::Client,
}
