# VoxLocal — Testing & Quality Assurance

This document outlines the testing strategy, test suite execution, and validation results for **VoxLocal**.

---

## 1. Automated Test Suite

VoxLocal includes comprehensive unit and integration tests across audio processing, model validation, and storage.

Run all tests via:
```bash
cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture
```

### Test Results Summary

| Test File | Test Case | Scope | Status |
|---|---|---|---|
| `tests/model_test.rs` | `test_load_en_fa_and_vad` | Gzip decompression, TZF3/TZF4 header check, Silero VAD loading, language enumeration (`["en", "fa"]`), and 1-second silence session | **PASSED** |
| `tests/audio_test.rs` | `test_rms_and_peak_calculation` | Audio level metering (RMS, peak, dB) | **PASSED** |
| `tests/audio_test.rs` | `test_resampling_48k_to_16k` | Rubato resampling from 48 kHz to 16 kHz | **PASSED** |
| `tests/audio_test.rs` | `test_resampling_44100_to_16k` | Rubato resampling from 44.1 kHz to 16 kHz | **PASSED** |
| `tests/audio_test.rs` | `test_buffer_stats` | Audio buffer tracking and drop counting | **PASSED** |
| `tests/pipeline_test.rs` | `test_srt_subtitle_generation` | Word timestamps to SRT subtitle formatting | **PASSED** |
| `tests/storage_test.rs` | `test_database_and_history_crud` | SQLite schema creation, transcript CRUD, and settings persistence | **PASSED** |
| `vendor/tinyasr` | 14 unit tests + doctests | Kernel quantization, AVX2 SIMD, thread pool, text casing, and quotes | **PASSED** |

---

## 2. Persian & Multilingual Recognition Validation

The Persian-English Zipformer2 model (`en-fa.tzf`) has been tested against:
1. **Natural Persian Speech**: Common conversational Persian, formal Persian, and polite expressions.
2. **Persian with Technical English Expressions**: Sentences containing English technical terms (e.g. "با استفاده از Docker کانتینرها را اجرا کردیم").
3. **Sentence Boundaries & Pauses**: Verified end-of-turn (EOU) detection triggering sentence commits after short pauses (>0.24s).
4. **Re-decoding Correction**: Verified that provisional streaming words from the streaming pass are corrected by full-context re-decoding.

---

## 3. Frontend Build & Type Validation

The frontend build executes TypeScript strict checking followed by Vite optimization:
```bash
npm run build
```
- TypeScript check: 0 errors.
- Vite build: Bundle generated in `dist/` with zero warnings.
