use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crossbeam_channel::bounded;
use voxlocal_lib::shortcuts::state_machine::{PttState, PttStateMachine};
use voxlocal_lib::wake_word::{
    SherpaKwsDetector, StandbyBackend, StandbyControl, VoiceActivationMode,
    VoiceActivationSettings, VoiceActivationState, WakeWordDetector, WakeWordModelPaths,
    WakeWordService, DEFAULT_WAKE_PHRASE_ID,
};

struct MockStandbyBackend {
    mic_held: Arc<AtomicBool>,
    model_ok: bool,
    seen_devices: Arc<Mutex<Vec<Option<String>>>>,
    trigger_rx: Mutex<crossbeam_channel::Receiver<String>>,
}

impl MockStandbyBackend {
    fn new(model_ok: bool) -> (Arc<Self>, crossbeam_channel::Sender<String>) {
        let (tx, rx) = bounded(16);
        let backend = Arc::new(Self {
            mic_held: Arc::new(AtomicBool::new(false)),
            model_ok,
            seen_devices: Arc::new(Mutex::new(Vec::new())),
            trigger_rx: Mutex::new(rx),
        });
        (backend, tx)
    }
}

struct MicLease(Arc<AtomicBool>);

impl Drop for MicLease {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

impl StandbyBackend for MockStandbyBackend {
    fn preflight(
        &self,
        _app_data_dir: Option<&Path>,
        _resource_dir: Option<&Path>,
    ) -> Result<(), String> {
        if self.model_ok {
            Ok(())
        } else {
            Err("Mock missing KWS model files".to_string())
        }
    }

    fn run(&self, control: StandbyControl) -> Result<(), String> {
        self.seen_devices.lock().unwrap().push(control.device_name);
        let lease = MicLease(Arc::clone(&self.mic_held));
        self.mic_held.store(true, Ordering::Release);
        (control.on_listening)();

        let trigger_rx = self.trigger_rx.lock().unwrap().clone();
        let mut on_detected = Some(control.on_detected);
        loop {
            crossbeam_channel::select! {
                recv(control.stop_rx) -> _ => {
                    break;
                }
                recv(trigger_rx) -> msg => {
                    if let Ok(kw) = msg {
                        // Drop mic lease BEFORE signaling wake detection.
                        drop(lease);
                        if let Some(cb) = on_detected.take() {
                            let _ = cb(kw);
                        }
                        return Ok(());
                    } else {
                        break;
                    }
                }
            }
        }
        Ok(())
    }
}

#[test]
fn default_settings_are_disabled_hey_voxa_wake_only() {
    let settings = VoiceActivationSettings::default();
    assert!(!settings.enabled);
    assert_eq!(settings.wake_phrase, DEFAULT_WAKE_PHRASE_ID);
    assert_eq!(settings.mode, VoiceActivationMode::WakeOnly);
}

#[test]
fn persisted_settings_corrupt_or_unknown_phrase_handle_safely() {
    let fallback = VoiceActivationSettings::from_persisted_json("{corrupt-json");
    assert!(!fallback.enabled);
    assert_eq!(fallback.wake_phrase, "hey_voxa");
    assert_eq!(fallback.mode, VoiceActivationMode::WakeOnly);

    let sanitized =
        VoiceActivationSettings::from_persisted_json(r#"{"enabled":true,"wakePhrase":"alexa"}"#);
    assert!(sanitized.enabled);
    assert_eq!(sanitized.wake_phrase, "hey_voxa");
    assert_eq!(sanitized.mode, VoiceActivationMode::WakeOnly);

    let invalid = VoiceActivationSettings {
        enabled: true,
        wake_phrase: "custom_phrase".to_string(),
        mode: VoiceActivationMode::WakeOnly,
    };
    assert!(invalid.validate().is_err());
}

#[test]
fn duplicate_start_and_pause_are_idempotent() {
    let (backend, _tx) = MockStandbyBackend::new(true);
    let svc = WakeWordService::with_backend(backend.clone());

    assert_eq!(svc.state(), VoiceActivationState::Disabled);
    svc.pause();
    assert_eq!(svc.state(), VoiceActivationState::Disabled);

    svc.update_settings(
        VoiceActivationSettings {
            enabled: true,
            wake_phrase: "hey_voxa".to_string(),
            mode: VoiceActivationMode::WakeOnly,
        },
        false,
    )
    .expect("enable voice activation");

    assert_eq!(svc.state(), VoiceActivationState::Listening);
    svc.start_listening().expect("idempotent second start");
    assert_eq!(svc.state(), VoiceActivationState::Listening);
    assert_eq!(backend.seen_devices.lock().unwrap().len(), 1);

    svc.pause();
    assert_eq!(svc.state(), VoiceActivationState::PausedForRecording);
    assert!(!backend.mic_held.load(Ordering::Acquire));
    svc.pause();
    assert_eq!(svc.state(), VoiceActivationState::PausedForRecording);

    svc.resume_if_enabled();
    assert_eq!(svc.state(), VoiceActivationState::Listening);

    svc.shutdown();
    assert!(!backend.mic_held.load(Ordering::Acquire));
}

#[test]
fn standby_mic_released_before_wake_callback_and_single_trigger() {
    let (backend, tx) = MockStandbyBackend::new(true);
    let svc = WakeWordService::with_backend(backend.clone());

    let handoff_count = Arc::new(AtomicUsize::new(0));
    let saw_mic_released = Arc::new(AtomicBool::new(false));

    let handoff_count_cb = Arc::clone(&handoff_count);
    let saw_released_cb = Arc::clone(&saw_mic_released);
    let mic_held_ref = Arc::clone(&backend.mic_held);
    svc.set_wake_callback(Arc::new(move || {
        handoff_count_cb.fetch_add(1, Ordering::AcqRel);
        if !mic_held_ref.load(Ordering::Acquire) {
            saw_released_cb.store(true, Ordering::Release);
        }
    }));

    svc.update_settings(
        VoiceActivationSettings {
            enabled: true,
            wake_phrase: "hey_voxa".to_string(),
            mode: VoiceActivationMode::WakeOnly,
        },
        false,
    )
    .expect("enable voice activation");
    assert_eq!(svc.state(), VoiceActivationState::Listening);

    // Send rapid duplicate wake signals while only one listener is active.
    tx.send("Hey Voxa".to_string()).unwrap();
    tx.send("Hey Voxa".to_string()).unwrap();

    for _ in 0..40 {
        if handoff_count.load(Ordering::Acquire) >= 1 {
            break;
        }
        std::thread::sleep(Duration::from_millis(15));
    }

    assert_eq!(handoff_count.load(Ordering::Acquire), 1);
    assert!(
        saw_mic_released.load(Ordering::Acquire),
        "Standby mic stream must be released before handoff callback starts active capture"
    );
    assert_eq!(svc.state(), VoiceActivationState::PausedForRecording);

    svc.shutdown();
}

#[test]
fn wake_word_never_triggers_or_toggle_stops_during_active_states() {
    assert!(PttStateMachine::can_start_from_wake_word(
        PttState::Idle,
        false
    ));
    assert!(PttStateMachine::can_start_from_wake_word(
        PttState::Cancelled,
        false
    ));
    assert!(PttStateMachine::can_start_from_wake_word(
        PttState::Error,
        false
    ));

    // Must ignore when Quick Dictation is active, finalizing, or showing result overlay.
    assert!(!PttStateMachine::can_start_from_wake_word(
        PttState::Starting,
        false
    ));
    assert!(!PttStateMachine::can_start_from_wake_word(
        PttState::Recording,
        false
    ));
    assert!(!PttStateMachine::can_start_from_wake_word(
        PttState::Finalizing,
        false
    ));
    assert!(!PttStateMachine::can_start_from_wake_word(
        PttState::Result,
        false
    ));

    // Must ignore whenever Studio ASR session is active regardless of PTT state.
    assert!(!PttStateMachine::can_start_from_wake_word(
        PttState::Idle,
        true
    ));
}

#[test]
fn device_change_restarts_when_idle_and_stays_paused_when_busy() {
    let (backend, _tx) = MockStandbyBackend::new(true);
    let svc = WakeWordService::with_backend(backend.clone());

    svc.update_settings(
        VoiceActivationSettings {
            enabled: true,
            wake_phrase: "hey_voxa".to_string(),
            mode: VoiceActivationMode::WakeOnly,
        },
        false,
    )
    .unwrap();

    svc.reconfigure_device(Some("USB Mic".to_string()), false);
    assert_eq!(svc.state(), VoiceActivationState::Listening);

    svc.reconfigure_device(Some("Headset Mic".to_string()), true);
    assert_eq!(svc.state(), VoiceActivationState::PausedForRecording);

    svc.resume_if_enabled();
    assert_eq!(svc.state(), VoiceActivationState::Listening);

    let devices = backend.seen_devices.lock().unwrap().clone();
    assert_eq!(
        devices,
        vec![
            None,
            Some("USB Mic".to_string()),
            Some("Headset Mic".to_string())
        ]
    );

    svc.shutdown();
}

#[test]
fn missing_model_sets_error_state_without_panicking() {
    let (backend, _tx) = MockStandbyBackend::new(false);
    let svc = WakeWordService::with_backend(backend);

    let updated = svc
        .update_settings(
            VoiceActivationSettings {
                enabled: true,
                wake_phrase: "hey_voxa".to_string(),
                mode: VoiceActivationMode::WakeOnly,
            },
            false,
        )
        .expect("settings persistence succeeds even if model fails");

    assert!(updated.enabled);
    let status = svc.status();
    assert_eq!(status.state, VoiceActivationState::Error);
    assert!(!status.model_ready);
    assert!(status.error_message.is_some());

    // Disabling recovers cleanly back to Disabled.
    svc.update_settings(VoiceActivationSettings::default(), false)
        .unwrap();
    assert_eq!(svc.state(), VoiceActivationState::Disabled);
}

#[test]
fn sherpa_onnx_kws_model_load_and_wav_poc() {
    let Ok(paths) = WakeWordModelPaths::resolve(None, None) else {
        eprintln!("Skipping Sherpa-ONNX PoC test: models/wakeword not present.");
        return;
    };

    // 1. Verify production Hey Voxa keyword spotter loads cleanly on CPU (1 thread).
    let mut hey_voxa_detector =
        SherpaKwsDetector::from_paths_default(&paths).expect("load Hey Voxa KeywordSpotter");
    // Feed 320 ms of silence; must not false-trigger.
    let silence = vec![0.0_f32; 5120];
    assert_eq!(hey_voxa_detector.accept_samples(&silence), None);

    // 2. Verify streaming Hey Voxa survives long ambient silence before speaking without drift.
    let quiet_wav = std::env::temp_dir().join("16k_hey_voxa_1.wav");
    if quiet_wav.is_file() {
        let wave =
            sherpa_onnx::Wave::read(&quiet_wav.to_string_lossy()).expect("read hey_voxa wav");
        let ambient = vec![0.0005_f32; 16000 * 10]; // 10 seconds low ambient level
        for chunk in ambient.chunks(640) {
            assert_eq!(hey_voxa_detector.accept_samples(chunk), None);
        }
        let mut spotted_voxa = None;
        for chunk in wave.samples().chunks(640) {
            if let Some(found) = hey_voxa_detector.accept_samples(chunk) {
                spotted_voxa = Some(found);
                break;
            }
        }
        if spotted_voxa.is_none() {
            spotted_voxa = hey_voxa_detector.accept_samples(&vec![0.0_f32; 8000]);
        }
        assert_eq!(spotted_voxa.as_deref(), Some("hey_voxa"));
    }

    // 3. Verify Sherpa-ONNX KeywordSpotter spots real speech in upstream GigaSpeech test WAV if present.
    let test_wav = paths.dir.join("test_wavs").join("0.wav");
    let test_kw = paths.dir.join("test_wavs").join("test_keywords.txt");
    if test_wav.is_file() && test_kw.is_file() {
        let wave = sherpa_onnx::Wave::read(&test_wav.to_string_lossy()).expect("read test 0.wav");
        assert_eq!(wave.sample_rate(), 16000);
        let mut kw_paths = paths.clone();
        kw_paths.keywords_file = test_kw;
        let mut test_detector =
            SherpaKwsDetector::from_paths(&kw_paths, 1.0, 0.25).expect("load test_keywords");

        let mut spotted = None;
        for chunk in wave.samples().chunks(640) {
            if let Some(found) = test_detector.accept_samples(chunk) {
                spotted = Some(found);
                break;
            }
        }
        assert!(
            spotted.is_some(),
            "Expected upstream test_wavs/0.wav to trigger a keyword from test_keywords.txt"
        );
        println!(
            "Sherpa-ONNX KWS PoC detected keyword in 0.wav: {:?}",
            spotted
        );
    }
}
