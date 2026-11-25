use voxlocal_lib::asr::events::WordItem;

#[test]
fn test_word_timestamp_deduplication() {
    let mut last_committed_end = -1.0f32;

    let incoming_batch_1 = vec![
        WordItem {
            text: "سلام".to_string(),
            start: 0.5,
            end: 0.9,
            join: false,
        },
        WordItem {
            text: "دوستان".to_string(),
            start: 0.95,
            end: 1.4,
            join: false,
        },
    ];

    // Filter batch 1
    let filtered_1: Vec<WordItem> = incoming_batch_1
        .into_iter()
        .filter(|w| w.start >= last_committed_end - 0.05)
        .collect();

    assert_eq!(filtered_1.len(), 2);
    if let Some(last) = filtered_1.last() {
        last_committed_end = last.end;
    }
    assert_eq!(last_committed_end, 1.4);

    // Duplicate batch arrives (same words & timestamps)
    let incoming_batch_dup = vec![
        WordItem {
            text: "سلام".to_string(),
            start: 0.5,
            end: 0.9,
            join: false,
        },
        WordItem {
            text: "دوستان".to_string(),
            start: 0.95,
            end: 1.4,
            join: false,
        },
    ];

    let filtered_dup: Vec<WordItem> = incoming_batch_dup
        .into_iter()
        .filter(|w| w.start >= last_committed_end - 0.05)
        .collect();

    assert_eq!(
        filtered_dup.len(),
        0,
        "Duplicate batch must be completely filtered out"
    );

    // Subsequent sentence arrives (new timestamps)
    let incoming_batch_2 = vec![
        WordItem {
            text: "حال".to_string(),
            start: 1.8,
            end: 2.1,
            join: false,
        },
        WordItem {
            text: "شما؟".to_string(),
            start: 2.15,
            end: 2.6,
            join: false,
        },
    ];

    let filtered_2: Vec<WordItem> = incoming_batch_2
        .into_iter()
        .filter(|w| w.start >= last_committed_end - 0.05)
        .collect();

    assert_eq!(
        filtered_2.len(),
        2,
        "New sentence with valid timestamps must pass"
    );
    if let Some(last) = filtered_2.last() {
        last_committed_end = last.end;
    }
    assert_eq!(last_committed_end, 2.6);
}
