use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    pub name: String,
    pub version: String,
    pub is_offline: bool,
    pub primary_language: String,
    pub os: String,
}

#[tauri::command]
pub fn get_app_status() -> AppStatus {
    AppStatus {
        name: "VoxLocal".to_string(),
        version: "0.1.0".to_string(),
        is_offline: true,
        primary_language: "fa".to_string(),
        os: std::env::consts::OS.to_string(),
    }
}
