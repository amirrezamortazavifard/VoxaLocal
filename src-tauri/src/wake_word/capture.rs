use cpal::traits::{DeviceTrait, StreamTrait};
use crossbeam_channel::{bounded, Sender};

use crate::audio::devices::get_input_device;
use crate::audio::resampler::AudioResampler;

pub const STANDBY_CHUNK_CAPACITY: usize = 2048;

pub struct StandbyAudioBlock {
    pub data: [f32; STANDBY_CHUNK_CAPACITY],
    pub len: usize,
}

impl StandbyAudioBlock {
    fn new() -> Self {
        Self {
            data: [0.0; STANDBY_CHUNK_CAPACITY],
            len: 0,
        }
    }
}

pub struct StandbyMicStream {
    pub stream: cpal::Stream,
    pub sample_rx: crossbeam_channel::Receiver<StandbyAudioBlock>,
    pub resampler: AudioResampler,
}

pub fn open_standby_mic_stream(device_name: Option<&str>) -> Result<StandbyMicStream, String> {
    let (device, config) = get_input_device(device_name)?;
    let channels = config.channels() as usize;
    let source_rate = config.sample_rate().0;
    let sample_format = config.sample_format();

    let resampler = AudioResampler::new(source_rate, 16_000)?;
    let (tx, rx) = bounded::<StandbyAudioBlock>(128);

    let err_fn = |err| {
        log::error!("Standby wake-word audio stream error: {err}");
    };

    let cpal_config: cpal::StreamConfig = config.into();
    let stream = match sample_format {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &cpal_config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                push_downmixed_f32(data, channels, &tx);
            },
            err_fn,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &cpal_config,
            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                push_downmixed_i16(data, channels, &tx);
            },
            err_fn,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &cpal_config,
            move |data: &[u16], _: &cpal::InputCallbackInfo| {
                push_downmixed_u16(data, channels, &tx);
            },
            err_fn,
            None,
        ),
        other => {
            return Err(format!(
                "Unsupported sample format for wake word standby: {other:?}"
            ))
        }
    }
    .map_err(|e| format!("Failed to build standby input stream: {e}"))?;

    stream
        .play()
        .map_err(|e| format!("Failed to play standby input stream: {e}"))?;

    Ok(StandbyMicStream {
        stream,
        sample_rx: rx,
        resampler,
    })
}

fn push_downmixed_f32(data: &[f32], channels: usize, tx: &Sender<StandbyAudioBlock>) {
    let mut block = StandbyAudioBlock::new();
    let ch = channels.max(1);
    for frame in data.chunks(ch) {
        let sum: f32 = frame.iter().copied().sum();
        block.data[block.len] = sum / ch as f32;
        block.len += 1;
        if block.len == STANDBY_CHUNK_CAPACITY {
            let _ = tx.try_send(block);
            block = StandbyAudioBlock::new();
        }
    }
    if block.len > 0 {
        let _ = tx.try_send(block);
    }
}

fn push_downmixed_i16(data: &[i16], channels: usize, tx: &Sender<StandbyAudioBlock>) {
    let mut block = StandbyAudioBlock::new();
    let ch = channels.max(1);
    for frame in data.chunks(ch) {
        let sum: f32 = frame.iter().map(|&s| s as f32 / 32768.0).sum();
        block.data[block.len] = sum / ch as f32;
        block.len += 1;
        if block.len == STANDBY_CHUNK_CAPACITY {
            let _ = tx.try_send(block);
            block = StandbyAudioBlock::new();
        }
    }
    if block.len > 0 {
        let _ = tx.try_send(block);
    }
}

fn push_downmixed_u16(data: &[u16], channels: usize, tx: &Sender<StandbyAudioBlock>) {
    let mut block = StandbyAudioBlock::new();
    let ch = channels.max(1);
    for frame in data.chunks(ch) {
        let sum: f32 = frame.iter().map(|&s| (s as f32 - 32768.0) / 32768.0).sum();
        block.data[block.len] = sum / ch as f32;
        block.len += 1;
        if block.len == STANDBY_CHUNK_CAPACITY {
            let _ = tx.try_send(block);
            block = StandbyAudioBlock::new();
        }
    }
    if block.len > 0 {
        let _ = tx.try_send(block);
    }
}
