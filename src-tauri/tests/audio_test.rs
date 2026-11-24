use voxlocal_lib::audio::buffer::{calculate_rms_and_peak, AudioBufferStats};
use voxlocal_lib::audio::resampler::AudioResampler;

#[test]
fn test_rms_and_peak_calculation() {
    let silence = vec![0.0f32; 1000];
    let (rms, peak, db) = calculate_rms_and_peak(&silence);
    assert_eq!(rms, 0.0);
    assert_eq!(peak, 0.0);
    assert!(db <= -96.0);

    let sine_wave: Vec<f32> = (0..1000)
        .map(|i| (i as f32 * 0.1).sin() * 0.5)
        .collect();
    let (rms2, peak2, db2) = calculate_rms_and_peak(&sine_wave);
    assert!(rms2 > 0.3 && rms2 < 0.4);
    assert!((peak2 - 0.5).abs() < 0.01);
    assert!(db2 > -15.0 && db2 < -5.0);
}

#[test]
fn test_resampling_48k_to_16k() {
    let mut resampler = AudioResampler::new(48000, 16000).expect("Failed to init resampler");
    // 1 second of 48kHz audio (48000 samples)
    let input: Vec<f32> = (0..48000)
        .map(|i| (i as f32 * 2.0 * std::f32::consts::PI * 440.0 / 48000.0).sin())
        .collect();

    let mut output = resampler.process(&input).expect("Failed to resample");
    let flushed = resampler.flush().expect("Failed to flush");
    output.extend(flushed);

    // 1 second of audio at 16kHz should be approximately 16000 samples
    let ratio = output.len() as f32 / 16000.0;
    println!("Resampled 48k (48000) -> 16k ({}) ratio: {}", output.len(), ratio);
    assert!((ratio - 1.0).abs() < 0.05, "Expected ~16000 resampled samples");
}

#[test]
fn test_resampling_44100_to_16k() {
    let mut resampler = AudioResampler::new(44100, 16000).expect("Failed to init resampler");
    let input: Vec<f32> = vec![0.1; 44100];
    let mut output = resampler.process(&input).expect("Failed to resample");
    let flushed = resampler.flush().expect("Failed to flush");
    output.extend(flushed);

    let ratio = output.len() as f32 / 16000.0;
    println!("Resampled 44.1k (44100) -> 16k ({}) ratio: {}", output.len(), ratio);
    assert!((ratio - 1.0).abs() < 0.05, "Expected ~16000 resampled samples");
}

#[test]
fn test_buffer_stats() {
    let stats = AudioBufferStats::new();
    assert_eq!(stats.total_count(), 0);
    assert_eq!(stats.dropped_count(), 0);

    stats.record_captured(1600);
    stats.record_dropped(100);

    assert_eq!(stats.total_count(), 1600);
    assert_eq!(stats.dropped_count(), 100);
}

#[test]
fn test_cpal_input_device() {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    let host = cpal::default_host();
    println!("CPAL Default Host: {:?}", host.id());

    let Some(default_in) = host.default_input_device() else {
        println!("No audio input device available in this environment (e.g. headless CI); skipping live capture test.");
        return;
    };
    println!("CPAL Default input device: {:?}", default_in.name().ok());

    let cfg = default_in.default_input_config().expect("default config");
    println!("Default input config: channels={}, sample_rate={}, format={:?}", cfg.channels(), cfg.sample_rate().0, cfg.sample_format());

    let count = Arc::new(AtomicUsize::new(0));
    let c_clone = Arc::clone(&count);

    let stream = default_in.build_input_stream(
        &cfg.into(),
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
            c_clone.fetch_add(data.len(), Ordering::SeqCst);
        },
        |err| eprintln!("Stream err: {err}"),
        None,
    ).expect("build stream");

    stream.play().expect("play stream");
    std::thread::sleep(Duration::from_millis(300));
    let samples = count.load(Ordering::SeqCst);
    println!("Captured samples in 300ms: {}", samples);
    assert!(samples > 0, "CPAL WASAPI must capture audio frames!");
}
