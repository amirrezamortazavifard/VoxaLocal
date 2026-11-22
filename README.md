# VoxLocal — Offline Persian Speech Recognition Studio

**VoxLocal** is an offline, production-grade desktop application for real-time and file-based Persian and English speech-to-text recognition. It is powered by the native **TinyASR** engine running trained Zipformer2 transducer models, completely local and private on your machine.

---

## Highlights

- **100% Offline & Private**: Zero cloud APIs, zero telemetry, zero external network calls.
- **Real-Time Streaming Speech Recognition**: Sub-second hypothesis generation as you speak.
- **Full-Context Re-decoding**: Continuous correction of unfinished sentences using TinyASR's official beam-search pass (Beam Width = 4).
- **Dual Visual State**: Distinct visual differentiation between:
  - **Finalized words** (immutable commits)
  - **Re-decoded words** (high-accuracy second-pass hypotheses)
  - **Provisional words** (streaming decoder tail)
- **Silero VAD & End-of-Turn (EOU)**: Accurate voice activity detection (VAD v5) and acoustic sentence boundary detection.
- **Multilingual Support**: Primary focus on Persian (`fa`) with seamless technical English (`en`) recognition.
- **Offline Audio File Transcription**: Transcribe WAV, MP3, FLAC, and M4A files with word-level timestamps and SRT subtitle export.
- **Local History (SQLite)**: Searchable local archive of past transcriptions and audio metadata.
- **Persian Typography Normalization**: Optional smart Zero-Width Non-Joiner (نیم‌فاصله) insertion and Arabic-to-Persian letter harmonization.

---

## Pinned TinyASR Engine

VoxLocal integrates the official `dkaraush/tinyasr` Rust engine pinned at:
- **Repository**: `https://github.com/dkaraush/tinyasr`
- **Pinned Commit**: `42d8e11e13653f73c99978521de1c5dd145d0332`
- **Recognizer Architecture**: Zipformer2 RNN-T / TDT Multilingual (~60M parameters, int4 weights, TZF3/TZF4 format)
- **Voice Activity Detection**: Silero VAD v5 (16,000 Hz ONNX)
- **License**: GNU General Public License v3.0 or later (GPL-3.0-or-later)

---

## Architecture Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, TypeScript 5, Vite 6, Tailwind CSS 3, Lucide Icons |
| **Desktop Shell** | Tauri 2.12 |
| **ASR Inference** | TinyASR (Native Rust, int4 SIMD x86_64 AVX2 / AVX-512 VNNI) |
| **Audio Capture** | CPAL (WASAPI / DirectSound / ALSA / CoreAudio) |
| **Resampling** | Rubato 0.16 (High-fidelity polynomial & FFT resampling to 16 kHz) |
| **Audio File Decoding** | Symphonia 0.5 (Pure Rust decoder for WAV, MP3, FLAC, M4A) |
| **Persistence** | SQLite (via bundled Rusqlite 0.32) |

---

## Quick Start & Installation

### Option 1: Run the Pre-built Release
The release build generates ready-to-run installers in `src-tauri/target/release/bundle/`:
- **MSI Installer**: `VoxLocal_0.1.0_x64_en-US.msi`
- **NSIS Setup**: `VoxLocal_0.1.0_x64-setup.exe`
- **Portable Executable**: `voxlocal.exe`

### Option 2: Build From Source

#### Prerequisites
1. **Rust**: 1.80+ (tested with Rust 1.96.1 x86_64-pc-windows-msvc)
2. **Node.js**: v20+ or v24+
3. **C++ Build Tools**: Visual Studio Build Tools with Windows 10/11 SDK

#### Build Steps
```bash
# 1. Install frontend dependencies
npm install

# 2. Verify and test the Rust backend
cargo test --manifest-path src-tauri/Cargo.toml

# 3. Run development mode
npm run tauri dev

# 4. Compile release binaries and installers
npm run tauri build
```

---

## Model Import Instructions

1. Launch VoxLocal and navigate to the **مدیریت مدل‌ها (Model Manager)** tab.
2. If running in the development workspace, click **«نصب خودکار مدل‌های داخلی پروژه»** to automatically load the verified models from `vendor/tinyasr/models/`.
3. To import custom or updated models:
   - Select the ASR model: `en-fa.tzf` or `en-fa.tzf.gz` (Persian-English recognizer).
   - Select the VAD model: `silero_vad.onnx` or `silero_vad.onnx.gz`.
   - Click **«بررسی و نصب مدل‌های انتخابی»**.
4. Click **«بارگذاری مدل در حافظه RAM»**. When the badge displays **«مدل بارگذاری شد»**, you are ready to transcribe!

See [MODEL_INSTALLATION.md](MODEL_INSTALLATION.md) for full details.

---

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): Detailed multi-threaded architecture and data flow.
- [TINYASR_INTEGRATION.md](TINYASR_INTEGRATION.md): Deep dive into TinyASR algorithms, sessions, and re-decoding.
- [MODEL_INSTALLATION.md](MODEL_INSTALLATION.md): Model formats, validation, and manual asset setup.
- [OFFLINE_ARCHITECTURE.md](OFFLINE_ARCHITECTURE.md): Privacy verification, network isolation, and audit report.
- [TESTING.md](TESTING.md): Test suite, benchmarks, and accuracy evaluation.
- [BUILD_AND_RELEASE.md](BUILD_AND_RELEASE.md): Step-by-step compilation, packaging, and platform portability.
- [LICENSE_NOTICES.md](LICENSE_NOTICES.md): GPL-3.0-or-later, MIT, and CC BY 3.0 license notices.

---

## License

VoxLocal and its bundled TinyASR engine are licensed under the **GNU General Public License v3.0 or later** ([GPL-3.0-or-later](LICENSE_NOTICES.md)).
