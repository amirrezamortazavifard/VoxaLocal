use rusqlite::Connection;
use std::sync::Arc;
use parking_lot::Mutex;
use voxlocal_lib::storage::{HistoryRepository, SettingsRepository, TranscriptRecord};

#[test]
fn test_database_and_history_crud() {
    let conn = Connection::open_in_memory().expect("Failed to open in-memory DB");
    conn.execute_batch(
        "
        CREATE TABLE transcripts (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            text TEXT NOT NULL,
            srt_content TEXT,
            language TEXT NOT NULL,
            duration_secs REAL NOT NULL,
            word_count INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    ).expect("Init tables failed");

    let arc_conn = Arc::new(Mutex::new(conn));
    let history = HistoryRepository::new(Arc::clone(&arc_conn));
    let settings = SettingsRepository::new(Arc::clone(&arc_conn));

    // Test settings CRUD
    settings.set("language", "fa").unwrap();
    let val = settings.get("language").unwrap();
    assert_eq!(val, Some("fa".to_string()));

    // Test history CRUD
    let record = TranscriptRecord {
        id: "test-rec-1".to_string(),
        title: "تست بازشناسی گفتار".to_string(),
        text: "این یک آزمایش رونویسی گفتار فارسی است.".to_string(),
        srt_content: Some("1\n00:00:00,000 --> 00:00:02,000\nاین یک آزمایش رونویسی گفتار فارسی است.\n\n".to_string()),
        language: "fa".to_string(),
        duration_secs: 2.5,
        word_count: 7,
        created_at: "1405-09-01 12:00".to_string(),
    };

    history.save(&record).expect("Save record failed");

    let list = history.list_all().expect("List failed");
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, "test-rec-1");
    assert_eq!(list[0].word_count, 7);

    // Delete
    let deleted = history.delete("test-rec-1").expect("Delete failed");
    assert!(deleted);

    let empty_list = history.list_all().expect("List failed");
    assert_eq!(empty_list.len(), 0);
}
