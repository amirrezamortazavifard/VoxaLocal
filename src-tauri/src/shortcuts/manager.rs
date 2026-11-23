use std::sync::Arc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::asr::{AsrEngine, SessionOrigin};
use crate::audio::AudioCapture;
use crate::overlay::manager::OverlayManager;
use crate::shortcuts::state_machine::{PttMode, PttState, PttStateMachine};
use crate::system::foreground_window::capture_foreground_window;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickDictationSettings {
    pub enabled: bool,
    pub shortcut: String, // e.g. "Ctrl+Shift+Space"
    pub mode: PttMode,    // PushToTalk | Toggle
    pub auto_paste: bool,
    pub timeout_seconds: u32,
    pub show_waveform: bool,
}

impl Default for QuickDictationSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            shortcut: "Ctrl+Shift+B".to_string(),
            mode: PttMode::Toggle,
            auto_paste: false,
            timeout_seconds: 15,
            show_waveform: true,
        }
    }
}

pub struct ShortcutManager {
    settings: Arc<RwLock<QuickDictationSettings>>,
    state_machine: Arc<RwLock<PttStateMachine>>,
    registered_shortcut: Arc<RwLock<Option<String>>>,
    last_session_id: Arc<RwLock<Option<String>>>,
}

impl ShortcutManager {
    pub fn new() -> Self {
        let settings = QuickDictationSettings::default();
        let mode = settings.mode;
        Self {
            settings: Arc::new(RwLock::new(settings)),
            state_machine: Arc::new(RwLock::new(PttStateMachine::new(mode))),
            registered_shortcut: Arc::new(RwLock::new(None)),
            last_session_id: Arc::new(RwLock::new(None)),
        }
    }

    pub fn settings(&self) -> QuickDictationSettings {
        self.settings.read().clone()
    }

    pub fn state(&self) -> PttState {
        self.state_machine.read().state()
    }

    pub fn trigger_start(&self, app: &AppHandle) {
        let current_state = self.state_machine.read().state();
        if current_state == PttState::Idle
            || current_state == PttState::Result
            || current_state == PttState::Cancelled
            || current_state == PttState::Error
        {
            self.state_machine.write().on_press();
            self.start_quick_dictation(app);
        }
    }

    pub fn trigger_stop(&self, app: &AppHandle) {
        self.stop_quick_dictation(app);
    }

    pub fn update_settings(&self, app: &AppHandle, new_settings: QuickDictationSettings) -> Result<(), String> {
        let old_shortcut = self.settings.read().shortcut.clone();
        let old_enabled = self.settings.read().enabled;

        {
            let mut s = self.settings.write();
            *s = new_settings.clone();
            self.state_machine.write().set_mode(new_settings.mode);
        }

        // Re-register shortcut if key changed or enabled status changed
        if old_shortcut != new_settings.shortcut || old_enabled != new_settings.enabled {
            self.register_shortcut(app, &new_settings.shortcut, new_settings.enabled)?;
        }

        Ok(())
    }

    pub fn register_shortcut(&self, app: &AppHandle, shortcut_str: &str, enabled: bool) -> Result<(), String> {
        // Unregister previous
        if let Some(prev) = self.registered_shortcut.write().take() {
            if let Ok(sc) = prev.parse::<Shortcut>() {
                let _ = app.global_shortcut().unregister(sc);
            }
        }

        if !enabled || shortcut_str.trim().is_empty() {
            log::info!("Global shortcut disabled by settings.");
            return Ok(());
        }

        let shortcut = shortcut_str
            .parse::<Shortcut>()
            .map_err(|e| format!("Invalid shortcut format '{shortcut_str}': {e}"))?;

        app.global_shortcut()
            .register(shortcut)
            .map_err(|e| format!("Failed to register global shortcut '{shortcut_str}': {e}"))?;

        *self.registered_shortcut.write() = Some(shortcut_str.to_string());
        log::info!("Successfully registered global shortcut: '{}'", shortcut_str);
        Ok(())
    }

    pub fn handle_shortcut_event(&self, app: &AppHandle, state: ShortcutState) {
        if !self.settings.read().enabled {
            return;
        }

        match state {
            ShortcutState::Pressed => {
                log::info!("Global shortcut PRESSED");
                let mode = self.settings.read().mode;
                let current_state = self.state_machine.read().state();

                if mode == PttMode::Toggle && (current_state == PttState::Recording || current_state == PttState::Finalizing) {
                    // In Toggle mode, pressing while recording triggers stop
                    self.stop_quick_dictation(app);
                } else if current_state == PttState::Idle
                    || current_state == PttState::Result
                    || current_state == PttState::Cancelled
                    || current_state == PttState::Error
                {
                    self.state_machine.write().on_press();
                    self.start_quick_dictation(app);
                }
            }
            ShortcutState::Released => {
                log::info!("Global shortcut RELEASED");
                let mode = self.settings.read().mode;
                if mode == PttMode::PushToTalk {
                    let should_stop = self.state_machine.write().on_release();
                    if should_stop {
                        self.stop_quick_dictation(app);
                    }
                }
            }
        }
    }

    fn start_quick_dictation(&self, app: &AppHandle) {
        let asr_engine = app.state::<Arc<AsrEngine>>();
        let audio_capture = app.state::<Arc<AudioCapture>>();

        // 1. Check if studio or another session is recording
        if asr_engine.is_recording() {
            log::warn!("Cannot start Quick Dictation: another recording session is already active.");
            let _ = app.emit("quick-dictation://error", "RECORDING_ALREADY_ACTIVE: Recording is already in progress.");
            self.state_machine.write().on_error();
            return;
        }

        // 2. Ensure models are loaded
        let models = match asr_engine.ensure_models_loaded() {
            Ok(m) => m,
            Err(e) => {
                log::error!("Cannot start Quick Dictation: models not loaded: {e}");
                let _ = app.emit("quick-dictation://error", format!("MODEL_ERROR: {e}"));
                self.state_machine.write().on_error();
                return;
            }
        };

        // 3. Capture active foreground window BEFORE overlay opens
        capture_foreground_window();

        // 4. Start recognition session with QuickDictation origin
        let session_id = match asr_engine.start_recording(app.clone(), models, SessionOrigin::QuickDictation, None) {
            Ok(sid) => sid,
            Err(e) => {
                log::error!("Failed to start ASR session: {e}");
                let _ = app.emit("quick-dictation://error", e);
                self.state_machine.write().on_error();
                return;
            }
        };

        *self.last_session_id.write() = Some(session_id.clone());

        // 5. Start microphone capture
        if let Err(e) = audio_capture.start_capture(app.clone(), Arc::clone(&asr_engine)) {
            log::error!("Failed to start microphone: {e}");
            let _ = asr_engine.cancel_recording(SessionOrigin::QuickDictation);
            let _ = app.emit("quick-dictation://error", format!("MIC_ERROR: {e}"));
            self.state_machine.write().on_error();
            return;
        }

        // 6. Modal overlay temporarily kept hidden as requested by user to focus on main window real-time ASR
        // OverlayManager::center_on_active_monitor(app);
        // let _ = OverlayManager::show(app, true);

        // 7. Notify state machine and UI
        let immediate_stop = self.state_machine.write().on_started();
        let _ = app.emit("quick-dictation://started", session_id);

        if immediate_stop {
            log::info!("Shortcut was released during startup; immediately stopping session.");
            self.stop_quick_dictation(app);
        }
    }

    pub fn cancel_dictation_session(&self, app: &AppHandle) {
        log::info!("Cancelling Quick Dictation session...");
        let asr_engine = app.state::<Arc<AsrEngine>>();
        let audio_capture = app.state::<Arc<AudioCapture>>();

        audio_capture.stop_capture();
        let _ = asr_engine.cancel_recording(SessionOrigin::QuickDictation);
        self.state_machine.write().reset_to_idle();
        let _ = OverlayManager::hide(app);
        let _ = app.emit("quick-dictation://dismissed", ());
    }

    fn stop_quick_dictation(&self, app: &AppHandle) {
        log::info!("Stopping Quick Dictation session...");
        let asr_engine = app.state::<Arc<AsrEngine>>();
        let audio_capture = app.state::<Arc<AudioCapture>>();

        // Stop capture, flush resampler, finalize TinyASR session
        audio_capture.stop_capture();
        let _ = asr_engine.stop_recording(SessionOrigin::QuickDictation);

        self.state_machine.write().on_finalized();

        // Overlay temporarily kept hidden as requested by user
        // let _ = OverlayManager::show(app, false);
        let _ = app.emit("quick-dictation://finalized", ());
    }

    pub fn dismiss_overlay(&self, app: &AppHandle) {
        self.state_machine.write().reset_to_idle();
        let _ = OverlayManager::hide(app);
        let _ = app.emit("quick-dictation://dismissed", ());
    }
}
