use std::sync::Arc;
use tauri::State;
use crate::audio::{list_input_devices as enumerate_devices, AudioCapture, AudioDeviceInfo};

#[tauri::command]
pub fn list_input_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    enumerate_devices()
}

#[tauri::command]
pub fn select_input_device(
    device_name: Option<String>,
    audio_capture: State<'_, Arc<AudioCapture>>,
) -> Result<(), String> {
    audio_capture.set_selected_device(device_name);
    Ok(())
}

#[tauri::command]
pub fn get_audio_device_config(
    audio_capture: State<'_, Arc<AudioCapture>>,
) -> Result<Option<String>, String> {
    Ok(audio_capture.get_selected_device())
}
