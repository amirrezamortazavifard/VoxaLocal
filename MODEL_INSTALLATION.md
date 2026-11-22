# VoxLocal — Model Installation & Management

This guide explains how model assets are imported, validated, and managed within **VoxLocal**.

---

## 1. Required Model Assets

VoxLocal requires two model files to operate:

1. **ASR Recognizer Model**:
   - Official file: `en-fa.tzf.gz` or `en-fa.tzf`
   - Description: Multilingual Persian-English Zipformer2 model (~60M parameters, int4 weights).
   - Size: ~28.7 MiB (compressed `.gz`), ~34.6 MiB (uncompressed `.tzf`).
   - Magic Header: `TZF3` or `TZF4`.

2. **Silero VAD Model**:
   - Official file: `silero_vad.onnx.gz` or `silero_vad.onnx`
   - Description: Silero Voice Activity Detector v5 (16,000 Hz branch).
   - Size: ~1.9 MiB (compressed `.gz`), ~2.3 MiB (uncompressed `.onnx`).
   - Format: Standard ONNX graph containing STFT convolutions and LSTM cell.

---

## 2. Automated vs. Manual Import

### Option A: Local Bundled Import (One-Click)
In the VoxLocal UI, go to **مدیریت مدل‌ها (Model Manager)** and click:
**«نصب خودکار مدل‌های داخلی پروژه»**

The application will read the bundled models from `vendor/tinyasr/models/`, decompress them if gzipped, validate their internal headers, and copy them to the local application data directory.

### Option B: Manual Import
1. In the **مدیریت مدل‌ها** tab, click **انتخاب فایل...** next to the ASR model field and select `en-fa.tzf` or `en-fa.tzf.gz`.
2. Click **انتخاب فایل...** next to the VAD model field and select `silero_vad.onnx` or `silero_vad.onnx.gz`.
3. Click **«بررسی و نصب مدل‌های انتخابی»**.

---

## 3. Validation Logic

The backend validation performs the following checks before accepting model files:

1. **Gzip Decompression**: If the file starts with magic bytes `[0x1f, 0x8b]`, it is decompressed in memory using `flate2`.
2. **ASR Header Verification**: The uncompressed recognizer must begin with `b"TZF1"`, `b"TZF2"`, `b"TZF3"`, or `b"TZF4"`.
3. **VAD ONNX Structure**: The VAD file is parsed via `tinyasr::Vad::from_onnx`, ensuring the 16 kHz weights (`stft.forward_basis_buffer`, `decoder.rnn`) are present.
4. **End-to-End Test Load**: `tinyasr::Models::load` is invoked to verify that language codes match (`["en", "fa"]`).
5. **Storage**: Once verified, the uncompressed files are written to `%LOCALAPPDATA%\com.voxlocal.app\models\` for fast future loading.

---

## 4. Model Replacement & Removal

- **Unload**: Click **«تخلیه مدل از RAM»** to free memory without deleting files from disk.
- **Replace**: Importing new files replaces existing assets in the application directory.
- **Persistence**: Installed models are stored in user application data and persist across application restarts and updates.
