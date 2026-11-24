use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, State};

use crate::storage::SettingsRepository;
use crate::system::autostart;
use crate::system::updater::{
    check_and_download_update, install_and_restart, UpdateCheckResult, UpdateInfo, UpdaterState,
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    pub name: String,
    pub version: String,
    pub is_offline: bool,
    pub primary_language: String,
    pub os: String,
}

#[tauri::command]
pub fn get_app_status() -> AppStatus {
    AppStatus {
        name: "VoxaLocal".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        is_offline: true,
        primary_language: "fa".to_string(),
        os: std::env::consts::OS.to_string(),
    }
}

#[tauri::command]
pub fn get_autostart_enabled() -> Result<bool, String> {
    autostart::is_autostart_enabled()
}

#[tauri::command]
pub fn set_autostart_enabled(
    enabled: bool,
    settings_repo: State<'_, Arc<SettingsRepository>>,
) -> Result<bool, String> {
    autostart::set_autostart_enabled(enabled)?;
    let _ = settings_repo.set("auto_start", if enabled { "true" } else { "false" });
    Ok(enabled)
}

#[tauri::command]
pub fn get_auto_update_enabled(
    settings_repo: State<'_, Arc<SettingsRepository>>,
) -> Result<bool, String> {
    match settings_repo.get("auto_check_updates")? {
        Some(v) => Ok(v != "false"),
        None => Ok(true),
    }
}

#[tauri::command]
pub fn set_auto_update_enabled(
    enabled: bool,
    settings_repo: State<'_, Arc<SettingsRepository>>,
) -> Result<bool, String> {
    settings_repo.set("auto_check_updates", if enabled { "true" } else { "false" })?;
    Ok(enabled)
}

#[tauri::command]
pub async fn check_for_updates(
    app_handle: AppHandle,
    updater_state: State<'_, Arc<UpdaterState>>,
    silent: Option<bool>,
) -> Result<UpdateCheckResult, String> {
    let state_clone = Arc::clone(&updater_state);
    let is_silent = silent.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        check_and_download_update(&app_handle, &state_clone, is_silent)
    })
    .await
    .map_err(|e| format!("Update check task failed: {e}"))?
}

#[tauri::command]
pub fn get_pending_update(updater_state: State<'_, Arc<UpdaterState>>) -> Option<UpdateInfo> {
    updater_state.pending_update.lock().clone()
}

#[tauri::command]
pub fn install_and_restart_update(
    app_handle: AppHandle,
    updater_state: State<'_, Arc<UpdaterState>>,
) -> Result<(), String> {
    let pending = updater_state
        .pending_update
        .lock()
        .clone()
        .ok_or_else(|| "No downloaded update is currently pending".to_string())?;
    install_and_restart(&app_handle, &pending.asset_path)
}
