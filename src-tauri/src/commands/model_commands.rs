use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use crate::asr::{ModelInfo, ModelManager};

#[tauri::command]
pub fn get_model_status(model_manager: State<'_, Arc<ModelManager>>) -> Result<ModelInfo, String> {
    model_manager.refresh_status();
    Ok(model_manager.get_info())
}

#[tauri::command]
pub fn import_model_files(
    asr_path: String,
    vad_path: String,
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<ModelInfo, String> {
    let asr_buf = PathBuf::from(asr_path);
    let vad_buf = PathBuf::from(vad_path);
    model_manager.import_model_files(&asr_buf, &vad_buf)
}

#[tauri::command]
pub fn load_asr_models(
    threads: Option<usize>,
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<ModelInfo, String> {
    let th = threads.unwrap_or(4);
    model_manager.load_models(th)?;
    Ok(model_manager.get_info())
}

#[tauri::command]
pub fn unload_asr_models(model_manager: State<'_, Arc<ModelManager>>) -> Result<ModelInfo, String> {
    model_manager.unload_models();
    Ok(model_manager.get_info())
}
