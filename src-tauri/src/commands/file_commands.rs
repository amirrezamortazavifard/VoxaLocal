use std::fs::File;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL, CODEC_TYPE_OPUS};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use tauri::{AppHandle, Emitter};

use crate::asr::events::WordItem;
use crate::asr::model_manager::ModelManager;
use crate::audio::resampler::AudioResampler;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTranscriptionResult {
    pub text: String,
    pub words: Vec<WordItem>,
    pub srt_content: String,
    pub duration_secs: f32,
    pub language: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWaveformInfo {
    pub duration_secs: f32,
    pub peaks: Vec<f32>,
    pub sample_rate: u32,
    pub channels: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTranscribeProgressPayload {
    pub job_id: String,
    pub progress: f32,
    pub current_secs: f32,
    pub total_secs: f32,
    pub new_words: Vec<WordItem>,
}

pub struct FileTranscriptionManager {
    pub cancel_flag: Arc<AtomicBool>,
}

impl Default for FileTranscriptionManager {
    fn default() -> Self {
        Self {
            cancel_flag: Arc::new(AtomicBool::new(false)),
        }
    }
}

pub fn decode_audio_file(file_path: &Path) -> Result<(Vec<f32>, u32), String> {
    let src = File::open(file_path)
        .map_err(|e| format!("Failed to open file at {:?}: {e}", file_path))?;
    let mss = MediaSourceStream::new(Box::new(src), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = file_path.extension().and_then(|s| s.to_str()) {
        hint.with_extension(&ext.to_lowercase());
    }

    let meta_opts: MetadataOptions = Default::default();
    let fmt_opts: FormatOptions = Default::default();

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &fmt_opts, &meta_opts)
        .map_err(|e| format!("Failed to probe audio format: {e}"))?;

    let mut format = probed.format;

    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| "No supported audio track found in file".to_string())?;

    let track_id = track.id;
    let sample_rate = track
        .codec_params
        .sample_rate
        .unwrap_or(48000);
    let channels = track
        .codec_params
        .channels
        .map(|c| c.count())
        .unwrap_or(1);

    // Native Opus decoder path for OGG/Opus voice messages (Telegram, WhatsApp, etc.)
    if track.codec_params.codec == CODEC_TYPE_OPUS {
        log::info!("Decoding Ogg/Opus audio track using native Opus decoder (channels: {channels})");
        let channels_type = if channels == 1 {
            opus::Channels::Mono
        } else {
            opus::Channels::Stereo
        };
        let mut opus_decoder = opus::Decoder::new(48000, channels_type)
            .map_err(|e| format!("Failed to create Opus decoder: {e}"))?;
        let mut mono_samples = Vec::new();

        loop {
            let packet = match format.next_packet() {
                Ok(packet) => packet,
                Err(SymphoniaError::IoError(ref e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
                Err(SymphoniaError::ResetRequired) => continue,
                Err(e) => {
                    log::warn!("Opus audio stream end/error: {e}");
                    break;
                }
            };

            if packet.track_id() != track_id {
                continue;
            }

            // Skip OGG Opus identification and comment headers (RFC 7845)
            if packet.data.starts_with(b"OpusHead") || packet.data.starts_with(b"OpusTags") {
                continue;
            }

            // Max Opus frame is 120ms (5760 samples per channel at 48kHz)
            let mut pcm_buf = vec![0.0f32; 5760 * channels];
            match opus_decoder.decode_float(&packet.data, &mut pcm_buf, false) {
                Ok(samples_per_channel) => {
                    let total_samples = samples_per_channel * channels;
                    let frame = &pcm_buf[..total_samples];
                    if channels == 1 {
                        mono_samples.extend_from_slice(frame);
                    } else {
                        for chunk in frame.chunks_exact(channels) {
                            let sum: f32 = chunk.iter().sum();
                            mono_samples.push(sum / channels as f32);
                        }
                    }
                }
                Err(e) => {
                    log::warn!("Opus packet decode error: {e:?}");
                }
            }
        }

        log::info!("Successfully decoded {} Opus audio samples at 48kHz", mono_samples.len());
        return Ok((mono_samples, 48000));
    }

    let dec_opts: DecoderOptions = Default::default();
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &dec_opts)
        .map_err(|e| format!("Failed to create audio decoder: {e}"))?;

    let mut mono_samples = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(ref e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(SymphoniaError::ResetRequired) => continue,
            Err(e) => {
                log::warn!("Audio decoding encountered error/end: {e}");
                break;
            }
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                extract_mono_f32(&decoded, channels, &mut mono_samples);
            }
            Err(SymphoniaError::IoError(_)) => break,
            Err(SymphoniaError::DecodeError(e)) => {
                log::warn!("Symphonia decode error in packet: {e}");
            }
            Err(e) => {
                log::warn!("Unhandled symphonia error: {e}");
                break;
            }
        }
    }

    Ok((mono_samples, sample_rate))
}

fn extract_mono_f32(buf: &AudioBufferRef, channels: usize, out: &mut Vec<f32>) {
    match buf {
        AudioBufferRef::F32(b) => {
            let n = b.frames();
            if channels == 1 {
                out.extend_from_slice(b.chan(0));
            } else {
                for i in 0..n {
                    let mut sum = 0.0f32;
                    for c in 0..channels {
                        sum += b.chan(c)[i];
                    }
                    out.push((sum / channels as f32).clamp(-1.0, 1.0));
                }
            }
        }
        AudioBufferRef::S16(b) => {
            let n = b.frames();
            let scale = 1.0 / 32768.0;
            if channels == 1 {
                for &s in b.chan(0) {
                    out.push((s as f32 * scale).clamp(-1.0, 1.0));
                }
            } else {
                for i in 0..n {
                    let mut sum = 0.0f32;
                    for c in 0..channels {
                        sum += b.chan(c)[i] as f32 * scale;
                    }
                    out.push((sum / channels as f32).clamp(-1.0, 1.0));
                }
            }
        }
        AudioBufferRef::U8(b) => {
            let n = b.frames();
            let scale = 1.0 / 128.0;
            for i in 0..n {
                let mut sum = 0.0f32;
                for c in 0..channels {
                    sum += (b.chan(c)[i] as f32 - 128.0) * scale;
                }
                out.push((sum / channels as f32).clamp(-1.0, 1.0));
            }
        }
        _ => {
            // Fallback: convert via sample conversion
        }
    }
}

pub fn transcribe_file(
    model_manager: Arc<ModelManager>,
    file_path: &Path,
    language_mode: &str,
    beam_width: usize,
) -> Result<FileTranscriptionResult, String> {
    log::info!("Starting file transcription for {:?} (lang: {language_mode}, beam: {beam_width})", file_path);

    let models = model_manager
        .loaded_models()
        .ok_or_else(|| "Models are not loaded. Please load models first.".to_string())?;

    let (raw_samples, sample_rate) = decode_audio_file(file_path)?;
    if raw_samples.is_empty() {
        return Err("Audio file is empty or could not be decoded".to_string());
    }

    // Resample to 16,000 Hz if needed
    let pcm_16k = if sample_rate != 16000 {
        let mut resampler = AudioResampler::new(sample_rate, 16000)?;
        let mut resampled = resampler.process(&raw_samples)?;
        let flushed = resampler.flush()?;
        resampled.extend(flushed);
        resampled
    } else {
        raw_samples
    };

    let langs_vec: Vec<&str> = match language_mode {
        "fa" => vec!["fa"],
        "en" => vec!["en"],
        _ => vec!["fa", "en"],
    };

    let transcription = tinyasr::Transcription::new(
        &*models,
        &pcm_16k,
        &langs_vec,
        beam_width.max(1),
    );

    let duration = transcription.duration();
    let mut all_words = Vec::new();

    for piece in transcription {
        for w in piece {
            all_words.push(WordItem::from(w));
        }
    }

    // Build plain text
    let mut full_text = String::new();
    for (i, w) in all_words.iter().enumerate() {
        if i > 0 && !w.join {
            full_text.push(' ');
        }
        full_text.push_str(&w.text);
    }

    let srt_content = generate_srt(&all_words);

    Ok(FileTranscriptionResult {
        text: full_text,
        words: all_words,
        srt_content,
        duration_secs: duration,
        language: language_mode.to_string(),
    })
}

pub fn generate_srt(words: &[WordItem]) -> String {
    if words.is_empty() {
        return String::new();
    }

    let mut segments = Vec::new();
    let mut current_segment: Vec<&WordItem> = Vec::new();
    let mut segment_start = words[0].start;

    for w in words {
        if current_segment.is_empty() {
            segment_start = w.start;
            current_segment.push(w);
            continue;
        }

        let last_w = current_segment.last().unwrap();
        let gap = w.start - last_w.end;
        let seg_duration = w.end - segment_start;
        let is_sentence_end = last_w.text.ends_with('.') || last_w.text.ends_with('!') || last_w.text.ends_with('?') || last_w.text.ends_with('؟');

        if current_segment.len() >= 8 || gap > 0.4 || seg_duration > 4.5 || is_sentence_end {
            segments.push((segment_start, last_w.end, current_segment.clone()));
            current_segment.clear();
            segment_start = w.start;
        }

        current_segment.push(w);
    }

    if !current_segment.is_empty() {
        let last_w = current_segment.last().unwrap();
        segments.push((segment_start, last_w.end, current_segment));
    }

    let mut srt = String::new();
    for (idx, (start, end, seg_words)) in segments.into_iter().enumerate() {
        let seg_num = idx + 1;
        let start_ts = format_srt_timestamp(start);
        let end_ts = format_srt_timestamp(end);

        let mut seg_text = String::new();
        for (i, w) in seg_words.iter().enumerate() {
            if i > 0 && !w.join {
                seg_text.push(' ');
            }
            seg_text.push_str(&w.text);
        }

        srt.push_str(&format!("{seg_num}\n{start_ts} --> {end_ts}\n{seg_text}\n\n"));
    }

    srt
}

fn format_srt_timestamp(seconds: f32) -> String {
    let total_millis = (seconds.max(0.0) * 1000.0).round() as u64;
    let hours = total_millis / 3_600_000;
    let minutes = (total_millis % 3_600_000) / 60_000;
    let secs = (total_millis % 60_000) / 1000;
    let millis = total_millis % 1000;

    format!("{hours:02}:{minutes:02}:{secs:02},{millis:03}")
}

pub fn compute_waveform_peaks(samples: &[f32], num_bars: usize) -> Vec<f32> {
    if samples.is_empty() || num_bars == 0 {
        return vec![0.2; num_bars];
    }

    let chunk_size = (samples.len() as f32 / num_bars as f32).max(1.0) as usize;
    let mut raw_peaks = Vec::with_capacity(num_bars);
    let mut max_val: f32 = 0.001;

    for i in 0..num_bars {
        let start = i * chunk_size;
        let end = ((i + 1) * chunk_size).min(samples.len());
        if start >= samples.len() {
            raw_peaks.push(0.0);
            continue;
        }

        let slice = &samples[start..end];
        let mut sum_sq = 0.0f32;
        let mut peak_in_slice = 0.0f32;
        for &s in slice {
            let abs_s = s.abs();
            if abs_s > peak_in_slice {
                peak_in_slice = abs_s;
            }
            sum_sq += s * s;
        }
        let rms = (sum_sq / slice.len() as f32).sqrt();
        let val = (rms * 0.75 + peak_in_slice * 0.25).min(1.0);
        if val > max_val {
            max_val = val;
        }
        raw_peaks.push(val);
    }

    // Normalize peaks between 0.15 and 1.0 (smooth height for Telegram-style bars)
    raw_peaks
        .into_iter()
        .map(|p| {
            let norm = (p / max_val).clamp(0.0, 1.0);
            0.15 + norm * 0.85
        })
        .collect()
}

pub fn get_waveform_info(file_path: &Path, num_bars: usize) -> Result<FileWaveformInfo, String> {
    let (samples, sample_rate) = decode_audio_file(file_path)?;
    let duration = samples.len() as f32 / sample_rate as f32;
    let peaks = compute_waveform_peaks(&samples, num_bars);

    Ok(FileWaveformInfo {
        duration_secs: duration,
        peaks,
        sample_rate,
        channels: 1,
    })
}

pub fn start_file_transcription_job(
    app: AppHandle,
    model_manager: Arc<ModelManager>,
    file_manager: Arc<FileTranscriptionManager>,
    file_path: &Path,
    language_mode: &str,
    beam_width: usize,
) -> Result<String, String> {
    let models = model_manager
        .loaded_models()
        .ok_or_else(|| "Models are not loaded. Please load models first.".to_string())?;

    let file_path_buf = file_path.to_path_buf();
    let lang = language_mode.to_string();
    let job_id = uuid::Uuid::new_v4().to_string();
    let thread_job_id = job_id.clone();

    // Reset cancel flag
    file_manager.cancel_flag.store(false, Ordering::SeqCst);
    let cancel_flag = Arc::clone(&file_manager.cancel_flag);

    std::thread::spawn(move || {
        log::info!("[FileTranscribe {thread_job_id}] Decoding audio file {:?}", file_path_buf);

        let (raw_samples, sample_rate) = match decode_audio_file(&file_path_buf) {
            Ok(res) => res,
            Err(e) => {
                log::error!("[FileTranscribe {thread_job_id}] Audio decode error: {e}");
                let _ = app.emit("file-transcribe://error", e);
                return;
            }
        };

        if raw_samples.is_empty() {
            let _ = app.emit("file-transcribe://error", "Audio file is empty or could not be decoded".to_string());
            return;
        }

        if cancel_flag.load(Ordering::SeqCst) {
            let _ = app.emit("file-transcribe://cancelled", thread_job_id);
            return;
        }

        // Resample to 16,000 Hz if needed
        let pcm_16k = if sample_rate != 16000 {
            match AudioResampler::new(sample_rate, 16000) {
                Ok(mut resampler) => {
                    match resampler.process(&raw_samples) {
                        Ok(mut resampled) => {
                            if let Ok(flushed) = resampler.flush() {
                                resampled.extend(flushed);
                            }
                            resampled
                        }
                        Err(e) => {
                            let _ = app.emit("file-transcribe://error", format!("Resampling failed: {e}"));
                            return;
                        }
                    }
                }
                Err(e) => {
                    let _ = app.emit("file-transcribe://error", format!("Resampler init failed: {e}"));
                    return;
                }
            }
        } else {
            raw_samples
        };

        let langs_vec: Vec<&str> = match lang.as_str() {
            "fa" => vec!["fa"],
            "en" => vec!["en"],
            _ => vec!["fa", "en"],
        };

        let mut transcription = tinyasr::Transcription::new(
            &*models,
            &pcm_16k,
            &langs_vec,
            beam_width.max(1),
        );

        let total_duration = transcription.duration();
        let mut all_words = Vec::new();

        // Emit initial progress at 0.0%
        let _ = app.emit("file-transcribe://progress", FileTranscribeProgressPayload {
            job_id: thread_job_id.clone(),
            progress: 0.0,
            current_secs: 0.0,
            total_secs: total_duration,
            new_words: Vec::new(),
        });

        while let Some(piece) = transcription.next() {
            if cancel_flag.load(Ordering::SeqCst) {
                log::info!("[FileTranscribe {thread_job_id}] Job cancelled by user");
                let _ = app.emit("file-transcribe://cancelled", thread_job_id.clone());
                return;
            }

            let current_pos = transcription.position();
            let progress = if total_duration > 0.0 {
                (current_pos / total_duration).clamp(0.0, 1.0)
            } else {
                1.0
            };

            let new_words: Vec<WordItem> = piece.into_iter().map(WordItem::from).collect();
            all_words.extend(new_words.clone());

            let _ = app.emit("file-transcribe://progress", FileTranscribeProgressPayload {
                job_id: thread_job_id.clone(),
                progress,
                current_secs: current_pos,
                total_secs: total_duration,
                new_words,
            });
        }

        // Build plain text
        let mut full_text = String::new();
        for (i, w) in all_words.iter().enumerate() {
            if i > 0 && !w.join {
                full_text.push(' ');
            }
            full_text.push_str(&w.text);
        }

        let srt_content = generate_srt(&all_words);

        log::info!("[FileTranscribe {thread_job_id}] Transcription completed successfully. Emitting done.");
        let _ = app.emit("file-transcribe://done", FileTranscriptionResult {
            text: full_text,
            words: all_words,
            srt_content,
            duration_secs: total_duration,
            language: lang,
        });
    });

    Ok(job_id)
}

pub fn cancel_file_transcription_job(
    file_manager: Arc<FileTranscriptionManager>,
) -> Result<(), String> {
    file_manager.cancel_flag.store(true, Ordering::SeqCst);
    Ok(())
}
