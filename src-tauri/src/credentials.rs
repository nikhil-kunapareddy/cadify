//! Anthropic API key management.
//!
//! The key is stored only in the macOS Keychain (generic password item).
//! It is cached in process memory after first read so the Keychain is not
//! queried repeatedly, and it is never returned to the webview: the frontend
//! receives `configured` plus the last four characters.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;
use std::time::Duration;

use chrono::Utc;
use serde::Serialize;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

const SERVICE: &str = "com.cadify.desktop";
const ACCOUNT: &str = "anthropic-api-key";
const MODELS_URL: &str = "https://api.anthropic.com/v1/models?limit=1";
const API_VERSION: &str = "2026-10-21";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValidation {
    pub state: &'static str,
    pub message: String,
    pub checked_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialStatus {
    pub configured: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    pub storage: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_validation: Option<KeyValidation>,
}

#[derive(Default)]
pub struct CredentialCache {
    /// None = not loaded yet; Some(None) = loaded, no key.
    key: Mutex<Option<Option<String>>>,
    last_validation: Mutex<Option<KeyValidation>>,
    /// Validation of a not-yet-saved candidate, keyed by its hash, so saving
    /// the same key right after validating it keeps the result.
    candidate: Mutex<Option<(u64, KeyValidation)>>,
}

#[cfg(test)]
impl CredentialCache {
    /// Test-only: pre-seeds the cache so tests never read the real Keychain.
    pub fn with_key(key: &str) -> Self {
        Self { key: Mutex::new(Some(Some(key.to_string()))), ..Default::default() }
    }
}

fn fingerprint(key: &str) -> u64 {
    let mut h = DefaultHasher::new();
    key.hash(&mut h);
    h.finish()
}

fn hint(key: &str) -> String {
    key.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect()
}

// ------------------------------------------------------------------ keychain

#[cfg(target_os = "macos")]
mod keychain {
    use security_framework::passwords::{delete_generic_password, get_generic_password, set_generic_password};

    use super::{ACCOUNT, SERVICE};
    use crate::error::{AppError, AppResult};

    const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;

    pub fn read() -> AppResult<Option<String>> {
        match get_generic_password(SERVICE, ACCOUNT) {
            Ok(bytes) => String::from_utf8(bytes)
                .map(Some)
                .map_err(|_| AppError::new("KEYCHAIN_ERROR", "The stored key is not valid text")),
            Err(e) if e.code() == ERR_SEC_ITEM_NOT_FOUND => Ok(None),
            Err(e) => Err(AppError::new("KEYCHAIN_ERROR", "Could not read from the Keychain").with_detail(e.to_string())),
        }
    }

    pub fn write(key: &str) -> AppResult<()> {
        set_generic_password(SERVICE, ACCOUNT, key.as_bytes())
            .map_err(|e| AppError::new("KEYCHAIN_ERROR", "Could not save to the Keychain").with_detail(e.to_string()))
    }

    pub fn delete() -> AppResult<()> {
        match delete_generic_password(SERVICE, ACCOUNT) {
            Ok(()) => Ok(()),
            Err(e) if e.code() == ERR_SEC_ITEM_NOT_FOUND => Ok(()),
            Err(e) => Err(AppError::new("KEYCHAIN_ERROR", "Could not delete from the Keychain").with_detail(e.to_string())),
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod keychain {
    use crate::error::{AppError, AppResult};
    fn unsupported<T>() -> AppResult<T> {
        Err(AppError::new("KEYCHAIN_ERROR", "Secure credential storage is only implemented for macOS"))
    }
    pub fn read() -> AppResult<Option<String>> {
        unsupported()
    }
    pub fn write(_: &str) -> AppResult<()> {
        unsupported()
    }
    pub fn delete() -> AppResult<()> {
        unsupported()
    }
}

/// Returns the stored key, reading the Keychain at most once per session.
pub fn stored_key(cache: &CredentialCache) -> AppResult<Option<String>> {
    let mut guard = cache.key.lock().map_err(|_| AppError::new("KEYCHAIN_ERROR", "Credential cache poisoned"))?;
    if let Some(cached) = guard.as_ref() {
        return Ok(cached.clone());
    }
    let key = keychain::read()?;
    *guard = Some(key.clone());
    Ok(key)
}

fn status_from(cache: &CredentialCache) -> AppResult<CredentialStatus> {
    let key = stored_key(cache)?;
    Ok(CredentialStatus {
        configured: key.is_some(),
        hint: key.as_deref().map(hint),
        storage: "keychain",
        last_validation: cache.last_validation.lock().ok().and_then(|v| v.clone()),
    })
}

fn check_format(key: &str) -> AppResult<()> {
    if key.len() < 20 || key.chars().any(char::is_whitespace) {
        return Err(AppError::new("API_KEY_INVALID", "That does not look like an Anthropic API key"));
    }
    Ok(())
}

// ------------------------------------------------------------------ commands

#[tauri::command]
pub fn credentials_status(state: State<'_, AppState>) -> AppResult<CredentialStatus> {
    status_from(&state.credentials)
}

#[tauri::command]
pub fn credentials_save(state: State<'_, AppState>, api_key: String) -> AppResult<CredentialStatus> {
    let key = api_key.trim().to_string();
    check_format(&key)?;
    keychain::write(&key)?;
    let cache = &state.credentials;
    *cache.key.lock().map_err(|_| AppError::new("KEYCHAIN_ERROR", "Credential cache poisoned"))? = Some(Some(key.clone()));
    let carried = cache
        .candidate
        .lock()
        .ok()
        .and_then(|c| c.clone())
        .filter(|(fp, _)| *fp == fingerprint(&key))
        .map(|(_, v)| v);
    if let Ok(mut last) = cache.last_validation.lock() {
        *last = carried;
    }
    status_from(cache)
}

#[tauri::command]
pub fn credentials_remove(state: State<'_, AppState>) -> AppResult<CredentialStatus> {
    keychain::delete()?;
    let cache = &state.credentials;
    if let Ok(mut k) = cache.key.lock() {
        *k = Some(None);
    }
    if let Ok(mut v) = cache.last_validation.lock() {
        *v = None;
    }
    status_from(cache)
}

#[tauri::command]
pub async fn credentials_validate(state: State<'_, AppState>, candidate: Option<String>) -> AppResult<KeyValidation> {
    let candidate = candidate.map(|c| c.trim().to_string()).filter(|c| !c.is_empty());
    let key = match &candidate {
        Some(c) => c.clone(),
        None => stored_key(&state.credentials)?.ok_or_else(|| AppError::new("API_KEY_MISSING", "No API key is configured"))?,
    };
    let result = validate_with_api(&state.http, &key).await;
    match candidate {
        Some(c) => {
            if let Ok(mut slot) = state.credentials.candidate.lock() {
                *slot = Some((fingerprint(&c), result.clone()));
            }
        }
        None => {
            if let Ok(mut last) = state.credentials.last_validation.lock() {
                *last = Some(result.clone());
            }
        }
    }
    Ok(result)
}

/// Lists one model: the cheapest authenticated call that proves the key works.
async fn validate_with_api(client: &reqwest::Client, key: &str) -> KeyValidation {
    let checked_at = Utc::now().to_rfc3339();
    let make = |state: &'static str, message: &str| KeyValidation { state, message: message.to_string(), checked_at: checked_at.clone() };
    if check_format(key).is_err() {
        return make("invalid", "That does not look like an Anthropic API key.");
    }
    let response = client
        .get(MODELS_URL)
        .header("x-api-key", key)
        .header("anthropic-version", API_VERSION)
        .timeout(Duration::from_secs(15))
        .send()
        .await;
    match response {
        Ok(res) => match res.status().as_u16() {
            200 => make("valid", "The key was accepted by the Anthropic API."),
            401 => make("invalid", "The Anthropic API rejected this key (authentication error)."),
            403 => make("permission_denied", "The key is valid but lacks permission for this request."),
            429 => make("rate_limited", "The key is valid, but the account is currently rate limited."),
            500..=599 => make("unreachable", "The Anthropic API is temporarily unavailable. Try again shortly."),
            code => make("unreachable", &format!("Unexpected response from the Anthropic API (HTTP {code}).")),
        },
        Err(e) if e.is_timeout() => make("unreachable", "The Anthropic API did not respond in time."),
        Err(e) if e.is_connect() => make("offline", "Could not reach api.anthropic.com. Check your internet connection."),
        Err(_) => make("unreachable", "The Anthropic API could not be reached."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hints_and_formats() {
        assert_eq!(hint("sk-ant-api03-abcdefWXYZ"), "WXYZ");
        assert!(check_format("short").is_err());
        assert!(check_format("sk-ant-api03 with spaces in it").is_err());
        assert!(check_format("sk-ant-api03-0123456789abcdef").is_ok());
    }
}
