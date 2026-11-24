use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, State};

use crate::asr::model_manager::InstalledModelEntry;
use crate::asr::{ModelInfo, ModelManager};
use crate::storage::SettingsRepository;
use crate::system::updater::build_https_agent;

const GITHUB_MODELS_API: &str =
    "https://api.github.com/repos/amirrezamortazavifard/VoxaLocal/contents/models";

#[derive(Deserialize)]
struct GitHubContentItem {
    name: String,
    size: u64,
    download_url: Option<String>,
    #[serde(rename = "type")]
    item_type: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteModelInfo {
    pub filename: String,
    pub target_filename: String,
    pub display_name_fa: String,
    pub display_name_en: String,
    pub languages: Vec<String>,
    pub size_bytes: u64,
    pub download_url: String,
    pub is_installed: bool,
    pub is_active: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadProgressPayload {
    pub filename: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f32,
    pub speed_kbps: f32,
    pub status: String, // "downloading" | "verifying" | "done" | "cancelled" | "error"
}

fn describe_model(stem: &str) -> (&'static str, &'static str, Vec<&'static str>) {
    match stem {
        "en-fa.tzf" => ("فارسی + انگلیسی (پیش‌فرض)", "Persian + English (Default)", vec!["FA", "EN"]),
        "ar.tzf" => ("عربی (استاندارد و گویش‌ها)", "Arabic (Standard & Dialects)", vec!["AR"]),
        "fr-de.tzf" => ("فرانسوی + آلمانی", "French + German", vec!["FR", "DE"]),
        "en-es-it-pt.tzf" => ("انگلیسی + اسپانیایی + ایتالیایی + پرتغالی", "English + Spanish + Italian + Portuguese", vec!["EN", "ES", "IT", "PT"]),
        "en-ru-uk.tzf" => ("انگلیسی + روسی + اوکراینی", "English + Russian + Ukrainian", vec!["EN", "RU", "UK"]),
        "en-km.tzf" => ("انگلیسی + خمری", "English + Khmer", vec!["EN", "KM"]),
        "id-ms.tzf" => ("اندونزیایی + مالایی", "Indonesian + Malay", vec!["ID", "MS"]),
        "uz.tzf" => ("ازبکی (لاتین و سیریلیک)", "Uzbek (Latin & Cyrillic)", vec!["UZ"]),
        _ => ("مدل گفتار TinyASR", "TinyASR Speech Model", vec!["ASR"]),
    }
}

#[tauri::command]
pub fn get_model_status(model_manager: State<'_, Arc<ModelManager>>) -> Result<ModelInfo, String> {
    model_manager.refresh_status();
    Ok(model_manager.get_info())
}

#[tauri::command]
pub fn import_model_files(
    asr_path: String,
    vad_path: String,
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<ModelInfo, String> {
    let asr_buf = PathBuf::from(asr_path);
    let vad_buf = PathBuf::from(vad_path);
    model_manager.import_model_files(&asr_buf, &vad_buf)
}

#[tauri::command]
pub fn load_asr_models(
    threads: Option<usize>,
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<ModelInfo, String> {
    let th = threads.unwrap_or(4);
    model_manager.load_models(th)?;
    Ok(model_manager.get_info())
}

#[tauri::command]
pub fn unload_asr_models(model_manager: State<'_, Arc<ModelManager>>) -> Result<ModelInfo, String> {
    model_manager.unload_models();
    Ok(model_manager.get_info())
}

#[tauri::command]
pub fn list_installed_models(
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<Vec<InstalledModelEntry>, String> {
    Ok(model_manager.list_installed_models())
}

#[tauri::command]
pub fn set_active_model(
    filename: String,
    threads: Option<usize>,
    model_manager: State<'_, Arc<ModelManager>>,
    settings_repo: State<'_, Arc<SettingsRepository>>,
) -> Result<ModelInfo, String> {
    let info = model_manager.set_active_model(&filename, threads.unwrap_or(4))?;
    let _ = settings_repo.set("active_asr_model", &filename);
    Ok(info)
}

#[tauri::command]
pub fn delete_installed_model(
    filename: String,
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<(), String> {
    model_manager.delete_installed_model(&filename)
}

#[tauri::command]
pub async fn fetch_remote_models(
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<Vec<RemoteModelInfo>, String> {
    let installed = model_manager.list_installed_models();
    let active_name = model_manager.active_filename();

    tauri::async_runtime::spawn_blocking(move || {
        let agent = build_https_agent(8, 15)?;
        let resp = agent
            .get(GITHUB_MODELS_API)
            .set("User-Agent", "VoxaLocal-ModelHub")
            .set("Accept", "application/vnd.github+json")
            .call()
            .map_err(|e| format!("Failed to fetch GitHub models list: {e}"))?;

        let items: Vec<GitHubContentItem> = resp
            .into_json()
            .map_err(|e| format!("Invalid GitHub models API response: {e}"))?;

        let mut models = Vec::new();
        for item in items {
            if item.item_type != "file" {
                continue;
            }
            if !(item.name.ends_with(".tzf.gz") || item.name.ends_with(".tzf")) {
                continue;
            }
            let Some(url) = item.download_url else {
                continue;
            };
            let target_filename = item.name.trim_end_matches(".gz").to_string();
            let (name_fa, name_en, langs) = describe_model(&target_filename);
            let is_installed = installed.iter().any(|m| m.filename == target_filename);
            let is_active = target_filename == active_name;

            models.push(RemoteModelInfo {
                filename: item.name,
                target_filename,
                display_name_fa: name_fa.to_string(),
                display_name_en: name_en.to_string(),
                languages: langs.into_iter().map(|s| s.to_string()).collect(),
                size_bytes: item.size,
                download_url: url,
                is_installed,
                is_active,
            });
        }

        models.sort_by(|a, b| {
            b.is_active
                .cmp(&a.is_active)
                .then_with(|| b.is_installed.cmp(&a.is_installed))
                .then_with(|| a.target_filename.cmp(&b.target_filename))
        });

        Ok(models)
    })
    .await
    .map_err(|e| format!("Remote model discovery task failed: {e}"))?
}

#[tauri::command]
pub async fn download_and_install_model(
    app_handle: AppHandle,
    filename: String,
    download_url: String,
    expected_size: Option<u64>,
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<InstalledModelEntry, String> {
    let manager = Arc::clone(&model_manager);
    manager.download_cancel.store(false, Ordering::SeqCst);

    tauri::async_runtime::spawn_blocking(move || {
        let agent = build_https_agent(10, 180)?;
        let resp = agent
            .get(&download_url)
            .set("User-Agent", "VoxaLocal-ModelDownloader")
            .call()
            .map_err(|e| format!("Failed to start model download: {e}"))?;

        let content_len = resp
            .header("Content-Length")
            .and_then(|v| v.parse::<u64>().ok())
            .or(expected_size)
            .unwrap_or(0);

        let mut reader = resp.into_reader();
        let mut downloaded_bytes: Vec<u8> =
            Vec::with_capacity(usize::try_from(content_len).unwrap_or(32 * 1024 * 1024));
        let mut buf = [0u8; 64 * 1024];
        let start = Instant::now();
        let mut last_emit = Instant::now();

        loop {
            if manager.download_cancel.load(Ordering::SeqCst) {
                let _ = app_handle.emit(
                    "model://download-progress",
                    ModelDownloadProgressPayload {
                        filename: filename.clone(),
                        downloaded_bytes: downloaded_bytes.len() as u64,
                        total_bytes: content_len,
                        percent: 0.0,
                        speed_kbps: 0.0,
                        status: "cancelled".to_string(),
                    },
                );
                return Err("Model download cancelled by user".to_string());
            }

            let n = reader
                .read(&mut buf)
                .map_err(|e| format!("Network error while downloading model: {e}"))?;
            if n == 0 {
                break;
            }
            downloaded_bytes.extend_from_slice(&buf[..n]);

            if last_emit.elapsed().as_millis() >= 120 {
                let dl = downloaded_bytes.len() as u64;
                let elapsed = start.elapsed().as_secs_f32().max(0.05);
                let speed_kbps = (dl as f32 / 1024.0) / elapsed;
                let percent = if content_len > 0 {
                    ((dl as f32 / content_len as f32) * 100.0).min(100.0)
                } else {
                    0.0
                };
                let _ = app_handle.emit(
                    "model://download-progress",
                    ModelDownloadProgressPayload {
                        filename: filename.clone(),
                        downloaded_bytes: dl,
                        total_bytes: content_len,
                        percent,
                        speed_kbps,
                        status: "downloading".to_string(),
                    },
                );
                last_emit = Instant::now();
            }
        }

        let dl_final = downloaded_bytes.len() as u64;
        let _ = app_handle.emit(
            "model://download-progress",
            ModelDownloadProgressPayload {
                filename: filename.clone(),
                downloaded_bytes: dl_final,
                total_bytes: content_len.max(dl_final),
                percent: 100.0,
                speed_kbps: 0.0,
                status: "verifying".to_string(),
            },
        );

        let entry = manager.install_asr_model_bytes(&filename, &downloaded_bytes)?;

        let _ = app_handle.emit(
            "model://download-progress",
            ModelDownloadProgressPayload {
                filename: filename.clone(),
                downloaded_bytes: dl_final,
                total_bytes: content_len.max(dl_final),
                percent: 100.0,
                speed_kbps: 0.0,
                status: "done".to_string(),
            },
        );

        Ok(entry)
    })
    .await
    .map_err(|e| format!("Model download task panicked: {e}"))?
}

#[tauri::command]
pub fn cancel_model_download(model_manager: State<'_, Arc<ModelManager>>) {
    model_manager.download_cancel.store(true, Ordering::SeqCst);
}
