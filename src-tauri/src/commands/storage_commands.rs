use std::sync::Arc;
use tauri::State;
use crate::storage::{HistoryRepository, SettingsRepository, TranscriptRecord};

#[tauri::command]
pub fn get_history(history_repo: State<'_, Arc<HistoryRepository>>) -> Result<Vec<TranscriptRecord>, String> {
    history_repo.list_all()
}

#[tauri::command]
pub fn save_transcript(
    record: TranscriptRecord,
    history_repo: State<'_, Arc<HistoryRepository>>,
) -> Result<(), String> {
    history_repo.save(&record)
}

#[tauri::command]
pub fn delete_history_item(
    id: String,
    history_repo: State<'_, Arc<HistoryRepository>>,
) -> Result<bool, String> {
    history_repo.delete(&id)
}

#[tauri::command]
pub fn clear_history(history_repo: State<'_, Arc<HistoryRepository>>) -> Result<(), String> {
    history_repo.clear()
}

#[tauri::command]
pub fn get_app_setting(
    key: String,
    settings_repo: State<'_, Arc<SettingsRepository>>,
) -> Result<Option<String>, String> {
    settings_repo.get(&key)
}

#[tauri::command]
pub fn set_app_setting(
    key: String,
    value: String,
    settings_repo: State<'_, Arc<SettingsRepository>>,
) -> Result<(), String> {
    settings_repo.set(&key, &value)
}
