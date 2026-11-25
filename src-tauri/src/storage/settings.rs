use parking_lot::Mutex;
use rusqlite::{params, Connection};
use std::sync::Arc;

pub struct SettingsRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SettingsRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    pub fn get(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = ?1")
            .map_err(|e| format!("Failed to query setting: {e}"))?;

        let mut rows = stmt
            .query(params![key])
            .map_err(|e| format!("Failed to execute query: {e}"))?;

        if let Some(row) = rows.next().map_err(|e| format!("Error reading row: {e}"))? {
            let val: String = row
                .get(0)
                .map_err(|e| format!("Error getting string: {e}"))?;
            Ok(Some(val))
        } else {
            Ok(None)
        }
    }

    pub fn set(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )
        .map_err(|e| format!("Failed to set setting '{key}': {e}"))?;
        Ok(())
    }
}
