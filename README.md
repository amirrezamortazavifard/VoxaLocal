# VoxaLocal — Offline Persian & English Speech Recognition Studio

<p align="center">
  <img src="public/icon.png" width="128" height="128" alt="VoxaLocal Logo" />
</p>

<p align="center">
  <strong>استودیوی بومی و ۱۰۰٪ آفلاین بازشناسی گفتار فارسی و انگلیسی با دیکته سراسری (Push-to-Talk) و انیمیشن بازگشایی زنده</strong><br>
  <em>High-performance, privacy-first, real-time desktop speech-to-text studio & global push-to-talk dictation powered by native TinyASR and Zipformer2 transducers.</em>
</p>

<p align="center">
  <a href="https://github.com/amirrezamortazavifard/VoxaLocal/releases"><img src="https://img.shields.io/github/v/release/amirrezamortazavifard/VoxaLocal?color=06b6d4&style=flat-square" alt="GitHub Release"></a>
  <img src="https://img.shields.io/badge/Privacy-100%25%20Offline-emerald?style=flat-square" alt="100% Offline">
  <img src="https://img.shields.io/badge/Push--to--Talk-Global%20Hotkey-cyan?style=flat-square" alt="Push-to-Talk">
  <img src="https://img.shields.io/badge/Tauri-2.0-blue?style=flat-square" alt="Tauri 2.0">
  <img src="https://img.shields.io/badge/Rust-2021-orange?style=flat-square" alt="Rust 2021">
  <img src="https://img.shields.io/badge/Engine-TinyASR%20int4-purple?style=flat-square" alt="TinyASR">
  <img src="https://img.shields.io/badge/VAD-Silero%20v5-cyan?style=flat-square" alt="Silero VAD">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-rose?style=flat-square" alt="License"></a>
</p>

---

## 🌟 Overview / معرفی پروژه

**VoxaLocal** is a production-grade, 100% offline desktop speech-to-text application designed specifically for **Persian (`fa`)** and **English (`en`)**. It faithfully implements the speech recognition pipeline pioneered by Telegram's **TinyASR** engine, executing quantized Zipformer2 transducer neural networks entirely locally on your CPU.

VoxaLocal provides two core workflows:
1. **Full Studio Workspace**: Live streaming recognition with Telegram-style word-by-word visual re-decoding, editable transcripts, audio file transcription, SQLite history, and multi-format subtitle exports.
2. **Global Quick Dictation (Push-to-Talk)**: System-wide lightweight voice dictation triggered via a configurable global hotkey (`Ctrl + Shift + Space`) that captures speech, streams words into a floating non-activating overlay, and automatically pastes text into your active target application.

### چرا VoxaLocal؟ (Why VoxaLocal?)
- **حریم خصوصی ۱۰۰٪ و بدون اینترنت**: پردازش صدا به طور کامل بر روی پردازنده کامپیوتر شما انجام می‌شود. هیچ صدایی به سرورهای ابری، گوگل یا وب‌سرویس‌های خارجی ارسال نمی‌شود.
- **دیکته صوتی سراسری در هر برنامه (Global Push-to-Talk)**: با فشردن کلید میانبر `Ctrl + Shift + Space` در هر برنامه‌ای (مرورگر، ورد، تلگرام، ادیتور کد)، متن به صورت زنده پیاده شده و مستقیماً Paste می‌شود.
- **بازشناسی زنده با سبک تلگرام (Telegram-Style Word-by-Word)**: تفکیک تصویری هوشمند میان کلمات جاری (`tail`)، اصلاحات ناشی از بازگشایی متن کامل (`open` با انیمیشن ملایم هایلایت)، و کلمات نهایی‌شده (`commit` بدون تغییر).
- **پنجره شناور بدون از دست رفتن فوکوس (Non-Activating Window)**: پنجره شناور دیکته سریع در ویندوز با `SW_SHOWNOACTIVATE` اجرا می‌شود و فوکوس کیبورد برنامه فعال شما را نمی‌دزدد.
- **آیکون System Tray و کارکرد در پس‌زمینه**: بستن پنجره اصلی نرم‌افزار آن را در System Tray پنهان می‌کند تا کلید میانبر همیشه فعال و آماده به کار بماند.
- **ویرایش زنده متن و تاریخچه SQLite**: امکان ویرایش متن نهایی در استودیو و پنجره شناور قبل از ذخیره‌سازی یا ارسال.
- **اصلاح هوشمند تایپوگرافی فارسی (Smart ZWNJ)**: رعایت خودکار نیم‌فاصله‌ها و یکسان‌سازی نویسه‌های عربی به فارسی.

---

## 🚀 Key Features / ویژگی‌های کلیدی

| قابلیت | شرح |
|---|---|
| 🎙️ **دیکته صوتی سراسری (PTT)** | تایپ صوتی با کلید میانبر در تمام برنامه‌های دسکتاپ با قابلیت بازگشت فوکوس و Paste خودکار. |
| ⚡ **استودیو زنده سبک تلگرام** | رونویسی ریل‌تایم با انیمیشن‌های اختصاصی کلمات تازه و اصلاح‌شده (Word Diff Tracking). |
| 🛡️ **موتور TinyASR بومی** | اجرای کاستوم Zipformer2 RNN-T/TDT با کوانتیزاسیون int4 و تسریع سخت‌افزاری AVX2 / AVX-512. |
| 🪟 **پنجره شناور سبک (Overlay)** | پنجره جمع‌وجور شناور، همیشه در بالا، با نمایش شکل‌موج صدا و شمارش معکوس بستن خودکار. |
| 🔔 **سینی سیستم (System Tray)** | حضور دائم در کنار ساعت ویندوز با امکان باز کردن سریع، مشاهده وضعیت و خروج پاکیزه. |
| 📁 **رونویسی فایل‌های صوتی** | تبدیل فایل‌های WAV، MP3، FLAC و M4A به همراه خروجی زیرنویس استاندارد (SRT)، متن (TXT) و JSON. |
| 💾 **پایگاه‌داده محلی SQLite** | ذخیره ایمن تمامی رونویسی‌های استودیو و دیکته‌های سریع در پایگاه داده داخلی بدون اتصال شبکه. |

---

## 🏗️ System Architecture / معماری فنی

VoxaLocal uses an asynchronous, thread-isolated architecture guaranteeing zero audio dropouts:

```mermaid
flowchart TD
    subgraph Audio_Layer [Audio Capture & DSP (Zero-Allocation)]
        MIC[Microphone / CPAL] -->|AudioBlock 2048 f32| MIX[Mono Downmix on Stack]
        MIX -->|44.1k / 48k| RES[Rubato 0.16 Resampler]
        RES -->|16 kHz Mono Float32| RING[Bounded Audio Channel]
    end

    subgraph ASR_Layer [Native Rust ASR Engine]
        RING --> SESS[TinyASR Session Worker]
        MODELS[(Zipformer2 & Silero VAD)] -.-> SESS
        SESS -->|Streaming Pass| STREAM[Frame Hypothesis]
        SESS -->|Silence / EOU| REDEC[Full-Context Re-decode]
        STREAM --> DISPATCH[Event Dispatcher]
        REDEC --> DISPATCH
    end

    subgraph Shortcuts_Overlay [Global Dictation Subsystem]
        HOTKEY[Global Hotkey Plugin] --> SM[PttStateMachine]
        SM --> OVERLAY[Floating Non-Activating Overlay]
        SM --> PASTE[Win32 Synthetic Paste]
    end

    subgraph IPC_Layer [Tauri IPC Channels]
        DISPATCH -->|asr://partial| DIFF[WordDiffTracker Engine]
        DISPATCH -->|asr://commit| DIFF
        DIFF --> UI[Studio & Quick Dictation Views]
    end

    subgraph Storage [Persistence]
        UI -->|Save Transcript| DB[(SQLite voxlocal.db)]
    end
```

---

## 📚 Technical Documentation

- 📖 [System Architecture (`ARCHITECTURE.md`)](ARCHITECTURE.md)
- 🎙️ [Global Quick Dictation Guide (`QUICK_DICTATION.md`)](QUICK_DICTATION.md)
- ⌨️ [Global Shortcuts Architecture (`GLOBAL_SHORTCUTS.md`)](GLOBAL_SHORTCUTS.md)
- 🪟 [Floating Overlay Architecture (`OVERLAY_ARCHITECTURE.md`)](OVERLAY_ARCHITECTURE.md)
- 🔬 [Live Recognition & Re-decoding Diagnostics (`LIVE_RECOGNITION_DIAGNOSTICS.md`)](LIVE_RECOGNITION_DIAGNOSTICS.md)
- 🧠 [Model Installation & Verification (`MODEL_INSTALLATION.md`)](MODEL_INSTALLATION.md)
- 🔒 [Offline & Privacy Architecture (`OFFLINE_ARCHITECTURE.md`)](OFFLINE_ARCHITECTURE.md)

---

## 💻 Download & Installation / راهنمای نصب و اجرا

### ۱. استفاده از فایل نصبی آماده (Recommended)
از بخش [GitHub Releases](https://github.com/amirrezamortazavifard/VoxaLocal/releases) آخرین نسخه نرم‌افزار را دانلود کنید:
- **نصب‌کننده ویندوز (Setup.exe)**: `VoxLocal_0.1.0_x64-setup.exe`
- **نصب‌کننده سازمانی (MSI)**: `VoxLocal_0.1.0_x64_en-US.msi`
- **نسخه پرتابل بدون نیاز به نصب**: `voxlocal.exe`

### ۲. بیلد و توسعه از سورس‌کد (Building from Source)

#### پیش‌نیازها:
- **Rust**: نسخه ۱.۸۰ یا بالاتر (`rustup default stable`)
- **Node.js**: نسخه ۲۰ یا ۲۴ به همراه npm
- **C++ Build Tools**: ویژوال استودیو با Windows 10/11 SDK (برای ویندوز)

#### مراحل اجرا:
```bash
# ۱. کلون کردن ریپازیتوری
git clone https://github.com/amirrezamortazavifard/VoxaLocal.git
cd VoxaLocal

# ۲. نصب وابستگی‌های فرانت‌اند
npm install

# ۳. اجرای آزمون‌های بک‌اند و اطمینان از سلامت پروژه
cargo test --manifest-path src-tauri/Cargo.toml

# ۴. اجرای محیط توسعه زنده
npm run tauri dev

# ۵. بیلد پکیج نهایی Release
npm run tauri build
```

---

## 🧠 Model Setup Guide / راهنمای نصب مدل‌ها

1. نرم‌افزار **VoxaLocal** را باز کرده و به تب **«مدیریت مدل‌ها» (Model Manager)** بروید.
2. چنانچه پروژه را در محیط توسعه اجرا می‌کنید، دکمه **«نصب خودکار مدل‌های داخلی پروژه»** را کلیک کنید تا مدل‌های تست موجود در `vendor/tinyasr/models/` بارگذاری شوند.
3. برای وارد کردن دستی مدل‌ها:
   - فایل مدل تشخیص گفتار: `en-fa.tzf` یا `en-fa.tzf.gz`
   - فایل مدل تشخیص صوت: `silero_vad.onnx` یا `silero_vad.onnx.gz`
   - دکمه **«بررسی و نصب مدل‌های انتخابی»** را بزنید.
4. سپس روی **«بارگذاری مدل در حافظه RAM»** کلیک کنید. پس از سبز شدن نشانگر، برنامه آماده تبدیل صدا به متن است!

---

## 📄 License & Attribution

- **VoxaLocal** is licensed under the **GNU General Public License v3.0 or later ([GPL-3.0-or-later](LICENSE))**.
- **TinyASR**: (c) Dmitry Karaush, licensed under GPL-3.0.
- **Silero VAD**: (c) Silero Team, licensed under MIT License.
- Full notices and dataset attributions are listed in [LICENSE_NOTICES.md](LICENSE_NOTICES.md).
