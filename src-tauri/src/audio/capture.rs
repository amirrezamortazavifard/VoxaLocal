use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::SampleFormat;
use crossbeam_channel::{bounded, Receiver, Sender};
use parking_lot::RwLock;
use tauri::{AppHandle, Emitter};

use crate::asr::events::AudioLevelPayload;
use crate::asr::AsrEngine;
use crate::audio::buffer::{calculate_rms_and_peak, AudioBufferStats};
use crate::audio::devices::get_input_device;
use crate::audio::resampler::AudioResampler;

pub const AUDIO_CHUNK_CAPACITY: usize = 2048;

/// Fixed-capacity audio block to guarantee zero heap allocation inside CPAL real-time callback.
#[derive(Clone, Copy)]
pub struct AudioBlock {
    pub data: [f32; AUDIO_CHUNK_CAPACITY],
    pub len: usize,
}

impl AudioBlock {
    #[inline(always)]
    pub fn new() -> Self {
        Self {
            data: [0.0f32; AUDIO_CHUNK_CAPACITY],
            len: 0,
        }
    }
}

enum CaptureControl {
    Stop,
}

pub struct AudioCapture {
    selected_device_name: Arc<RwLock<Option<String>>>,
    control_tx: Arc<RwLock<Option<Sender<CaptureControl>>>>,
    is_running: Arc<AtomicBool>,
    capture_handle: Arc<RwLock<Option<JoinHandle<()>>>>,
    stats: Arc<AudioBufferStats>,
}

impl AudioCapture {
    pub fn new() -> Self {
        Self {
            selected_device_name: Arc::new(RwLock::new(None)),
            control_tx: Arc::new(RwLock::new(None)),
            is_running: Arc::new(AtomicBool::new(false)),
            capture_handle: Arc::new(RwLock::new(None)),
            stats: Arc::new(AudioBufferStats::new()),
        }
    }

    pub fn set_selected_device(&self, name: Option<String>) {
        *self.selected_device_name.write() = name;
    }

    pub fn get_selected_device(&self) -> Option<String> {
        self.selected_device_name.read().clone()
    }

    pub fn is_capturing(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    pub fn stats(&self) -> Arc<AudioBufferStats> {
        Arc::clone(&self.stats)
    }

    pub fn start_capture(&self, app: AppHandle, asr_engine: Arc<AsrEngine>) -> Result<(), String> {
        if self.is_running.load(Ordering::SeqCst) {
            log::warn!("Audio capture is already running");
            return Ok(());
        }

        let device_name = self.selected_device_name.read().clone();
        let (device, supported_config) = get_input_device(device_name.as_deref())?;

        let sample_format = supported_config.sample_format();
        let channels = supported_config.channels() as usize;
        let sample_rate = supported_config.sample_rate().0;
        let config: cpal::StreamConfig = supported_config.into();

        log::info!(
            "Starting CPAL audio capture on device: '{}', format: {:?}, channels: {}, sample_rate: {}Hz",
            device.name().unwrap_or_else(|_| "Unknown".to_string()),
            sample_format,
            channels,
            sample_rate
        );

        let (audio_tx, audio_rx) = bounded::<AudioBlock>(128);
        let (control_tx, control_rx) = bounded::<CaptureControl>(1);

        let stats_clone = Arc::clone(&self.stats);
        let is_running_clone = Arc::clone(&self.is_running);
        self.is_running.store(true, Ordering::SeqCst);
        *self.control_tx.write() = Some(control_tx);

        let capture_worker = thread::Builder::new()
            .name("voxlocal-audio-capture-thread".to_string())
            .spawn(move || {
                let err_fn = |err| {
                    log::error!("CPAL audio stream error: {err}");
                };

                let stream_res = match sample_format {
                    SampleFormat::F32 => {
                        let tx = audio_tx.clone();
                        let stats = Arc::clone(&stats_clone);
                        device.build_input_stream(
                            &config,
                            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                                push_downmixed_f32(data, channels, &tx, &stats);
                            },
                            err_fn,
                            None,
                        )
                    }
                    SampleFormat::I16 => {
                        let tx = audio_tx.clone();
                        let stats = Arc::clone(&stats_clone);
                        device.build_input_stream(
                            &config,
                            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                                push_downmixed_i16(data, channels, &tx, &stats);
                            },
                            err_fn,
                            None,
                        )
                    }
                    SampleFormat::U16 => {
                        let tx = audio_tx.clone();
                        let stats = Arc::clone(&stats_clone);
                        device.build_input_stream(
                            &config,
                            move |data: &[u16], _: &cpal::InputCallbackInfo| {
                                push_downmixed_u16(data, channels, &tx, &stats);
                            },
                            err_fn,
                            None,
                        )
                    }
                    _ => {
                        log::error!("Unsupported CPAL sample format");
                        return;
                    }
                };

                let stream = match stream_res {
                    Ok(s) => s,
                    Err(e) => {
                        log::error!("Failed to build input stream: {e}");
                        return;
                    }
                };

                if let Err(e) = stream.play() {
                    log::error!("Failed to start CPAL stream: {e}");
                    return;
                }

                let is_running_proc = Arc::clone(&is_running_clone);
                let app_proc = app.clone();
                let asr_engine_proc = Arc::clone(&asr_engine);
                let proc_handle = thread::spawn(move || {
                    run_capture_processing_loop(app_proc, asr_engine_proc, audio_rx, sample_rate, is_running_proc);
                });

                let _ = control_rx.recv();

                let _ = stream.pause();
                drop(stream);

                is_running_clone.store(false, Ordering::SeqCst);
                let _ = proc_handle.join();
                log::info!("Audio capture stream stopped cleanly on capture thread.");
            })
            .map_err(|e| format!("Failed to spawn audio capture thread: {e}"))?;

        *self.capture_handle.write() = Some(capture_worker);
        Ok(())
    }

    pub fn stop_capture(&self) {
        if !self.is_running.swap(false, Ordering::SeqCst) {
            return;
        }

        if let Some(tx) = self.control_tx.write().take() {
            let _ = tx.send(CaptureControl::Stop);
        }

        if let Some(handle) = self.capture_handle.write().take() {
            let _ = handle.join();
        }

        log::info!("CPAL audio capture stopped.");
    }
}

/// Zero-allocation mono downmixing from f32 input into fixed-size stack blocks.
#[inline(always)]
fn push_downmixed_f32(
    data: &[f32],
    channels: usize,
    tx: &Sender<AudioBlock>,
    stats: &AudioBufferStats,
) {
    if channels == 0 {
        return;
    }

    let total_frames = data.len() / channels;
    let mut frame_idx = 0;
    let ch_f32 = channels as f32;

    while frame_idx < total_frames {
        let mut block = AudioBlock::new();
        let chunk_frames = (total_frames - frame_idx).min(AUDIO_CHUNK_CAPACITY);

        if channels == 1 {
            for i in 0..chunk_frames {
                block.data[i] = data[frame_idx + i].clamp(-1.0, 1.0);
            }
        } else {
            for i in 0..chunk_frames {
                let start = (frame_idx + i) * channels;
                let frame = &data[start..start + channels];
                let sum: f32 = frame.iter().sum();
                block.data[i] = (sum / ch_f32).clamp(-1.0, 1.0);
            }
        }

        block.len = chunk_frames;
        stats.record_captured(chunk_frames);

        if tx.try_send(block).is_err() {
            stats.record_dropped(chunk_frames);
        }

        frame_idx += chunk_frames;
    }
}

/// Zero-allocation mono downmixing from i16 input into fixed-size stack blocks.
#[inline(always)]
fn push_downmixed_i16(
    data: &[i16],
    channels: usize,
    tx: &Sender<AudioBlock>,
    stats: &AudioBufferStats,
) {
    if channels == 0 {
        return;
    }

    let total_frames = data.len() / channels;
    let mut frame_idx = 0;
    let scale = 1.0 / 32768.0;
    let ch_f32 = channels as f32;

    while frame_idx < total_frames {
        let mut block = AudioBlock::new();
        let chunk_frames = (total_frames - frame_idx).min(AUDIO_CHUNK_CAPACITY);

        if channels == 1 {
            for i in 0..chunk_frames {
                block.data[i] = (data[frame_idx + i] as f32 * scale).clamp(-1.0, 1.0);
            }
        } else {
            for i in 0..chunk_frames {
                let start = (frame_idx + i) * channels;
                let frame = &data[start..start + channels];
                let sum: f32 = frame.iter().map(|&s| s as f32 * scale).sum();
                block.data[i] = (sum / ch_f32).clamp(-1.0, 1.0);
            }
        }

        block.len = chunk_frames;
        stats.record_captured(chunk_frames);

        if tx.try_send(block).is_err() {
            stats.record_dropped(chunk_frames);
        }

        frame_idx += chunk_frames;
    }
}

/// Zero-allocation mono downmixing from u16 input into fixed-size stack blocks.
#[inline(always)]
fn push_downmixed_u16(
    data: &[u16],
    channels: usize,
    tx: &Sender<AudioBlock>,
    stats: &AudioBufferStats,
) {
    if channels == 0 {
        return;
    }

    let total_frames = data.len() / channels;
    let mut frame_idx = 0;
    let scale = 1.0 / 32768.0;
    let ch_f32 = channels as f32;

    while frame_idx < total_frames {
        let mut block = AudioBlock::new();
        let chunk_frames = (total_frames - frame_idx).min(AUDIO_CHUNK_CAPACITY);

        for i in 0..chunk_frames {
            let start = (frame_idx + i) * channels;
            let frame = &data[start..start + channels];
            let sum: f32 = frame.iter().map(|&s| (s as f32 - 32768.0) * scale).sum();
            block.data[i] = (sum / ch_f32).clamp(-1.0, 1.0);
        }

        block.len = chunk_frames;
        stats.record_captured(chunk_frames);

        if tx.try_send(block).is_err() {
            stats.record_dropped(chunk_frames);
        }

        frame_idx += chunk_frames;
    }
}

fn run_capture_processing_loop(
    app: AppHandle,
    asr_engine: Arc<AsrEngine>,
    rx: Receiver<AudioBlock>,
    source_sample_rate: u32,
    is_running: Arc<AtomicBool>,
) {
    let mut resampler = match AudioResampler::new(source_sample_rate, 16000) {
        Ok(r) => r,
        Err(e) => {
            log::error!("Failed to initialize audio resampler: {e}");
            return;
        }
    };

    let mut last_level_emit = Instant::now();
    let level_emit_interval = Duration::from_millis(50);

    while is_running.load(Ordering::Relaxed) {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(block) => {
                if block.len == 0 {
                    continue;
                }
                let raw_mono_slice = &block.data[..block.len];

                if last_level_emit.elapsed() >= level_emit_interval {
                    let (rms, peak, db) = calculate_rms_and_peak(raw_mono_slice);
                    let is_speech = rms > 0.003 || db > -52.0;
                    let _ = app.emit("audio://level", AudioLevelPayload { rms, peak, db, is_speech });
                    last_level_emit = Instant::now();
                }

                match resampler.process(raw_mono_slice) {
                    Ok(resampled_16k) => {
                        if !resampled_16k.is_empty() {
                            asr_engine.feed_audio(resampled_16k);
                        }
                    }
                    Err(e) => {
                        log::error!("Resampling error in capture worker: {e}");
                    }
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => {}
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                break;
            }
        }
    }

    if let Ok(flushed) = resampler.flush() {
        if !flushed.is_empty() {
            asr_engine.feed_audio(flushed);
        }
    }

    let _ = app.emit("audio://level", AudioLevelPayload {
        rms: 0.0,
        peak: 0.0,
        db: -96.0,
        is_speech: false,
    });
}
