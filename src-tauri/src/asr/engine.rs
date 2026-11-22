use std::sync::Arc;
use crossbeam_channel::bounded;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

use crate::asr::model_manager::ModelManager;
use crate::asr::session::{spawn_session_worker, ActiveSession, SessionCommand};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecognitionSettings {
    pub language_mode: String, // "fa", "en", "fa,en"
    pub beam_width: usize,     // 1: greedy, 4: default beam
    pub threads: usize,        // 1 to N
    pub auto_threads: bool,
}

impl Default for RecognitionSettings {
    fn default() -> Self {
        let logical_cpus = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        let default_threads = (logical_cpus / 2).clamp(1, 4);

        Self {
            language_mode: "fa".to_string(),
            beam_width: tinyasr::DEFAULT_BEAM,
            threads: default_threads,
            auto_threads: true,
        }
    }
}

pub struct AsrEngine {
    model_manager: Arc<ModelManager>,
    settings: Arc<RwLock<RecognitionSettings>>,
    active_session: Arc<RwLock<Option<ActiveSession>>>,
}

impl AsrEngine {
    pub fn new(model_manager: Arc<ModelManager>) -> Self {
        Self {
            model_manager,
            settings: Arc::new(RwLock::new(RecognitionSettings::default())),
            active_session: Arc::new(RwLock::new(None)),
        }
    }

    pub fn settings(&self) -> RecognitionSettings {
        self.settings.read().clone()
    }

    pub fn update_settings(&self, new_settings: RecognitionSettings) -> Result<RecognitionSettings, String> {
        let mut s = self.settings.write();
        *s = new_settings;
        log::info!("Updated ASR recognition settings: {:?}", *s);
        Ok(s.clone())
    }

    pub fn ensure_models_loaded(&self) -> Result<Arc<tinyasr::Models>, String> {
        if let Some(models) = self.model_manager.loaded_models() {
            return Ok(models);
        }

        let threads = self.settings.read().threads;
        self.model_manager.load_models(threads)?;

        self.model_manager
            .loaded_models()
            .ok_or_else(|| "Failed to obtain loaded models reference".to_string())
    }

    pub fn is_recording(&self) -> bool {
        self.active_session.read().is_some()
    }

    pub fn start_recording(&self, app: AppHandle, models: Arc<tinyasr::Models>) -> Result<String, String> {
        // Stop any currently active session first
        let _ = self.cancel_recording();

        let session_id = Uuid::new_v4().to_string();
        let (tx, rx) = bounded::<SessionCommand>(256);

        let settings = self.settings.read().clone();

        let handle = spawn_session_worker(
            app,
            session_id.clone(),
            models,
            settings.language_mode,
            settings.beam_width,
            rx,
        );

        let active = ActiveSession {
            session_id: session_id.clone(),
            command_sender: tx,
            worker_handle: Some(handle),
        };

        *self.active_session.write() = Some(active);
        log::info!("Recording session started: {}", session_id);
        Ok(session_id)
    }

    pub fn feed_audio(&self, pcm_chunk: Vec<f32>) {
        if let Some(active) = self.active_session.read().as_ref() {
            if let Err(e) = active.command_sender.try_send(SessionCommand::Audio(pcm_chunk)) {
                log::warn!("Audio queue full or dropped: {e}");
            }
        }
    }

    pub fn stop_recording(&self) -> Result<(), String> {
        let mut session_guard = self.active_session.write();
        if let Some(mut active) = session_guard.take() {
            let _ = active.command_sender.send(SessionCommand::Finish);
            if let Some(handle) = active.worker_handle.take() {
                let _ = handle.join();
            }
            log::info!("Recording session stopped: {}", active.session_id);
            Ok(())
        } else {
            Ok(())
        }
    }

    pub fn cancel_recording(&self) -> Result<(), String> {
        let mut session_guard = self.active_session.write();
        if let Some(mut active) = session_guard.take() {
            let _ = active.command_sender.send(SessionCommand::Cancel);
            if let Some(handle) = active.worker_handle.take() {
                let _ = handle.join();
            }
            log::info!("Recording session cancelled: {}", active.session_id);
            Ok(())
        } else {
            Ok(())
        }
    }
}
