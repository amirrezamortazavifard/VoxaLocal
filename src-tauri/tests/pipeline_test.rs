use voxlocal_lib::commands::file_commands::generate_srt;
use voxlocal_lib::asr::events::WordItem;

#[test]
fn test_srt_subtitle_generation() {
    let words = vec![
        WordItem {
            text: "سلام،".to_string(),
            start: 0.5,
            end: 0.9,
            join: false,
        },
        WordItem {
            text: "به".to_string(),
            start: 1.0,
            end: 1.2,
            join: false,
        },
        WordItem {
            text: "استودیوی".to_string(),
            start: 1.25,
            end: 1.8,
            join: false,
        },
        WordItem {
            text: "VoxLocal".to_string(),
            start: 1.9,
            end: 2.5,
            join: false,
        },
        WordItem {
            text: "خوش".to_string(),
            start: 2.6,
            end: 2.9,
            join: false,
        },
        WordItem {
            text: "آمدید.".to_string(),
            start: 2.95,
            end: 3.4,
            join: false,
        },
    ];

    let srt = generate_srt(&words);
    println!("Generated SRT:\n{srt}");

    assert!(srt.contains("00:00:00,500 -->"));
    assert!(srt.contains("VoxLocal"));
    assert!(srt.contains("خوش آمدید."));
}
