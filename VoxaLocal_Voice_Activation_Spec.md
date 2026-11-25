# VoxaLocal — Voice Activation Implementation Specification

**Feature:** Wake Word / Voice Activation  
**Target wake phrase:** `Hey Voxa` (`hey_voxa` internal identifier)  
**Activation mode:** `wake_only`  
**Primary implementation stack:** Rust + CPAL + Sherpa-ONNX Keyword Spotter + existing Tauri/TinyASR pipeline  
**Document purpose:** Implementation contract and task brief for Antigravity  
**Repository:** `https://github.com/amirrezamortazavifard/VoxaLocal`  
**Target branch:** `main`

---

## 0. Instructions to the coding agent

Read `AGENTS.md` completely before changing any file. Its rules are mandatory. In particular:

- Keep all code identifiers, comments, logs, docstrings, and technical documentation in professional English.
- Route every new user-facing string through `src/i18n/translations.ts`; preserve Persian RTL and English LTR behavior.
- Store settings and runtime data in the application data directory / existing SQLite settings repository, never in the installation directory.
- Do not commit model binaries (`*.onnx`, `*.tzf`, installers, DLLs, build output, databases, or audio recordings) or any other files forbidden by the repository's Git Push Policy.
- Preserve the `vite.config.ts` watcher exclusions for `src-tauri` and `vendor`.
- Run `npm run build`, `cargo test --manifest-path src-tauri/Cargo.toml`, and `git status` before finishing.
- Commit and push only the permitted source/configuration/documentation assets, and only after checking the exact staged file list.

Do not begin by editing code. First inspect the current working tree and the current versions of all files listed in Section 2. The public `main` branch may have moved since this document was written. If a path, API, or function differs, adapt to the checked-out source rather than creating duplicate or obsolete modules.

Implement this feature end-to-end. Do not stop at a UI mock, a fake status indicator, or a placeholder detector. If the selected model cannot reliably recognize `Hey Voxa`, report the measured limitation and do not silently replace the user's wake phrase.

## 1. Product behavior and scope

### 1.1 Required user experience

When the user explicitly enables **Voice Activation** in Settings:

1. VoxaLocal may remain running in the system tray while its main Studio window is hidden.
2. A native Rust service opens the selected microphone and listens locally for exactly one wake phrase: **Hey Voxa**.
3. The standby audio is sent only to the local Keyword Spotting (KWS) engine. It must not be sent to TinyASR, saved to disk, uploaded, or transmitted to any network service.
4. When `Hey Voxa` is detected, the KWS capture stream must be stopped and released first.
5. Only after the KWS stream has been released, trigger the existing Quick Dictation start workflow. Reuse the existing ASR session creation, `AudioCapture`, foreground-window handling, Quick Dictation overlay, and UI events.
6. The floating Quick Dictation panel appears and starts its normal TinyASR recording session.
7. The user then begins the dictation. **The wake phrase itself is not part of the transcript.**
8. The user stops dictation using the existing Quick Dictation controls/hotkey. The result overlay remains available for review, editing, copying, or pasting.
9. Do not resume wake-word listening while the result/review overlay is still open. Resume only after that overlay is dismissed or the session is cancelled.
10. After the overlay is dismissed, return to standby listening if Voice Activation remains enabled.

This is strictly **Wake Only**. The user says the wake phrase, waits for the overlay to appear, and then dictates. Do not implement “wake and dictate”, pre-roll transcription, or automatic capture of words spoken immediately after the wake phrase in this first release.

### 1.2 Explicitly in scope

- One fixed English wake phrase: `Hey Voxa`.
- One activation policy: `wake_only`.
- An opt-in Enable/Disable control; default must be **disabled** for privacy.
- Persistent settings using the existing SQLite `SettingsRepository`.
- Native microphone capture with CPAL.
- Offline streaming keyword spotting with Sherpa-ONNX Rust API.
- Lifecycle coordination with Quick Dictation and Studio recording.
- Bilingual Persian/English Settings UI and status messages.
- Offline model packaging for Windows, macOS, and Linux release builds.
- Tests for lifecycle, duplicate triggers, and model/audio behavior.

### 1.3 Out of scope

- Persian wake phrase or Persian KWS model.
- User-created/custom wake phrases.
- “Hey Voxa, [dictation]” continuous capture.
- Voice commands, intent recognition, conversational assistant features, or TTS.
- Replacing TinyASR, Silero VAD, the current Quick Dictation overlay, or the global hotkey system.
- Cloud recognition, remote model downloads at runtime, telemetry, or audio recording during standby.
- A user-facing sensitivity slider until a representative test set has been evaluated and meaningful calibrated values exist.

## 2. Existing repository architecture inspected

The current public `main` branch identifies the following relevant files and behavior. Re-open these files in the active checkout before implementation.

| Existing path | Current responsibility | Required integration |
|---|---|---|
| `src-tauri/src/lib.rs` | Tauri bootstrap, app data directory, storage initialization, service creation, `app.manage`, tray initialization, invoke handler, hide-main-window behavior | Register `WakeWordService`; restore its settings; start it only when explicitly enabled; register new commands; shut it down cleanly |
| `src-tauri/src/audio/capture.rs` | Creates a CPAL input stream for an ASR session, converts input to mono blocks, uses a bounded Crossbeam channel, resamples to 16 kHz and feeds `AsrEngine`; `stop_capture()` releases the stream | Use as the design reference for a separate standby KWS capture path. Avoid running standby and ASR capture concurrently on the same microphone |
| `src-tauri/src/audio/mod.rs` | Exports the audio modules and `AudioCapture` | Export shared audio helpers only if they are genuinely reusable |
| `src-tauri/src/audio/devices.rs` | Enumerates/selects input devices and resolves the selected/default device | Reuse the same selected input device for standby capture |
| `src-tauri/src/audio/resampler.rs` | Audio resampling | Reuse `AudioResampler` to feed the KWS model at its required sample rate |
| `src-tauri/src/shortcuts/manager.rs` | `ShortcutManager`, settings, global shortcut events, `start_quick_dictation`, `stop_quick_dictation`, cancellation, overlay dismissal | Add a safe wake-word start entry point and coordinate pause/resume without changing normal hotkey semantics |
| `src-tauri/src/shortcuts/state_machine.rs` | `PttMode` and `PttStateMachine` (`Idle`, `Starting`, `Recording`, `Finalizing`, `Result`, `Cancelled`, `Error`) | Preserve the existing Toggle workflow. Avoid calling the current toggle method in a way that could stop an already active session |
| `src-tauri/src/commands/quick_dictation_commands.rs` | Tauri commands for Quick Dictation settings and lifecycle; persists `quick_dictation_settings` through SQLite | Add separate Voice Activation commands; do not overload `QuickDictationSettings` |
| `src-tauri/src/commands/asr_commands.rs` | Starts/stops/cancels Studio ASR sessions using the shared `AudioCapture` | Pause Voice Activation before Studio capture; re-arm after Studio stop/cancel |
| `src-tauri/src/commands/audio_commands.rs` | Lists and selects microphone devices | Reconfigure/restart the standby service after an input-device change |
| `src-tauri/src/storage/settings.rs` | Generic SQLite key/value `SettingsRepository::get` and `set` | Persist `voice_activation_settings` using this repository |
| `src-tauri/Cargo.toml` | Existing CPAL, Rubato, Crossbeam, Tauri, TinyASR dependencies | Add a pinned, verified `sherpa-onnx` Rust dependency and update `Cargo.lock` |
| `src-tauri/tauri.conf.json` | Tauri windows and bundled resources; currently includes `models/*` | Bundle the wake-word model directory as a resource without committing model binaries |
| `src/i18n/translations.ts` | Persian and English application strings | Add all Voice Activation labels, descriptions, status, and error strings in both languages |
| Settings component containing `quickDictationSectionTitle` | Current Quick Dictation settings section | Locate with search and add the Voice Activation card in the existing settings design; do not invent a parallel Settings page |
| `.github/workflows/release.yml` | Windows/macOS/Linux release matrix and Tauri packaging | Add a deterministic model-staging step before packaging |
| `AGENTS.md`, `LICENSE_NOTICES.md`, `OFFLINE_ARCHITECTURE.md`, `ARCHITECTURE.md` | Agent rules, third-party notices, offline and architecture documentation | Follow and update these docs as appropriate |

### 2.1 Observed current flow

- `AudioCapture::start_capture()` creates the CPAL stream and processing thread. The processing loop resamples audio to 16 kHz and calls `AsrEngine::feed_audio()`.
- `AudioCapture::stop_capture()` signals the worker, joins the capture thread, and releases the CPAL stream.
- `ShortcutManager::start_quick_dictation()` checks for an active ASR session, ensures TinyASR models are loaded, captures the foreground window, creates a `SessionOrigin::QuickDictation` session, starts `AudioCapture`, and shows the Quick Dictation overlay.
- `ShortcutManager::stop_quick_dictation()` stops capture, finalizes TinyASR, and leaves the overlay visible for review.
- `dismiss_overlay()` and `cancel_dictation_session()` hide/cancel the overlay/session.
- Studio recording uses the same `AudioCapture` through `commands/asr_commands.rs`.
- The main Studio window is hidden rather than destroyed when closed; the tray/background lifecycle therefore provides a suitable host for an opt-in wake listener.

Do not start a second microphone stream while `AudioCapture` is recording. Device drivers and host APIs vary, and two simultaneous streams can fail or contend for the same input device.

## 3. Recommended KWS engine and model

### 3.1 Engine

Use the official `sherpa-onnx` Rust crate with the streaming `KeywordSpotter` API. Before integrating it into VoxaLocal, build a tiny proof-of-concept using the selected model and the exact phrase `Hey Voxa`.

Official references:

- Rust API examples: <https://github.com/k2-fsa/sherpa-onnx/tree/master/rust-api-examples>
- Rust keyword-spotter example: <https://github.com/k2-fsa/sherpa-onnx/blob/master/rust-api-examples/examples/keyword_spotter.rs>
- Rust `KeywordSpotter` API: <https://docs.rs/sherpa-onnx/latest/sherpa_onnx/struct.KeywordSpotter.html>
- Rust `KeywordSpotterConfig`: <https://docs.rs/sherpa-onnx/latest/sherpa_onnx/struct.KeywordSpotterConfig.html>
- KWS overview and model list: <https://k2-fsa.github.io/sherpa/onnx/kws/index.html>
- Custom keyword preparation: <https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html>
- Rust installation/linking guidance: <https://k2-fsa.github.io/sherpa/onnx/rust-api/install.html>

Pin the selected `sherpa-onnx` crate version in `src-tauri/Cargo.toml` and commit the resulting `Cargo.lock`. Prefer the crate's default static-link configuration unless a verified cross-platform packaging reason requires shared linking. Build-time retrieval of the native static library is acceptable; the installed application must not require a network connection at runtime. Verify all supported target triples in CI.

### 3.2 Initial model candidate

Evaluate the official English KWS model:

`sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01`

The model is listed as an English keyword-spotting model. It supports custom keyword definitions using its token vocabulary and BPE model. This is a candidate, not a guarantee that the invented product name “Voxa” will be detected accurately. The proof-of-concept must measure it before the full integration proceeds.

The extracted model package is expected to provide the model files required by the model configuration, commonly:

- encoder ONNX file
- decoder ONNX file
- joiner ONNX file
- `tokens.txt`
- `bpe.model`

Do not hardcode filenames until the downloaded archive has been inspected. Resolve the actual names from the extracted official package.

### 3.3 Create the `Hey Voxa` keyword file

Keep the stable internal setting identifier as `hey_voxa`; use the human-facing phrase `Hey Voxa` in the UI.

For the English BPE model, create a raw keyword text file with one phrase:

```text
HEY VOXA
```

Generate the model-specific tokenized `keywords.txt` using the official tool and the selected model's files. The documented workflow is equivalent to:

```bash
sherpa-onnx-cli text2token \
  --tokens <MODEL_DIR>/tokens.txt \
  --tokens-type bpe \
  --bpe-model <MODEL_DIR>/bpe.model \
  keywords_raw.txt <MODEL_DIR>/keywords.txt
```

Do not hand-write BPE pieces. Verify that the generated token line is non-empty and contains no unknown-token fallback. Test the exact phrase from real microphone recordings, including multiple speakers, distances, accents, and room conditions. If `Hey Voxa` is not robustly detectable with the candidate model, stop and report the evidence; do not silently change the wake phrase or claim success.

### 3.4 KWS configuration

- Use CPU provider for the standby detector.
- Start with one inference thread to limit background CPU use.
- Use the model's expected sample rate and feature configuration; verify these from the model metadata/docs instead of assuming.
- Configure only the single `Hey Voxa` keyword.
- Use documented model defaults initially for keyword score/threshold, then tune from measured positive and negative samples.
- Do not expose uncalibrated score/threshold numbers as a user-facing sensitivity control.
- After a positive detection, the wake service must transition out of `Listening` immediately and must not produce repeated triggers from the same utterance.

The official Rust API usage pattern is:

```rust
let mut config = KeywordSpotterConfig::default();
config.model_config.transducer.encoder = Some(encoder_path);
config.model_config.transducer.decoder = Some(decoder_path);
config.model_config.transducer.joiner = Some(joiner_path);
config.model_config.tokens = Some(tokens_path);
config.model_config.provider = Some("cpu".to_string());
config.model_config.num_threads = 1;
config.keywords_file = Some(keywords_path);

let spotter = KeywordSpotter::create(&config)
    .ok_or_else(|| "Failed to initialize the wake-word detector".to_string())?;
let stream = spotter.create_stream();

// For each resampled PCM chunk:
stream.accept_waveform(16_000, pcm_chunk);
while spotter.is_ready(&stream) {
    spotter.decode(&stream);
    if let Some(result) = spotter.get_result(&stream) {
        if !result.keyword.is_empty() {
            // Signal a single wake event, then stop the standby stream.
        }
    }
}
```

Adapt the sample rate and borrowed argument types to the exact pinned crate API and model. This is an API pattern, not permission to skip compilation and tests.

## 4. Audio architecture

### 4.1 Separate standby capture, exclusive microphone ownership

Create a dedicated `WakeWordService` under `src-tauri/src/wake_word/`. It owns the standby CPAL stream and KWS instance. The existing `AudioCapture` remains responsible for active TinyASR recording.

The critical invariant is:

> At any moment, exactly one VoxaLocal subsystem owns the selected microphone for capture: the standby KWS service OR an active ASR capture session. Never run both pipelines at the same time.

Use the current `AudioCapture::get_selected_device()` selection as the source of truth. Reuse the existing input-device resolution logic. Do not add a second microphone selector.

### 4.2 Standby audio path

```text
Selected Microphone
       │
       ▼
CPAL Input Stream (WakeWordService only)
       │
       ▼
Real-time callback: format conversion + mono downmix
       │
       ▼
Bounded Crossbeam channel (non-blocking try_send)
       │
       ▼
Wake-word worker thread
       │
       ▼
Existing AudioResampler → model sample rate (normally 16 kHz)
       │
       ▼
Sherpa-ONNX OnlineStream.accept_waveform(...)
       │
       ▼
KeywordSpotter.is_ready / decode / get_result
       │
       ├── No match → continue local standby listening
       │
       └── `Hey Voxa` → stop and release CPAL stream → trigger Quick Dictation
```

Rules:

- Never run ONNX inference inside the CPAL real-time callback.
- Keep the callback non-blocking and allocation-minimal. Use fixed-size audio blocks and `try_send`; if the queue is full, count/drop the block rather than blocking the driver thread.
- Perform downmixing, resampling, and KWS decoding on a worker thread.
- Avoid a busy loop. Use bounded-channel receive with a timeout/control message or an equivalent blocking design.
- Use a bounded queue; do not allow unbounded accumulation of microphone samples.
- Use the same selected input device as the existing application. If the selected device is changed, stop/reconfigure/restart standby capture.
- If the device disappears or stream creation fails, emit an error state and leave the existing hotkey functionality available.

### 4.3 Wake Only does not need pre-roll

Do not add a ring buffer for the words following the wake phrase in this version. The required workflow is wake phrase → stop/release standby stream → start existing Quick Dictation capture → show ready overlay → user starts speaking. The wake phrase is therefore not forwarded to TinyASR, and there is no need to recover audio from the wake phrase's buffer.

### 4.4 Correct trigger ordering

The order must be explicit and tested:

1. KWS detects the configured keyword.
2. Atomically change service state from `Listening` to `Triggered` so duplicate results are ignored.
3. Stop accepting standby audio.
4. Stop and drop the CPAL stream and finish the standby capture thread.
5. Only after microphone release, call the wake-specific Quick Dictation entry point.
6. Quick Dictation performs its normal ASR setup and opens its own `AudioCapture` stream.
7. If Quick Dictation cannot start, report the error and re-arm standby listening after cleanup.

Do not call the existing `ShortcutManager::trigger_start()` blindly from the KWS worker. That method is a toggle entry point and may stop an active session if called in the wrong state. Add a wake-specific method that starts only when the PTT state machine is not already `Starting`, `Recording`, or `Finalizing`.

## 5. Service state and lifecycle

### 5.1 Suggested service state

Implement a thread-safe state enum similar to:

```rust
pub enum VoiceActivationState {
    Disabled,
    Starting,
    Listening,
    Triggered,
    PausedForRecording,
    Stopping,
    Error,
}
```

The public status API/event should serialize to stable camelCase or snake_case values consistently. Do not expose internal thread handles or device internals to the frontend.

### 5.2 Lifecycle rules

| Application/session event | Required Voice Activation behavior |
|---|---|
| Application starts; setting disabled or missing | Remain `Disabled`; do not open the microphone |
| Application starts; setting enabled | Load KWS assets, initialize detector, then enter `Listening` |
| User enables Voice Activation | Start standby service and report `Starting` → `Listening` |
| User disables Voice Activation | Stop and join standby worker; release microphone; enter `Disabled` |
| Wake phrase detected | Enter `Triggered`; release standby stream; then start Quick Dictation |
| Quick Dictation starts by wake phrase | Remain paused; do not start a second KWS stream |
| Quick Dictation starts by hotkey/UI | Pause and release KWS stream before the ASR stream starts |
| Quick Dictation finalizes and result overlay remains visible | Stay paused while result is reviewed |
| Quick Dictation overlay dismissed or cancelled | Re-arm if still enabled and no other ASR session is active |
| Studio ASR starts | Pause and release KWS stream before Studio `AudioCapture` starts |
| Studio ASR stops or is cancelled | Re-arm if enabled and no other ASR session is active |
| User changes microphone device | Stop/release standby stream, update the shared selection, and restart if enabled |
| KWS model missing/invalid | Enter `Error`; show localized actionable message; do not fall back to cloud |
| Microphone unavailable/permission denied | Enter `Error`; keep hotkey dictation usable |
| Application exits | Send stop signal, stop stream, and join/clean up worker without hanging shutdown |

### 5.3 Idempotency and race prevention

- `start_listening`, `pause`, `resume_if_enabled`, and `shutdown` must be idempotent.
- Do not start a worker if one is already active.
- Do not join a worker while holding a mutex that the worker needs to exit.
- Do not join the current thread from itself. The wake-trigger path must not call a generic `pause()` implementation that attempts to join its own worker. Use a distinct wake-start path or a safe worker-owner/coordinator design.
- When the KWS thread detects the keyword, mark the service as `Triggered` before dispatching the start request. Repeated KWS results must not create multiple Quick Dictation sessions.
- Check `AsrEngine::is_recording()` and the PTT state before starting. If Studio or Quick Dictation is already active, ignore the wake event and do not stop that session.
- On all failures after pausing, re-arm the listener when the setting is still enabled and ASR is no longer active.

## 6. Rust module and code changes

Suggested module layout:

```text
src-tauri/src/
├── wake_word/
│   ├── mod.rs
│   ├── manager.rs       # Service lifecycle, controls, worker ownership
│   ├── detector.rs      # Sherpa-ONNX KeywordSpotter wrapper
│   ├── capture.rs       # Standby CPAL capture and bounded audio channel
│   ├── settings.rs      # VoiceActivationSettings and defaults
│   └── state.rs         # VoiceActivationState
```

Adapt this layout to the repository's current module conventions. Avoid unnecessary abstractions or duplicated microphone code.

### 6.1 Settings model

Create a distinct serializable settings type. Suggested shape:

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceActivationSettings {
    pub enabled: bool,
    pub wake_phrase: String,
    pub mode: VoiceActivationMode,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VoiceActivationMode {
    WakeOnly,
}

impl Default for VoiceActivationSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            wake_phrase: "hey_voxa".to_string(),
            mode: VoiceActivationMode::WakeOnly,
        }
    }
}
```

The phrase and mode are fixed in this release. The UI can display them as read-only explanatory values; only `enabled` needs to be user-editable. Validate settings on load and update. If an older/corrupt value is found, fall back safely to disabled defaults.

Persist JSON using the existing `SettingsRepository` key:

```text
voice_activation_settings
```

Do not mix these fields into `QuickDictationSettings`; the global shortcut must continue to work independently.

### 6.2 Tauri commands

Add commands in a focused module, for example `src-tauri/src/commands/voice_activation_commands.rs`, and export it from `commands/mod.rs`.

Required operations:

- `get_voice_activation_settings` → current persisted/runtime settings.
- `update_voice_activation_settings` → validate, persist, then start/stop/reconfigure the service.
- `get_voice_activation_status` → current service status for initial UI hydration.

Register them in `tauri::generate_handler![]` in `lib.rs`.

When updating settings:

1. Validate the fixed wake phrase and `WakeOnly` mode.
2. Persist the new settings through `SettingsRepository::set`.
3. Apply the runtime transition.
4. Return the resulting settings/status or a clear error.
5. If the service cannot start, keep the user's preference explicit but surface the runtime error; do not pretend that listening is active.

Emit a status event such as:

```text
voice-activation://status
```

Use one stable payload shape, for example `{ "state": "listening", "message": null }`. Emit state changes only; do not emit audio buffers, keyword model internals, or transcript text through this channel.

### 6.3 Bootstrap in `lib.rs`

- Add `pub mod wake_word;`.
- Construct and manage an `Arc<WakeWordService>` using the application data/resource paths and the shared `AudioCapture` device selection.
- Load `voice_activation_settings` from `SettingsRepository`.
- Manage all required states before calling `start_listening`, because the worker's wake event needs access to the app's `ShortcutManager`/`AsrEngine` state.
- Start the listener only if `enabled == true` and the app is not already recording.
- Add explicit shutdown handling or a reliable `Drop`/control-channel cleanup that stops the worker, releases CPAL, and joins without deadlock.

The current bootstrap creates `ShortcutManager` before `setup` and manages it during setup. Ensure the WakeWordService is initialized in an order that does not create a circular state lookup or attempt to access an unmanaged Tauri state.

### 6.4 Quick Dictation integration

Update `src-tauri/src/shortcuts/manager.rs` carefully:

- Keep the normal global hotkey path unchanged from the user's perspective.
- Add a dedicated `trigger_start_from_wake_word` method. It must only start a new session if the PTT state is inactive/ready; it must never toggle-stop an existing recording.
- Factor shared start logic into a private helper if useful, with an explicit start source such as `Hotkey`, `Ui`, or `WakeWord`.
- For manual hotkey/UI starts, pause Voice Activation and fully release its CPAL stream before starting `AudioCapture`.
- For a wake-word start, the detector worker has already released its CPAL stream. Do not attempt to join the current detector thread from itself.
- On start failure, resume the standby service if enabled and if no ASR session is active.
- When Quick Dictation is finalized, keep Voice Activation paused while the result overlay remains visible.
- When the overlay is dismissed, pasted, or the dictation is cancelled, resume if enabled and safe.
- Use the existing `capture_foreground_window`, `AsrEngine`, `AudioCapture`, and `OverlayManager` workflow rather than duplicating it.

### 6.5 Studio recording integration

Update `src-tauri/src/commands/asr_commands.rs`:

- Before `start_recording` opens the shared `AudioCapture`, pause and release Voice Activation.
- If model/session/audio startup fails, resume Voice Activation if enabled.
- After `stop_recording` and `cancel_recording` complete, resume Voice Activation if enabled and no other recording is active.
- Ensure cleanup happens on error paths, not only success paths.

Update `src-tauri/src/commands/audio_commands.rs`:

- When `select_input_device` changes the selected input, stop the KWS stream first, update the existing `AudioCapture` selection, then re-arm if enabled and safe.
- Do not store a separate wake-word microphone preference.

## 7. Model and asset packaging

### 7.1 Runtime path resolution

Create one helper that resolves KWS assets in a predictable order:

1. Packaged Tauri resource directory, in a dedicated `wakeword` subdirectory.
2. Development resource path under `src-tauri/models/wakeword`.
3. A documented local AppData model path only if the project intentionally supports separately installed model assets.

Do not search arbitrary directories or silently download missing models. If required assets are missing, report a clear localized error and preserve the existing hotkey workflow.

### 7.2 Git hygiene and release packaging

`AGENTS.md` forbids committing large ONNX model binaries. Do not add the downloaded KWS `.onnx` files or model archive to Git.

The current `src-tauri/tauri.conf.json` has a resource entry for `models/*`. Extend the resource configuration to include the dedicated wake-word asset path (for example `models/wakeword/*`) and verify the actual Tauri glob behavior with a packaged build.

Update `.github/workflows/release.yml` so each Windows/macOS/Linux release job stages the pinned official KWS model archive into `src-tauri/models/wakeword/` **before** the Tauri packaging action runs. The build job should:

1. Download the exact official model release asset over HTTPS.
2. Verify a pinned SHA-256 digest. If the upstream release does not publish a checksum, compute and review the archive digest during initial setup, pin it in the workflow or a small text lock/manifest, and document the official source URL and model version.
3. Extract only required model files and the generated `keywords.txt` into the staging directory.
4. Fail the build if any required asset is absent or empty.
5. Ensure model files are bundled in the installer and discoverable through the Tauri resource API at runtime.
6. Ensure generated model binaries remain ignored/untracked and are never committed.

The application must work fully offline after installation. The wake-word model must be included in the shipped installer for this initial implementation; do not fetch it on first launch or when the user enables Voice Activation.

### 7.3 Licensing and attribution

Check the license of the exact Sherpa-ONNX crate/native runtime version and the exact KWS model package. Add appropriate notices and attribution to `LICENSE_NOTICES.md`. Do not assume that a code library's license automatically covers model weights. Record the model URL, version, license, and SHA-256 in documentation or a text manifest.

## 8. Frontend and UX

### 8.1 Placement

Locate the existing Quick Dictation settings section by searching for `quickDictationSectionTitle` in `src/i18n/translations.ts` and the component that renders it. Add a sibling card named **Voice Activation** nearby, using the existing design system and form controls. Do not create a new navigation tab unless the current design clearly requires one.

### 8.2 Required UI

The card should contain:

- Toggle: **Enable Voice Activation** (off by default).
- Read-only wake phrase: **Hey Voxa**.
- Clear mode explanation: **Wake Only — say “Hey Voxa”, wait for the floating dictation panel, then start speaking.**
- Runtime status: Disabled / Starting / Listening for “Hey Voxa” / Paused while recording / Error.
- Privacy note: audio is analyzed locally for the wake phrase; standby audio is not saved or sent to a cloud service.

Do not show a misleading “Listening” state until the native service confirms that the CPAL stream and KWS model are initialized successfully.

### 8.3 Localization

Add corresponding Persian and English keys to `src/i18n/translations.ts`. Example wording (polish to match current product language):

| English | Persian |
|---|---|
| Voice Activation | فعال‌سازی صوتی |
| Enable Voice Activation | فعال‌سازی صوتی با کلمه بیدارباش |
| Wake Phrase | عبارت بیدارباش |
| Hey Voxa | Hey Voxa |
| Wake Only | فقط بیدارباش |
| Say “Hey Voxa”, wait for the panel, then speak. | عبارت «Hey Voxa» را بگویید؛ پس از ظاهرشدن پنل، صحبت کنید. |
| Listening for “Hey Voxa” | در انتظار شنیدن Hey Voxa |
| Paused while recording | هنگام ضبط متوقف است |
| Voice Activation is disabled. | فعال‌سازی صوتی غیرفعال است. |
| Wake-word model is missing or invalid. | مدل کلمه بیدارباش پیدا نشد یا معتبر نیست. |
| Microphone is unavailable. Voice Activation could not start. | میکروفون در دسترس نیست و فعال‌سازی صوتی شروع نشد. |
| Standby audio is processed locally and is not stored. | صدای حالت انتظار به‌صورت محلی پردازش می‌شود و ذخیره نمی‌شود. |

Respect dynamic RTL/LTR direction. Keep the literal wake phrase left-to-right even in Persian UI if the existing component conventions support it.

### 8.4 Frontend state

- Hydrate Settings from `get_voice_activation_settings` and `get_voice_activation_status`.
- Subscribe to `voice-activation://status` for status updates.
- Send changes through `update_voice_activation_settings`.
- Prevent rapid repeated toggle requests while a transition is in progress.
- On command failure, restore the last confirmed setting/status and show a localized error.
- Clean up Tauri event listeners when the Settings component unmounts.

## 9. Tests and validation

### 9.1 Unit tests

Add tests for:

- Default settings have `enabled == false`, `wake_phrase == "hey_voxa"`, and `mode == WakeOnly`.
- Invalid or missing persisted settings safely become disabled defaults.
- `start_listening` is idempotent.
- `pause` and `shutdown` are idempotent.
- Disabling while listening stops the stream and joins the worker.
- A single detected keyword produces only one activation event.
- A wake event while ASR is active is ignored and never stops the active recording.
- The wake-trigger path never calls a toggle-stop branch.
- The standby stream is released before `AudioCapture::start_capture` is invoked.
- Voice Activation does not re-arm while a Quick Dictation result overlay is visible.
- It re-arms after dismiss/cancel and after Studio stop/cancel, provided it remains enabled.
- A microphone change causes clean reconfiguration.
- Missing model/device errors do not disable the existing hotkey workflow.

Use mocks/traits for the detector and capture boundary where practical so lifecycle tests do not require a physical microphone.

### 9.2 KWS model evaluation

Before tuning thresholds, create a local test set containing:

- Multiple positive `Hey Voxa` recordings from different speakers.
- Different speaking volumes and microphone distances.
- Typical room noise and computer fan noise.
- Negative examples: ordinary conversation, similar-sounding phrases, media playback, and silence.

Do not commit these personal recordings. Keep them local and temporary. Record measured false accepts, false rejects, and detection latency in a short engineering note. Do not claim accuracy or low resource usage without measurements.

### 9.3 Manual end-to-end checks

1. Install a build with the KWS model bundled. Disconnect the network.
2. Launch VoxaLocal with Voice Activation disabled. Verify that the standby microphone is not opened.
3. Enable Voice Activation. Confirm the UI changes to `Listening` only after successful initialization.
4. Say `Hey Voxa`. Confirm the standby stream is released, the floating panel appears, and TinyASR starts.
5. Confirm the words `Hey Voxa` are not present in the transcript.
6. Speak after the panel is ready. Confirm normal Persian/English TinyASR streaming continues unchanged.
7. Stop dictation. Confirm the result overlay remains visible and the wake listener stays paused.
8. Dismiss the result overlay. Confirm standby listening resumes.
9. Repeat using the global hotkey. Confirm no stream conflict and existing toggle behavior is unchanged.
10. Start Studio recording while wake listening is active. Confirm wake listening pauses and resumes after Studio stop/cancel.
11. Change the selected microphone and confirm standby capture reopens on the new device.
12. Disable Voice Activation and confirm the CPAL standby stream is fully released.
13. Quit from the tray and confirm the worker exits cleanly.
14. Repeat on Windows, macOS, and Linux release artifacts where supported.

### 9.4 Build gates

Run:

```bash
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Run the platform release workflow or equivalent package builds for Windows, macOS (including the configured universal target), and Linux. Verify that the KWS model assets and native Sherpa-ONNX runtime are present and load successfully in the installed package, not just in development mode.

With the machine offline after installation, verify that enabling Voice Activation causes no network request and that detection continues to work.

## 10. Acceptance criteria

The feature is complete only when all of the following are true:

- [ ] Voice Activation is opt-in and defaults to disabled.
- [ ] `Hey Voxa` is the only configured wake phrase.
- [ ] The only supported behavior is `wake_only`.
- [ ] Standby KWS runs locally on CPU and does not use TinyASR.
- [ ] No standby audio is written to disk or sent over the network.
- [ ] The standby CPAL stream is released before ASR capture starts.
- [ ] Wake phrase audio is not included in the transcript.
- [ ] Existing Quick Dictation hotkey and Studio recording remain functional.
- [ ] The listener pauses during every active ASR session and during Quick Dictation review.
- [ ] The listener resumes only when enabled and no ASR session is active.
- [ ] Device changes, failures, app shutdown, and repeated state transitions are handled safely.
- [ ] Persian and English UI strings are complete and RTL/LTR behavior is correct.
- [ ] KWS model assets are bundled in release installers without committing prohibited binaries.
- [ ] License notices and model provenance are documented.
- [ ] Build, tests, and platform packaging checks pass.

## 11. Recommended implementation order

1. **Repository audit:** Read `AGENTS.md`, inspect the current working tree and confirm the source paths and Tauri resource configuration.
2. **KWS proof-of-concept:** Add a small isolated Rust example or temporary test harness using the selected Sherpa-ONNX version and official English model. Generate the `Hey Voxa` BPE keyword file and evaluate real recordings. Do not integrate until the exact phrase works adequately.
3. **Asset strategy:** Pin the model release and SHA-256; stage the assets outside Git; verify resource discovery in a packaged build.
4. **Backend service:** Implement the dedicated standby CPAL/KWS service, states, stop/release behavior, and runtime status events.
5. **Lifecycle integration:** Connect Quick Dictation, hotkey, Studio recording, microphone selection, app startup, and shutdown. Prove there is never concurrent KWS and ASR microphone ownership.
6. **Settings and persistence:** Add the separate settings struct, SQLite persistence, and Tauri commands.
7. **Frontend:** Add the bilingual Settings card and status handling.
8. **Validation:** Unit tests, KWS evaluation, offline installation test, and platform packaging.
9. **Documentation and Git hygiene:** Update architecture/license notes, inspect `git status --short`, stage only approved text/source/config/workflow files, run all build gates, and follow `AGENTS.md` synchronization policy.

## 12. Non-negotiable implementation constraints

- Do not use browser Web Speech APIs or `getUserMedia`; use native Rust/CPAL.
- Do not use any cloud speech API or runtime model download.
- Do not route standby audio into TinyASR.
- Do not modify the existing TinyASR model or Silero VAD behavior for this feature.
- Do not leave a microphone stream open when the feature is disabled.
- Do not run KWS and ASR capture at the same time.
- Do not include the wake phrase in the dictation transcript.
- Do not resume listening while the Quick Dictation result overlay is visible.
- Do not call `ShortcutManager::trigger_start()` from the detector without guarding against its toggle-stop behavior.
- Do not join the current worker thread from itself.
- Do not commit model archives, ONNX files, generated recordings, databases, build artifacts, or secrets.
- Do not claim the feature works until the exact wake phrase has been tested on real audio and packaged offline builds.
