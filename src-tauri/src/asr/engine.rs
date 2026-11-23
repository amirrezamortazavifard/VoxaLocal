use std::sync::Arc;
use crossbeam_channel::bounded;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

use crate::asr::model_manager::ModelManager;
use crate::asr::session::{spawn_session_worker, ActiveSession, SessionCommand};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionOrigin {
    Studio,
    QuickDictation,
}

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
        let default_threads = logical_cpus.clamp(1, 4);

        Self {
            language_mode: "fa".to_string(),
            beam_width: 1, // GREEDY (beam 1) matching tinyasr web demo for instantaneous real-time word typing
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

    pub fn active_origin(&self) -> Option<SessionOrigin> {
        self.active_session.read().as_ref().map(|s| s.origin)
    }

    pub fn active_session_id(&self) -> Option<String> {
        self.active_session.read().as_ref().map(|s| s.session_id.clone())
    }

    pub fn start_recording(
        &self,
        app: AppHandle,
        models: Arc<tinyasr::Models>,
        origin: SessionOrigin,
        client_session_id: Option<String>,
    ) -> Result<String, String> {
        let mut session_guard = self.active_session.write();
        if let Some(active) = session_guard.as_ref() {
            return Err(format!(
                "RECORDING_ALREADY_ACTIVE: A recording session ({:?}, id: {}) is already active.",
                active.origin, active.session_id
            ));
        }

        let session_id = client_session_id.unwrap_or_else(|| Uuid::new_v4().to_string());
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
            origin,
            command_sender: tx,
            worker_handle: Some(handle),
        };

        *session_guard = Some(active);
        log::info!("Recording session started [{:?}]: {}", origin, session_id);
        Ok(session_id)
    }

    pub fn feed_audio(&self, pcm_chunk: Vec<f32>) {
        if let Some(active) = self.active_session.read().as_ref() {
            if let Err(e) = active.command_sender.try_send(SessionCommand::Audio(pcm_chunk)) {
                log::warn!("Audio queue full or dropped: {e}");
            }
        }
    }

    pub fn stop_recording(&self, origin: SessionOrigin) -> Result<(), String> {
        let mut session_guard = self.active_session.write();
        if let Some(active) = session_guard.as_ref() {
            if active.origin != origin {
                return Err(format!(
                    "Cannot stop recording: active session belongs to {:?}, requested by {:?}",
                    active.origin, origin
                ));
            }
        }

        if let Some(mut active) = session_guard.take() {
            let _ = active.command_sender.send(SessionCommand::Finish);
            if let Some(handle) = active.worker_handle.take() {
                let _ = handle.join();
            }
            log::info!("Recording session stopped [{:?}]: {}", origin, active.session_id);
            Ok(())
        } else {
            Ok(())
        }
    }

    pub fn cancel_recording(&self, origin: SessionOrigin) -> Result<(), String> {
        let mut session_guard = self.active_session.write();
        if let Some(active) = session_guard.as_ref() {
            if active.origin != origin {
                return Err(format!(
                    "Cannot cancel recording: active session belongs to {:?}, requested by {:?}",
                    active.origin, origin
                ));
            }
        }

        if let Some(mut active) = session_guard.take() {
            let _ = active.command_sender.send(SessionCommand::Cancel);
            if let Some(handle) = active.worker_handle.take() {
                let _ = handle.join();
            }
            log::info!("Recording session cancelled [{:?}]: {}", origin, active.session_id);
            Ok(())
        } else {
            Ok(())
        }
    }

    pub fn force_cancel(&self) -> Result<(), String> {
        let mut session_guard = self.active_session.write();
        if let Some(mut active) = session_guard.take() {
            let _ = active.command_sender.send(SessionCommand::Cancel);
            if let Some(handle) = active.worker_handle.take() {
                let _ = handle.join();
            }
            log::info!("Recording session force-cancelled: {}", active.session_id);
        }
        Ok(())
    }
}
