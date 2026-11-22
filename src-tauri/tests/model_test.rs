use std::io::Read;
use flate2::read::GzDecoder;

fn decompress_gz(bytes: &[u8]) -> Vec<u8> {
    if bytes.starts_with(&[0x1f, 0x8b]) {
        let mut decoder = GzDecoder::new(bytes);
        let mut out = Vec::new();
        decoder.read_to_end(&mut out).expect("Failed to decompress gz");
        out
    } else {
        bytes.to_vec()
    }
}

#[test]
fn test_load_en_fa_and_vad() {
    let asr_gz = std::fs::read("../vendor/tinyasr/models/en-fa.tzf.gz").expect("Missing en-fa.tzf.gz");
    let vad_gz = std::fs::read("../vendor/tinyasr/models/silero_vad.onnx.gz").expect("Missing silero_vad.onnx.gz");

    println!("Decompressing asr model ({} bytes compressed)...", asr_gz.len());
    let asr_raw = decompress_gz(&asr_gz);
    println!("ASR uncompressed size: {} bytes", asr_raw.len());

    println!("Decompressing vad model ({} bytes compressed)...", vad_gz.len());
    let vad_raw = decompress_gz(&vad_gz);
    println!("VAD uncompressed size: {} bytes", vad_raw.len());

    assert_eq!(&asr_raw[0..4], b"TZF3", "Expected TZF3 header for en-fa model");

    let models = tinyasr::Models::load(tinyasr::Files {
        asr: &asr_raw,
        vad: &vad_raw,
    }).expect("Failed to load models");

    let langs = models.langs();
    println!("Available languages in en-fa model: {:?}", langs);
    assert!(langs.contains(&"fa"), "Model must support Persian ('fa')");
    assert!(langs.contains(&"en"), "Model must support English ('en')");

    // Test a short session with 1 second of silence
    let mut session = tinyasr::Session::new(&models, &["fa", "en"], tinyasr::Options::default());
    let silence = vec![0.0f32; 16000];
    let events = session.push(&silence);
    println!("Push silence events: {:?}", events);
    let finish_events = session.finish();
    println!("Finish silence events: {:?}", finish_events);
}
