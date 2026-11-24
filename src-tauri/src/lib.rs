pub mod asr;
pub mod audio;
pub mod commands;
pub mod overlay;
pub mod shortcuts;
pub mod storage;
pub mod system;
pub mod tray;

use std::sync::Arc;
use tauri::{Manager, WindowEvent};

use crate::asr::{AsrEngine, ModelManager};
use crate::audio::AudioCapture;
use crate::commands::*;
use crate::shortcuts::manager::{QuickDictationSettings, ShortcutManager};
use crate::storage::{Database, HistoryRepository, SettingsRepository};
use crate::tray::manager::TrayManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    log::info!("Starting VoxLocal backend initialization...");

    let shortcut_manager = Arc::new(ShortcutManager::new());
    let shortcut_mgr_handler = Arc::clone(&shortcut_manager);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _shortcut, event| {
                    shortcut_mgr_handler.handle_shortcut_event(app, event.state());
                })
                .build(),
        )
        .setup({
            let shortcut_manager = Arc::clone(&shortcut_manager);
            move |app| {
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

                // Load persisted quick dictation settings if available
                if let Ok(Some(saved_qd_str)) = settings_repo.get("quick_dictation_settings") {
                    if let Ok(mut saved_qd) = serde_json::from_str::<QuickDictationSettings>(&saved_qd_str) {
                        // Enforce Toggle mode for desktop modal dictation workflow
                        saved_qd.mode = crate::shortcuts::state_machine::PttMode::Toggle;
                        log::info!("Restored persisted Quick Dictation settings: {:?}", saved_qd);
                        let _ = shortcut_manager.update_settings(&app.handle(), saved_qd);
                    }
                } else {
                    // Register default shortcut
                    let default_settings = shortcut_manager.settings();
                    let _ = shortcut_manager.register_shortcut(
                        &app.handle(),
                        &default_settings.shortcut,
                        default_settings.enabled,
                    );
                }

                // Initialize ASR and Audio subsystems
                let model_manager = Arc::new(ModelManager::new(&app_data_dir));

                // Auto-unpack pre-packaged AI models from bundled resources if not yet in AppData
                let mut model_search_dirs = Vec::new();
                if let Ok(res_dir) = app.path().resource_dir() {
                    model_search_dirs.push(res_dir.join("models"));
                    model_search_dirs.push(res_dir.join("_up_").join("models"));
                    model_search_dirs.push(res_dir);
                }
                if let Ok(exe_path) = std::env::current_exe() {
                    if let Some(exe_dir) = exe_path.parent() {
                        model_search_dirs.push(exe_dir.join("models"));
                        model_search_dirs.push(exe_dir.join("resources").join("models"));
                        model_search_dirs.push(exe_dir.to_path_buf());
                    }
                }
                model_search_dirs.push(std::path::PathBuf::from("src-tauri/models"));
                model_search_dirs.push(std::path::PathBuf::from("vendor/tinyasr/models"));
                model_search_dirs.push(std::path::PathBuf::from("models"));

                model_manager.auto_unpack_bundled_models(&model_search_dirs);
                if let Ok(Some(saved_model)) = settings_repo.get("active_asr_model") {
                    model_manager.set_active_filename(&saved_model);
                }

                let asr_engine = Arc::new(AsrEngine::new(Arc::clone(&model_manager)));
                let audio_capture = Arc::new(AudioCapture::new());
                let file_transcription_manager = Arc::new(crate::commands::file_commands::FileTranscriptionManager::default());
                let updater_state = Arc::new(crate::system::updater::UpdaterState::new(app_data_dir.clone()));

                // Setup system tray
                if let Err(e) = TrayManager::setup(&app.handle()) {
                    log::warn!("System tray setup warning: {e}");
                }

                // Register state with Tauri
                app.manage(model_manager);
                app.manage(Arc::clone(&asr_engine));
                app.manage(audio_capture);
                app.manage(file_transcription_manager);
                app.manage(history_repo.clone());
                app.manage(settings_repo.clone());
                app.manage(shortcut_manager);
                app.manage(Arc::clone(&updater_state));

                // Pre-load ASR models in RAM in background for zero-latency dictation
                let asr_engine_preload = Arc::clone(&asr_engine);
                std::thread::spawn(move || {
                    if let Err(e) = asr_engine_preload.ensure_models_loaded() {
                        log::warn!("Background ASR model pre-load: {e}");
                    } else {
                        log::info!("ASR models successfully pre-loaded into RAM for zero-latency dictation.");
                    }
                });

                // Silent background GitHub Releases update check (only downloads if online & newer version exists)
                let app_handle_upd = app.handle().clone();
                let updater_clone = Arc::clone(&updater_state);
                let settings_clone = settings_repo.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    let enabled = match settings_clone.get("auto_check_updates") {
                        Ok(Some(v)) => v != "false",
                        _ => true,
                    };
                    if enabled {
                        let _ = crate::system::updater::check_and_download_update(
                            &app_handle_upd,
                            &updater_clone,
                            true,
                        );
                    }
                });

                log::info!("VoxLocal backend services successfully registered.");
                Ok(())
            }
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // If the main studio window is closed, hide it to keep global push-to-talk alive
                if window.label() == "main" {
                    log::info!("Main studio window close intercepted: hiding window instead of exiting.");
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
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
            list_installed_models,
            set_active_model,
            delete_installed_model,
            fetch_remote_models,
            download_and_install_model,
            cancel_model_download,
            start_recording,
            stop_recording,
            cancel_recording,
            get_recognition_settings,
            update_recognition_settings,
            transcribe_audio_file,
            get_audio_file_waveform,
            start_file_transcription,
            cancel_file_transcription,
            get_history,
            save_transcript,
            delete_history_item,
            clear_history,
            get_quick_dictation_settings,
            update_quick_dictation_settings,
            trigger_quick_dictation_paste,
            dismiss_quick_dictation,
            open_in_studio,
            get_quick_dictation_state,
            start_quick_dictation_session,
            stop_quick_dictation_session,
            cancel_quick_dictation_session,
            get_app_setting,
            set_app_setting,
            get_autostart_enabled,
            set_autostart_enabled,
            get_auto_update_enabled,
            set_auto_update_enabled,
            check_for_updates,
            get_pending_update,
            install_and_restart_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VoxLocal application");
}
