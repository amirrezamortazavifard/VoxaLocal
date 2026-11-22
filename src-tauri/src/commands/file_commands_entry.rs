use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use crate::asr::ModelManager;
use crate::commands::file_commands::{transcribe_file, FileTranscriptionResult};

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
