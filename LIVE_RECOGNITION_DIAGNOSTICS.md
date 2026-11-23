# VoxaLocal — Live Recognition & Re-decoding Diagnostics

## Overview

VoxaLocal integrates the **TinyASR** dual-pass automatic speech recognition engine for English and Persian. This document details the live streaming pipeline, event semantics, and Telegram-style visual diffing mechanism.

---

## 1. Complete Audio & Recognition Pipeline

```
Microphone (CPAL)
       │
       ▼ [Zero-allocation AudioBlock (2048 f32 frames)]
Crossbeam Bounded Channel (128 depth)
       │
       ▼
Capture Worker Thread
       ├── RMS & Peak Decibel Meter (audio://level @ 20Hz)
       └── Rubato Polynomial Resampler (Arbitrary Hz -> 16,000 Hz)
       │
       ▼
ASR Session Worker (voxlocal-asr-{sessionId})
       │
       ├── tinyasr::Session::push(&pcm_16k)
       │     ├── 40 ms acoustic frames
       │     ├── Silero VAD v5 speech classification
       │     ├── Streaming greedy pass (320 ms chunks)
       │     └── Full-context beam search pass (every 0.32s / pause)
       │
       ▼ TinyASR Events
       ├── Event::Partial { open, tail } ──► asr://partial
       ├── Event::Commit(words)          ──► asr://commit
       ├── Event::Language(lang)         ──► asr://language
       └── Event::Eou { at, p }          ──► asr://eou
       │
       ▼ Tauri IPC Bridge
Frontend (useAsr.ts)
       │
       ▼ WordDiffTracker (Telegram-style snapshot diffing)
UI (TranscriptView.tsx / QuickDictationOverlay.tsx)
```

---

## 2. Event Semantics

### `asr://partial`
- Emitted whenever the provisional streaming hypothesis changes.
- Contains:
  - `open`: Words produced by the full-context second-pass beam search.
  - `tail`: Newest streaming words from the first-pass greedy search.
- **Rule**: Every `asr://partial` event replaces the previous provisional segment. It never appends duplicate text to old partial hypotheses.

### `asr://commit`
- Emitted when words are permanently finalized by:
  - The trained End-of-Turn (EOU) classifier ($P(\text{finish}) > 0.5$).
  - A pause duration $> 0.24$ s.
  - A forced cut after long utterances ($> 20$ s).
  - Session finalization (`session.finish()`).
- **Rule**: Committed words are immutable. Once committed, they can never be modified by later partial events.

---

## 3. Telegram-Style Word Diffing Engine

In a live dual-pass recognition system, streaming words (`tail`) are frequently revised by the full-context beam search (`open`). Animating every word inside `open` causes visual flashing and disorientation.

VoxaLocal implements a dedicated snapshot diffing engine (`src/utils/wordDiffTracker.ts`):

1. **Predecessor Matching**: When a new `Partial` event arrives, each word is matched against the previous provisional hypothesis using temporal proximity ($|\text{start}_{prev} - \text{start}_{new}| < 0.28$ s).
2. **Change Detection**:
   - If `text` matches: The word is marked as `provisional-stable`. No animation is played.
   - If `text` differs: The word was corrected by the re-decode pass. It is assigned `provisional-corrected` with a timestamp.
3. **Revision Animation**:
   - Corrected words flash with an amber/gold highlight (`animate-word-corrected`, 650 ms) to subtly notify the user of the correction.
   - New streaming words enter with a smooth upward slide (`animate-word-appear`, 220 ms).
   - After 650 ms, corrected words automatically settle back to the standard provisional style.
4. **Stable Identity**:
   - Word elements retain stable React keys (`id`) across revisions, allowing CSS keyframe transitions to run in-place without DOM element unmounting.

---

## 4. Disconnected & Zero-Telemetry Audit

VoxaLocal operates strictly within the offline security boundary:
- No HTTP clients exist in the backend runtime.
- No network requests are made during model loading, audio capture, streaming recognition, or transcript export.
- Testing under Airplane Mode verifies identical recognition latency and accuracy.
