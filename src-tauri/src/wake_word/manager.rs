use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use crossbeam_channel::{bounded, select, Receiver, Sender};
use parking_lot::RwLock;

use super::capture::open_standby_mic_stream;
use super::detector::{SherpaKwsDetector, WakeWordDetector, WakeWordModelPaths};
use super::settings::VoiceActivationSettings;
use super::state::{VoiceActivationState, VoiceActivationStatusPayload};

pub const VOICE_ACTIVATION_STATUS_EVENT: &str = "voice-activation://status";

pub type WakeTriggeredCallback = Arc<dyn Fn() + Send + Sync + 'static>;
pub type StatusEmitterCallback = Arc<dyn Fn(VoiceActivationStatusPayload) + Send + Sync + 'static>;

pub struct StandbyControl {
    pub stop_rx: Receiver<()>,
    pub device_name: Option<String>,
    pub app_data_dir: Option<PathBuf>,
    pub resource_dir: Option<PathBuf>,
    pub on_listening: Box<dyn FnOnce() + Send>,
    pub on_detected: Box<dyn FnOnce(String) -> bool + Send>,
}

pub trait StandbyBackend: Send + Sync {
    fn preflight(
        &self,
        app_data_dir: Option<&Path>,
        resource_dir: Option<&Path>,
    ) -> Result<(), String>;
    fn run(&self, control: StandbyControl) -> Result<(), String>;
}

pub struct ProductionStandbyBackend;

impl StandbyBackend for ProductionStandbyBackend {
    fn preflight(
        &self,
        app_data_dir: Option<&Path>,
        resource_dir: Option<&Path>,
    ) -> Result<(), String> {
        let _ = WakeWordModelPaths::resolve(app_data_dir, resource_dir)?;
        Ok(())
    }

    fn run(&self, control: StandbyControl) -> Result<(), String> {
        let paths = WakeWordModelPaths::resolve(
            control.app_data_dir.as_deref(),
            control.resource_dir.as_deref(),
        )?;
        let mut detector = SherpaKwsDetector::from_paths_default(&paths)?;
        let mut mic = open_standby_mic_stream(control.device_name.as_deref())?;

        (control.on_listening)();

        let mut on_detected = Some(control.on_detected);
        let mut result = Ok(());

        loop {
            select! {
                recv(control.stop_rx) -> _ => {
                    break;
                }
                recv(mic.sample_rx) -> msg => {
                    match msg {
                        Ok(block) => {
                            match mic.resampler.process(&block.data[..block.len]) {
                                Ok(pcm_16k) => {
                                    if !pcm_16k.is_empty() {
                                        if let Some(keyword) = detector.accept_samples(&pcm_16k) {
                                            // Release the standby CPAL stream strictly BEFORE invoking wake handoff.
                                            drop(mic);
                                            if let Some(cb) = on_detected.take() {
                                                let _ = cb(keyword);
                                            }
                                            return Ok(());
                                        }
                                    }
                                }
                                Err(e) => {
                                    result = Err(format!("Standby resampler error: {e}"));
                                    break;
                                }
                            }
                        }
                        Err(_) => {
                            result = Err("Standby microphone stream closed unexpectedly.".to_string());
                            break;
                        }
                    }
                }
            }
        }

        drop(mic);
        result
    }
}

struct WorkerRuntime {
    stop_tx: Sender<()>,
    thread_id: std::thread::ThreadId,
    finished: Arc<(Mutex<bool>, Condvar)>,
    join_handle: Option<JoinHandle<()>>,
}

pub struct WakeWordService {
    settings: RwLock<VoiceActivationSettings>,
    state: AtomicU8,
    last_error: RwLock<Option<String>>,
    model_ready: AtomicBool,
    device_name: RwLock<Option<String>>,
    app_data_dir: RwLock<Option<PathBuf>>,
    resource_dir: RwLock<Option<PathBuf>>,
    status_emitter: RwLock<Option<StatusEmitterCallback>>,
    on_wake_triggered: RwLock<Option<WakeTriggeredCallback>>,
    backend: Arc<dyn StandbyBackend>,
    lifecycle_lock: Mutex<()>,
    worker: Mutex<Option<WorkerRuntime>>,
}

impl WakeWordService {
    pub fn new() -> Arc<Self> {
        Self::with_backend(Arc::new(ProductionStandbyBackend))
    }

    pub fn with_backend(backend: Arc<dyn StandbyBackend>) -> Arc<Self> {
        Arc::new(Self {
            settings: RwLock::new(VoiceActivationSettings::default()),
            state: AtomicU8::new(VoiceActivationState::Disabled.as_u8()),
            last_error: RwLock::new(None),
            model_ready: AtomicBool::new(false),
            device_name: RwLock::new(None),
            app_data_dir: RwLock::new(None),
            resource_dir: RwLock::new(None),
            status_emitter: RwLock::new(None),
            on_wake_triggered: RwLock::new(None),
            backend,
            lifecycle_lock: Mutex::new(()),
            worker: Mutex::new(None),
        })
    }

    pub fn configure_runtime(
        &self,
        status_emitter: Option<StatusEmitterCallback>,
        app_data_dir: Option<PathBuf>,
        resource_dir: Option<PathBuf>,
        on_wake_triggered: Option<WakeTriggeredCallback>,
    ) {
        if status_emitter.is_some() {
            *self.status_emitter.write() = status_emitter;
        }
        *self.app_data_dir.write() = app_data_dir.clone();
        *self.resource_dir.write() = resource_dir.clone();
        if on_wake_triggered.is_some() {
            *self.on_wake_triggered.write() = on_wake_triggered;
        }
        let ready = self
            .backend
            .preflight(app_data_dir.as_deref(), resource_dir.as_deref())
            .is_ok();
        self.model_ready.store(ready, Ordering::Release);
    }

    pub fn set_wake_callback(&self, cb: WakeTriggeredCallback) {
        *self.on_wake_triggered.write() = Some(cb);
    }

    pub fn hydrate_settings(&self, settings: VoiceActivationSettings) {
        *self.settings.write() = settings.sanitized();
    }

    pub fn settings(&self) -> VoiceActivationSettings {
        self.settings.read().clone()
    }

    pub fn state(&self) -> VoiceActivationState {
        VoiceActivationState::from_u8(self.state.load(Ordering::Acquire))
    }

    pub fn status(&self) -> VoiceActivationStatusPayload {
        let settings = self.settings.read().clone();
        let data_dir = self.app_data_dir.read().clone();
        let res_dir = self.resource_dir.read().clone();
        let ready = self
            .backend
            .preflight(data_dir.as_deref(), res_dir.as_deref())
            .is_ok();
        self.model_ready.store(ready, Ordering::Release);

        VoiceActivationStatusPayload {
            enabled: settings.enabled,
            state: self.state(),
            wake_phrase: settings.wake_phrase,
            mode: settings.mode,
            error_message: self.last_error.read().clone(),
            model_ready: ready,
        }
    }

    pub fn update_settings(
        self: &Arc<Self>,
        new_settings: VoiceActivationSettings,
        is_busy_for_recording: bool,
    ) -> Result<VoiceActivationSettings, String> {
        let validated = new_settings.validate()?;
        let _guard = self
            .lifecycle_lock
            .lock()
            .map_err(|_| "Lifecycle lock poisoned".to_string())?;

        *self.settings.write() = validated.clone();
        if !validated.enabled {
            self.stop_worker_locked();
            *self.last_error.write() = None;
            self.set_state_and_emit(VoiceActivationState::Disabled);
            return Ok(validated);
        }

        if is_busy_for_recording {
            self.stop_worker_locked();
            *self.last_error.write() = None;
            self.set_state_and_emit(VoiceActivationState::PausedForRecording);
            return Ok(validated);
        }

        if let Err(e) = self.start_listening_locked() {
            log::warn!("Failed to start Voice Activation: {e}");
            return Ok(validated);
        }

        Ok(validated)
    }

    pub fn start_listening(self: &Arc<Self>) -> Result<(), String> {
        let _guard = self
            .lifecycle_lock
            .lock()
            .map_err(|_| "Lifecycle lock poisoned".to_string())?;
        self.start_listening_locked()
    }

    pub fn pause(self: &Arc<Self>) {
        let Ok(_guard) = self.lifecycle_lock.lock() else {
            return;
        };

        if !self.settings.read().enabled {
            self.stop_worker_locked();
            self.set_state_and_emit(VoiceActivationState::Disabled);
            return;
        }

        self.stop_worker_locked();
        self.set_state_and_emit(VoiceActivationState::PausedForRecording);
    }

    pub fn resume_if_enabled(self: &Arc<Self>) {
        let Ok(_guard) = self.lifecycle_lock.lock() else {
            return;
        };

        if !self.settings.read().enabled {
            self.stop_worker_locked();
            self.set_state_and_emit(VoiceActivationState::Disabled);
            return;
        }

        if let Err(e) = self.start_listening_locked() {
            log::warn!("Could not resume Voice Activation: {e}");
        }
    }

    pub fn reconfigure_device(
        self: &Arc<Self>,
        device_name: Option<String>,
        is_busy_for_recording: bool,
    ) {
        let Ok(_guard) = self.lifecycle_lock.lock() else {
            return;
        };

        *self.device_name.write() = device_name;

        if !self.settings.read().enabled {
            return;
        }

        if is_busy_for_recording {
            self.stop_worker_locked();
            self.set_state_and_emit(VoiceActivationState::PausedForRecording);
            return;
        }

        self.stop_worker_locked();
        if let Err(e) = self.start_listening_locked() {
            log::warn!("Could not restart Voice Activation after device change: {e}");
        }
    }

    pub fn shutdown(self: &Arc<Self>) {
        let Ok(_guard) = self.lifecycle_lock.lock() else {
            return;
        };
        self.stop_worker_locked();
        if self.settings.read().enabled {
            self.set_state_and_emit(VoiceActivationState::PausedForRecording);
        } else {
            self.set_state_and_emit(VoiceActivationState::Disabled);
        }
    }

    fn start_listening_locked(self: &Arc<Self>) -> Result<(), String> {
        if !self.settings.read().enabled {
            self.stop_worker_locked();
            self.set_state_and_emit(VoiceActivationState::Disabled);
            return Ok(());
        }

        let current = self.state();
        if matches!(
            current,
            VoiceActivationState::Listening | VoiceActivationState::Starting
        ) {
            if self.worker.lock().map(|w| w.is_some()).unwrap_or(false) {
                return Ok(());
            }
        }

        let data_dir = self.app_data_dir.read().clone();
        let res_dir = self.resource_dir.read().clone();

        if let Err(err) = self
            .backend
            .preflight(data_dir.as_deref(), res_dir.as_deref())
        {
            self.model_ready.store(false, Ordering::Release);
            *self.last_error.write() = Some(err.clone());
            self.set_state_and_emit(VoiceActivationState::Error);
            return Err(err);
        }
        self.model_ready.store(true, Ordering::Release);

        // Ensure no stale standby stream remains open before starting a fresh one.
        self.stop_worker_locked();

        *self.last_error.write() = None;
        self.set_state_and_emit(VoiceActivationState::Starting);

        let (stop_tx, stop_rx) = bounded::<()>(1);
        let (started_tx, started_rx) = bounded::<Result<(), String>>(1);
        let started_tx_fail = started_tx.clone();
        let finished = Arc::new((Mutex::new(false), Condvar::new()));
        let finished_worker = Arc::clone(&finished);

        let service_for_worker = Arc::clone(self);
        let backend = Arc::clone(&self.backend);
        let device_name = self.device_name.read().clone();

        let join_handle = std::thread::Builder::new()
            .name("wake-word-standby".to_string())
            .spawn(move || {
                let mut started_signal = Some(started_tx);
                let svc_listening = Arc::clone(&service_for_worker);
                let svc_detected = Arc::clone(&service_for_worker);

                let control = StandbyControl {
                    stop_rx,
                    device_name,
                    app_data_dir: data_dir,
                    resource_dir: res_dir,
                    on_listening: Box::new(move || {
                        let _ = svc_listening.state.compare_exchange(
                            VoiceActivationState::Starting.as_u8(),
                            VoiceActivationState::Listening.as_u8(),
                            Ordering::AcqRel,
                            Ordering::Acquire,
                        );
                        svc_listening.emit_status();
                        if let Some(tx) = started_signal.take() {
                            let _ = tx.send(Ok(()));
                        }
                    }),
                    on_detected: Box::new(move |keyword| {
                        let transitioned = svc_detected
                            .state
                            .compare_exchange(
                                VoiceActivationState::Listening.as_u8(),
                                VoiceActivationState::Triggered.as_u8(),
                                Ordering::AcqRel,
                                Ordering::Acquire,
                            )
                            .is_ok();

                        if !transitioned {
                            return false;
                        }

                        log::info!("Wake phrase triggered standby transition: '{keyword}'");
                        svc_detected.emit_status();

                        let svc_handoff = Arc::clone(&svc_detected);
                        let _ = std::thread::Builder::new()
                            .name("wake-word-handoff".to_string())
                            .spawn(move || {
                                svc_handoff.execute_wake_handoff();
                            });

                        true
                    }),
                };

                let run_res = backend.run(control);
                if let Err(err) = run_res {
                    log::error!("Standby wake-word loop error: {err}");
                    let cur = service_for_worker.state();
                    if cur == VoiceActivationState::Starting
                        || cur == VoiceActivationState::Listening
                    {
                        *service_for_worker.last_error.write() = Some(err.clone());
                        service_for_worker.set_state_and_emit(VoiceActivationState::Error);
                    }
                    let _ = started_tx_fail.try_send(Err(err));
                } else {
                    let _ = started_tx_fail.try_send(Ok(()));
                }
                service_for_worker.notify_worker_finished(&finished_worker);
            })
            .map_err(|e| {
                let msg = format!("Failed to spawn wake-word standby thread: {e}");
                *self.last_error.write() = Some(msg.clone());
                self.set_state_and_emit(VoiceActivationState::Error);
                msg
            })?;

        let thread_id = join_handle.thread().id();
        if let Ok(mut w) = self.worker.lock() {
            *w = Some(WorkerRuntime {
                stop_tx,
                thread_id,
                finished,
                join_handle: Some(join_handle),
            });
        }

        // Wait briefly for backend to either transition to Listening or fail startup before returning.
        match started_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => Ok(()),
            Ok(Err(e)) => Err(e),
            Err(_) => {
                if let Some(err) = self.last_error.read().clone() {
                    Err(err)
                } else if self.state() == VoiceActivationState::Listening {
                    Ok(())
                } else {
                    let msg = "Timed out initializing standby wake-word listener.".to_string();
                    self.stop_worker_locked();
                    *self.last_error.write() = Some(msg.clone());
                    self.set_state_and_emit(VoiceActivationState::Error);
                    Err(msg)
                }
            }
        }
    }

    fn execute_wake_handoff(self: &Arc<Self>) {
        let cb_opt = {
            let Ok(_guard) = self.lifecycle_lock.lock() else {
                return;
            };

            // Join the exiting standby worker thread from THIS separate handoff thread
            // so the microphone & worker are guaranteed completely torn down first.
            self.wait_and_clear_worker_locked();

            if self.state() != VoiceActivationState::Triggered || !self.settings.read().enabled {
                return;
            }

            self.set_state_and_emit(VoiceActivationState::PausedForRecording);
            self.on_wake_triggered.read().clone()
        };

        if let Some(cb) = cb_opt {
            cb();
        }
    }

    fn stop_worker_locked(&self) {
        let current = self.state();
        if matches!(
            current,
            VoiceActivationState::Listening
                | VoiceActivationState::Starting
                | VoiceActivationState::Triggered
        ) {
            self.set_state_and_emit(VoiceActivationState::Stopping);
        }

        let runtime_opt = self.worker.lock().ok().and_then(|mut w| w.take());
        if let Some(mut rt) = runtime_opt {
            let _ = rt.stop_tx.send(());
            if std::thread::current().id() != rt.thread_id {
                if let Some(handle) = rt.join_handle.take() {
                    let _ = handle.join();
                }
            }
        }
    }

    fn wait_and_clear_worker_locked(&self) {
        let runtime_opt = self.worker.lock().ok().and_then(|mut w| w.take());
        if let Some(mut rt) = runtime_opt {
            if std::thread::current().id() != rt.thread_id {
                if let Some(handle) = rt.join_handle.take() {
                    let _ = handle.join();
                } else {
                    let (lock, cvar) = &*rt.finished;
                    if let Ok(mut done) = lock.lock() {
                        while !*done {
                            let Ok(res) = cvar.wait_timeout(done, Duration::from_millis(50)) else {
                                break;
                            };
                            done = res.0;
                            if res.1.timed_out() {
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    fn notify_worker_finished(&self, finished: &Arc<(Mutex<bool>, Condvar)>) {
        let (lock, cvar) = &**finished;
        if let Ok(mut done) = lock.lock() {
            *done = true;
            cvar.notify_all();
        }
    }

    fn set_state_and_emit(&self, next: VoiceActivationState) {
        self.state.store(next.as_u8(), Ordering::Release);
        self.emit_status();
    }

    fn emit_status(&self) {
        let emitter_opt = self.status_emitter.read().clone();
        if let Some(emitter) = emitter_opt {
            let payload = self.status();
            emitter(payload);
        }
    }
}
