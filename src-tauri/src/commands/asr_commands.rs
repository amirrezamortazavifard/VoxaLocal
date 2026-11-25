use crate::asr::{AsrEngine, RecognitionSettings, SessionOrigin};
use crate::audio::AudioCapture;
use crate::commands::voice_activation_commands::is_voice_activation_paused_for_recording;
use crate::shortcuts::manager::ShortcutManager;
use crate::wake_word::WakeWordService;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_recognition_settings(
    asr_engine: State<'_, Arc<AsrEngine>>,
) -> Result<RecognitionSettings, String> {
    Ok(asr_engine.settings())
}

#[tauri::command]
pub fn update_recognition_settings(
    settings: RecognitionSettings,
    asr_engine: State<'_, Arc<AsrEngine>>,
) -> Result<RecognitionSettings, String> {
    asr_engine.update_settings(settings)
}

#[tauri::command]
pub fn start_recording(
    app: AppHandle,
    client_session_id: Option<String>,
    asr_engine: State<'_, Arc<AsrEngine>>,
    audio_capture: State<'_, Arc<AudioCapture>>,
    wake_word: State<'_, Arc<WakeWordService>>,
    shortcut_mgr: State<'_, Arc<ShortcutManager>>,
) -> Result<String, String> {
    let models = asr_engine.ensure_models_loaded()?;
    // Release standby wake-word stream strictly before opening active capture.
    wake_word.pause();

    let session_id = match asr_engine.start_recording(
        app.clone(),
        models,
        SessionOrigin::Studio,
        client_session_id,
    ) {
        Ok(sid) => sid,
        Err(e) => {
            if !is_voice_activation_paused_for_recording(&asr_engine, &shortcut_mgr) {
                wake_word.resume_if_enabled();
            }
            return Err(e);
        }
    };

    if let Err(e) = audio_capture.start_capture(app, Arc::clone(&asr_engine)) {
        let _ = asr_engine.cancel_recording(SessionOrigin::Studio);
        if !is_voice_activation_paused_for_recording(&asr_engine, &shortcut_mgr) {
            wake_word.resume_if_enabled();
        }
        return Err(format!("Failed to start microphone audio capture: {e}"));
    }

    Ok(session_id)
}

#[tauri::command]
pub fn stop_recording(
    asr_engine: State<'_, Arc<AsrEngine>>,
    audio_capture: State<'_, Arc<AudioCapture>>,
    wake_word: State<'_, Arc<WakeWordService>>,
    shortcut_mgr: State<'_, Arc<ShortcutManager>>,
) -> Result<(), String> {
    audio_capture.stop_capture();
    let res = asr_engine.stop_recording(SessionOrigin::Studio);
    if !is_voice_activation_paused_for_recording(&asr_engine, &shortcut_mgr) {
        wake_word.resume_if_enabled();
    }
    res
}

#[tauri::command]
pub fn cancel_recording(
    asr_engine: State<'_, Arc<AsrEngine>>,
    audio_capture: State<'_, Arc<AudioCapture>>,
    wake_word: State<'_, Arc<WakeWordService>>,
    shortcut_mgr: State<'_, Arc<ShortcutManager>>,
) -> Result<(), String> {
    audio_capture.stop_capture();
    let res = asr_engine.cancel_recording(SessionOrigin::Studio);
    if !is_voice_activation_paused_for_recording(&asr_engine, &shortcut_mgr) {
        wake_word.resume_if_enabled();
    }
    res
}
