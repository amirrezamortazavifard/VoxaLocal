# VoxLocal — License Notices & Attribution

This project incorporates and builds upon open-source software and machine learning models.

---

## 1. VoxLocal & TinyASR License

VoxLocal and the integrated TinyASR native engine are licensed under the **GNU General Public License v3.0 or later (GPL-3.0-or-later)**.

- **Upstream Project**: [TinyASR](https://github.com/dkaraush/tinyasr)
- **Author**: Dmitry Karaush
- **License**: GNU General Public License v3.0 or later

Under the terms of the GPL-3.0, any distribution of this application or modified versions must make the corresponding source code available under the same license terms.

---

## 2. Voice Activity Detection (Silero VAD)

Voice Activity Detection uses **Silero VAD v5**:
- **Project**: [Silero VAD](https://github.com/snakers4/silero-vad)
- **License**: MIT License
- **Copyright**: (c) Silero Team

---

## 3. Speech Training Datasets Attribution

The speech recognition models were trained primarily on:
- **YODAS v3 Corpus**: [ESPnet YODAS v3](https://huggingface.co/datasets/espnet/yodas3), released under Creative Commons Attribution 3.0 (CC BY 3.0).
- **Common Voice**: Mozilla Common Voice dataset.
- **FLEURS**: Google FLEURS benchmark dataset.

---

## 4. Offline Wake-Word Detection (Sherpa-ONNX KWS)

Optional hands-free wake-word detection (`Hey Voxa`) uses **Sherpa-ONNX** and the **GigaSpeech Zipformer KWS 3.3M** model:
- **Runtime / Crate**: [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) — Apache License 2.0
- **KWS Model**: `sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01` — Apache License 2.0

---

## 5. Third-Party Libraries

- **Tauri**: Apache-2.0 / MIT
- **CPAL**: Apache-2.0
- **Rubato**: MIT
- **Symphonia**: MPL-2.0
- **Rusqlite**: MIT
- **React**: MIT
- **Tailwind CSS**: MIT
- **Lucide Icons**: ISC
