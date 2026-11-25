use parking_lot::Mutex;
use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub struct Database {
    pub db_path: PathBuf,
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(app_local_data_dir: &Path) -> Result<Self, String> {
        let db_dir = app_local_data_dir.to_path_buf();
        let _ = fs::create_dir_all(&db_dir);
        let db_path = db_dir.join("voxlocal.db");

        log::info!("Opening SQLite database at {:?}", db_path);
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open SQLite database: {e}"))?;

        let db = Self {
            db_path,
            conn: Arc::new(Mutex::new(conn)),
        };

        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<(), String> {
        let conn = self.conn.lock();

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS transcripts (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                text TEXT NOT NULL,
                srt_content TEXT,
                language TEXT NOT NULL,
                duration_secs REAL NOT NULL,
                word_count INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_transcripts_created_at ON transcripts(created_at DESC);
            ",
        )
        .map_err(|e| format!("Failed to initialize database tables: {e}"))?;

        Ok(())
    }

    pub fn conn(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.conn)
    }
}
