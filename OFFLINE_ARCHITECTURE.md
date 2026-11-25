# VoxLocal — Offline & Privacy Verification

This document verifies the offline architecture, local data boundary, and security profile of **VoxLocal**.

---

## 1. Network Isolation Audit

VoxLocal is engineered to run with zero network connectivity:

| Potential Vector | Status in VoxLocal | Details |
|---|---|---|
| **Remote Speech APIs** | **Disabled** | All recognition runs via the native TinyASR engine on local CPU. |
| **HTTP Clients** | **None** | No `reqwest`, `curl`, `fetch`, or HTTP clients exist in the backend runtime. |
| **Cloud Telemetry** | **None** | No analytics, trackers, or usage metrics are collected. |
| **Crash Reporting** | **None** | Errors are logged locally via `env_logger` to stderr. |
| **Auto-Updaters** | **Disabled** | Tauri updater plugin is not configured. |
| **Model Downloads** | **Manual Only** | Models are never fetched automatically over the internet. |

---

## 2. Audio Processing Boundary

1. **Microphone Audio**:
   - Audio is captured from the selected microphone device via CPAL.
   - Raw audio samples reside strictly in volatile RAM within bounded ring buffers.
   - Audio is never written to disk during live streaming unless the user explicitly saves a transcript.
   - Optional Voice Activation (`Hey Voxa`, disabled by default) runs a local 1-thread Sherpa-ONNX `KeywordSpotter` on CPU in `wake_only` mode without saving or transmitting standby audio, and immediately releases the standby microphone stream before opening active dictation capture.
2. **File Transcription**:
   - Audio files are decoded locally using the pure-Rust `Symphonia` library.
   - Decompressed PCM samples are fed directly to `tinyasr::Transcription` in memory.
3. **Local Database**:
   - SQLite database (`voxlocal.db`) resides in `%LOCALAPPDATA%\com.voxlocal.app\`.
   - Transcripts are stored only when the user explicitly clicks "Save to History".

---

## 3. Disconnected Verification Procedure

To verify offline operation on Windows:

1. Disconnect your computer from all network connections (unplug Ethernet, turn off Wi-Fi, or enable Airplane Mode).
2. Launch `voxlocal.exe`.
3. Confirm the **«آفلاین ۱۰۰٪»** status badge is green.
4. Open the **استودیو ضبط زنده** tab and dictate Persian and English speech.
5. Confirm that real-time streaming recognition, re-decoding, and transcript generation operate normally without errors or network warnings.
