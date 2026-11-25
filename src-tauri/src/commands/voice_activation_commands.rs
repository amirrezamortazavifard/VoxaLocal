use std::sync::Arc;
use tauri::{AppHandle, State};

use crate::asr::AsrEngine;
use crate::shortcuts::manager::ShortcutManager;
use crate::shortcuts::state_machine::PttState;
use crate::storage::SettingsRepository;
use crate::wake_word::{
    VoiceActivationSettings, VoiceActivationStatusPayload, WakeWordService,
    VOICE_ACTIVATION_SETTINGS_KEY,
};

pub fn is_voice_activation_paused_for_recording(
    asr_engine: &AsrEngine,
    shortcut_mgr: &ShortcutManager,
) -> bool {
    if asr_engine.is_recording() {
        return true;
    }

    matches!(
        shortcut_mgr.state(),
        PttState::Starting | PttState::Recording | PttState::Finalizing | PttState::Result
    )
}

#[tauri::command]
pub fn get_voice_activation_settings(
    wake_word: State<'_, Arc<WakeWordService>>,
) -> Result<VoiceActivationSettings, String> {
    Ok(wake_word.settings())
}

#[tauri::command]
pub fn update_voice_activation_settings(
    _app: AppHandle,
    settings: VoiceActivationSettings,
    wake_word: State<'_, Arc<WakeWordService>>,
    settings_repo: State<'_, Arc<SettingsRepository>>,
    asr_engine: State<'_, Arc<AsrEngine>>,
    shortcut_mgr: State<'_, Arc<ShortcutManager>>,
) -> Result<VoiceActivationSettings, String> {
    let busy = is_voice_activation_paused_for_recording(&asr_engine, &shortcut_mgr);
    let updated = wake_word.update_settings(settings, busy)?;

    if let Ok(serialized) = serde_json::to_string(&updated) {
        let _ = settings_repo.set(VOICE_ACTIVATION_SETTINGS_KEY, &serialized);
    }

    Ok(updated)
}

#[tauri::command]
pub fn get_voice_activation_status(
    wake_word: State<'_, Arc<WakeWordService>>,
) -> Result<VoiceActivationStatusPayload, String> {
    Ok(wake_word.status())
}
