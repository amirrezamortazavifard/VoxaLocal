use std::sync::Arc;
use tauri::{AppHandle, State};
use crate::asr::{AsrEngine, RecognitionSettings, SessionOrigin};
use crate::audio::AudioCapture;

#[tauri::command]
pub fn get_recognition_settings(asr_engine: State<'_, Arc<AsrEngine>>) -> Result<RecognitionSettings, String> {
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
) -> Result<String, String> {
    let models = asr_engine.ensure_models_loaded()?;
    let session_id = asr_engine.start_recording(app.clone(), models, SessionOrigin::Studio, client_session_id)?;

    if let Err(e) = audio_capture.start_capture(app, Arc::clone(&asr_engine)) {
        let _ = asr_engine.cancel_recording(SessionOrigin::Studio);
        return Err(format!("Failed to start microphone audio capture: {e}"));
    }

    Ok(session_id)
}

#[tauri::command]
pub fn stop_recording(
    asr_engine: State<'_, Arc<AsrEngine>>,
    audio_capture: State<'_, Arc<AudioCapture>>,
) -> Result<(), String> {
    audio_capture.stop_capture();
    asr_engine.stop_recording(SessionOrigin::Studio)
}

#[tauri::command]
pub fn cancel_recording(
    asr_engine: State<'_, Arc<AsrEngine>>,
    audio_capture: State<'_, Arc<AudioCapture>>,
) -> Result<(), String> {
    audio_capture.stop_capture();
    asr_engine.cancel_recording(SessionOrigin::Studio)
}
