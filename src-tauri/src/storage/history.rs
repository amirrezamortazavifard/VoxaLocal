use parking_lot::Mutex;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptRecord {
    pub id: String,
    pub title: String,
    pub text: String,
    pub srt_content: Option<String>,
    pub language: String,
    pub duration_secs: f64,
    pub word_count: u32,
    pub created_at: String,
}

pub struct HistoryRepository {
    conn: Arc<Mutex<Connection>>,
}

impl HistoryRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    pub fn save(&self, record: &TranscriptRecord) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO transcripts (id, title, text, srt_content, language, duration_secs, word_count, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                record.id,
                record.title,
                record.text,
                record.srt_content,
                record.language,
                record.duration_secs,
                record.word_count,
                record.created_at,
            ],
        )
        .map_err(|e| format!("Failed to save transcript: {e}"))?;
        Ok(())
    }

    pub fn list_all(&self) -> Result<Vec<TranscriptRecord>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT id, title, text, srt_content, language, duration_secs, word_count, created_at
                 FROM transcripts ORDER BY created_at DESC",
            )
            .map_err(|e| format!("Failed to prepare query: {e}"))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(TranscriptRecord {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    text: row.get(2)?,
                    srt_content: row.get(3)?,
                    language: row.get(4)?,
                    duration_secs: row.get(5)?,
                    word_count: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })
            .map_err(|e| format!("Failed to execute query: {e}"))?;

        let mut results = Vec::new();
        for r in rows {
            if let Ok(item) = r {
                results.push(item);
            }
        }
        Ok(results)
    }

    pub fn delete(&self, id: &str) -> Result<bool, String> {
        let conn = self.conn.lock();
        let rows = conn
            .execute("DELETE FROM transcripts WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete transcript: {e}"))?;
        Ok(rows > 0)
    }

    pub fn clear(&self) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM transcripts", [])
            .map_err(|e| format!("Failed to clear transcripts: {e}"))?;
        Ok(())
    }
}
