use crate::asr::AsrEngine;
use crate::audio::{list_input_devices as enumerate_devices, AudioCapture, AudioDeviceInfo};
use crate::commands::voice_activation_commands::is_voice_activation_paused_for_recording;
use crate::shortcuts::manager::ShortcutManager;
use crate::wake_word::WakeWordService;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn list_input_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    enumerate_devices()
}

#[tauri::command]
pub fn select_input_device(
    device_name: Option<String>,
    audio_capture: State<'_, Arc<AudioCapture>>,
    wake_word: State<'_, Arc<WakeWordService>>,
    asr_engine: State<'_, Arc<AsrEngine>>,
    shortcut_mgr: State<'_, Arc<ShortcutManager>>,
) -> Result<(), String> {
    audio_capture.set_selected_device(device_name.clone());
    let busy = is_voice_activation_paused_for_recording(&asr_engine, &shortcut_mgr);
    wake_word.reconfigure_device(device_name, busy);
    Ok(())
}

#[tauri::command]
pub fn get_audio_device_config(
    audio_capture: State<'_, Arc<AudioCapture>>,
) -> Result<Option<String>, String> {
    Ok(audio_capture.get_selected_device())
}
