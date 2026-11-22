pub mod asr;
pub mod audio;
pub mod commands;
pub mod storage;

use std::sync::Arc;
use tauri::Manager;

use crate::asr::{AsrEngine, ModelManager};
use crate::audio::AudioCapture;
use crate::commands::*;
use crate::storage::{Database, HistoryRepository, SettingsRepository};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    log::info!("Starting VoxLocal backend initialization...");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_local_data_dir()
                .map_err(|e| format!("Failed to get app local data dir: {e}"))?;

            std::fs::create_dir_all(&app_data_dir)
                .map_err(|e| format!("Failed to create app data directory: {e}"))?;

            log::info!("VoxLocal app local data directory: {:?}", app_data_dir);

            // Initialize storage
            let database = Database::new(&app_data_dir)
                .map_err(|e| format!("Database initialization failed: {e}"))?;
            let history_repo = Arc::new(HistoryRepository::new(database.conn()));
            let settings_repo = Arc::new(SettingsRepository::new(database.conn()));

            // Initialize ASR and Audio subsystems
            let model_manager = Arc::new(ModelManager::new(&app_data_dir));
            let asr_engine = Arc::new(AsrEngine::new(Arc::clone(&model_manager)));
            let audio_capture = Arc::new(AudioCapture::new());

            // Register state with Tauri
            app.manage(model_manager);
            app.manage(asr_engine);
            app.manage(audio_capture);
            app.manage(history_repo);
            app.manage(settings_repo);

            log::info!("VoxLocal backend services successfully registered.");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_status,
            list_input_devices,
            select_input_device,
            get_audio_device_config,
            load_asr_models,
            unload_asr_models,
            get_model_status,
            import_model_files,
            start_recording,
            stop_recording,
            cancel_recording,
            get_recognition_settings,
            update_recognition_settings,
            transcribe_audio_file,
            get_history,
            save_transcript,
            delete_history_item,
            clear_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VoxLocal application");
}
