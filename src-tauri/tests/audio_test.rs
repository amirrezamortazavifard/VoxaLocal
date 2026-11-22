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
