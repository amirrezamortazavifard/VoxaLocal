use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};
use crate::asr::ModelManager;
use crate::commands::file_commands::{
    cancel_file_transcription_job, get_waveform_info, start_file_transcription_job, transcribe_file,
    FileTranscriptionManager, FileTranscriptionResult, FileWaveformInfo,
};

#[tauri::command]
pub fn get_audio_file_waveform(
    file_path: String,
    num_bars: Option<usize>,
) -> Result<FileWaveformInfo, String> {
    let path = PathBuf::from(file_path);
    let bars = num_bars.unwrap_or(72).clamp(20, 160);
    get_waveform_info(&path, bars)
}

#[tauri::command]
pub fn start_file_transcription(
    app: AppHandle,
    file_path: String,
    language_mode: Option<String>,
    beam_width: Option<usize>,
    model_manager: State<'_, Arc<ModelManager>>,
    file_manager: State<'_, Arc<FileTranscriptionManager>>,
) -> Result<String, String> {
    let path = PathBuf::from(file_path);
    let lang = language_mode.unwrap_or_else(|| "fa".to_string());
    let beam = beam_width.unwrap_or(4);

    start_file_transcription_job(
        app,
        Arc::clone(&model_manager),
        Arc::clone(&file_manager),
        &path,
        &lang,
        beam,
    )
}

#[tauri::command]
pub fn cancel_file_transcription(
    file_manager: State<'_, Arc<FileTranscriptionManager>>,
) -> Result<(), String> {
    cancel_file_transcription_job(Arc::clone(&file_manager))
}

#[tauri::command]
pub fn transcribe_audio_file(
    file_path: String,
    language_mode: Option<String>,
    beam_width: Option<usize>,
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<FileTranscriptionResult, String> {
    let path = PathBuf::from(file_path);
    let lang = language_mode.unwrap_or_else(|| "fa".to_string());
    let beam = beam_width.unwrap_or(4);

    transcribe_file(Arc::clone(&model_manager), &path, &lang, beam)
}
