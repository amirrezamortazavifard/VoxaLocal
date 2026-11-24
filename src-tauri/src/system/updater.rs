use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Builds a `ureq::Agent` configured with the OS-native TLS connector (SChannel on Windows,
/// Security.framework on macOS, OpenSSL on Linux).
pub fn build_https_agent(connect_secs: u64, read_secs: u64) -> Result<ureq::Agent, String> {
    let tls_connector = native_tls::TlsConnector::new()
        .map_err(|e| format!("Failed to initialize native TLS connector: {e}"))?;
    Ok(ureq::AgentBuilder::new()
        .tls_connector(Arc::new(tls_connector))
        .timeout_connect(Duration::from_secs(connect_secs))
        .timeout_read(Duration::from_secs(read_secs))
        .build())
}

const GITHUB_LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/amirrezamortazavifard/VoxaLocal/releases/latest";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub release_notes: String,
    pub html_url: String,
    pub asset_name: String,
    pub asset_path: String,
    pub asset_size: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub update_available: bool,
    pub update_info: Option<UpdateInfo>,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub offline_or_skipped: bool,
}

pub struct UpdaterState {
    pub pending_update: Mutex<Option<UpdateInfo>>,
    pub app_data_dir: PathBuf,
    pub is_checking: AtomicBool,
}

impl UpdaterState {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            pending_update: Mutex::new(None),
            app_data_dir,
            is_checking: AtomicBool::new(false),
        }
    }
}

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    body: Option<String>,
    html_url: String,
    draft: Option<bool>,
    prerelease: Option<bool>,
    assets: Vec<GitHubAsset>,
}

#[derive(Deserialize)]
struct GitHubAsset {
    name: String,
    size: u64,
    browser_download_url: String,
}

/// Parses a SemVer string such as `v1.2.3` or `1.2.3-beta` into `(major, minor, patch)`.
pub fn parse_semver(raw: &str) -> Option<(u64, u64, u64)> {
    let cleaned = raw.trim().trim_start_matches(['v', 'V']);
    let core = cleaned.split(['-', '+']).next()?;
    let mut parts = core.split('.');
    let major = parts.next()?.parse::<u64>().ok()?;
    let minor = parts.next()?.parse::<u64>().ok()?;
    let patch = parts.next()?.parse::<u64>().ok()?;
    Some((major, minor, patch))
}

/// Returns true if `candidate` is strictly newer than `current`.
pub fn is_newer_version(current: &str, candidate: &str) -> bool {
    match (parse_semver(current), parse_semver(candidate)) {
        (Some(cur), Some(cand)) => cand > cur,
        _ => false,
    }
}

fn select_platform_asset(assets: &[GitHubAsset]) -> Option<&GitHubAsset> {
    #[cfg(target_os = "windows")]
    {
        assets
            .iter()
            .find(|a| a.name.to_lowercase().ends_with("-setup.exe"))
            .or_else(|| assets.iter().find(|a| a.name.to_lowercase().ends_with(".exe")))
            .or_else(|| assets.iter().find(|a| a.name.to_lowercase().ends_with(".msi")))
    }

    #[cfg(target_os = "macos")]
    {
        assets
            .iter()
            .find(|a| a.name.to_lowercase().ends_with(".dmg"))
    }

    #[cfg(target_os = "linux")]
    {
        assets
            .iter()
            .find(|a| a.name.ends_with(".AppImage"))
            .or_else(|| assets.iter().find(|a| a.name.to_lowercase().ends_with(".deb")))
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = assets;
        None
    }
}

fn download_asset_silently(
    url: &str,
    dest_dir: &Path,
    asset_name: &str,
    expected_size: u64,
) -> Result<PathBuf, String> {
    fs::create_dir_all(dest_dir)
        .map_err(|e| format!("Failed to create updates directory: {e}"))?;

    let final_path = dest_dir.join(asset_name);
    if final_path.exists() {
        if let Ok(meta) = fs::metadata(&final_path) {
            if meta.len() == expected_size && expected_size > 0 {
                log::info!("Update asset already downloaded and verified: {:?}", final_path);
                return Ok(final_path);
            }
        }
    }

    let part_path = dest_dir.join(format!("{asset_name}.part"));
    let agent = build_https_agent(10, 120)?;

    let resp = agent
        .get(url)
        .set("User-Agent", "VoxaLocal-Updater")
        .call()
        .map_err(|e| format!("Failed to download update asset: {e}"))?;

    let mut reader = resp.into_reader();
    let mut file = File::create(&part_path)
        .map_err(|e| format!("Failed to create temporary update file: {e}"))?;

    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("Error reading update stream: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])
            .map_err(|e| format!("Error writing update file: {e}"))?;
    }
    file.flush()
        .map_err(|e| format!("Error flushing update file: {e}"))?;
    drop(file);

    if final_path.exists() {
        let _ = fs::remove_file(&final_path);
    }
    fs::rename(&part_path, &final_path)
        .map_err(|e| format!("Failed to finalize update file: {e}"))?;

    log::info!("Silently downloaded update package to {:?}", final_path);
    Ok(final_path)
}

/// Checks GitHub Releases for a newer version, silently downloads the installer if available,
/// and emits `app://update-ready` when ready for user confirmation to install & restart.
pub fn check_and_download_update(
    app_handle: &AppHandle,
    state: &UpdaterState,
    silent_on_network_error: bool,
) -> Result<UpdateCheckResult, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    if state
        .is_checking
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        let existing = state.pending_update.lock().clone();
        return Ok(UpdateCheckResult {
            update_available: existing.is_some(),
            update_info: existing,
            current_version,
            latest_version: None,
            offline_or_skipped: true,
        });
    }

    // Ensure flag is reset on all exit paths
    struct ResetFlag<'a>(&'a AtomicBool);
    impl<'a> Drop for ResetFlag<'a> {
        fn drop(&mut self) {
            self.0.store(false, Ordering::SeqCst);
        }
    }
    let _guard = ResetFlag(&state.is_checking);

    let agent = match build_https_agent(6, 10) {
        Ok(a) => a,
        Err(e) => {
            if silent_on_network_error {
                return Ok(UpdateCheckResult {
                    update_available: false,
                    update_info: None,
                    current_version,
                    latest_version: None,
                    offline_or_skipped: true,
                });
            }
            return Err(e);
        }
    };

    let resp = match agent
        .get(GITHUB_LATEST_RELEASE_API)
        .set("User-Agent", "VoxaLocal-Updater")
        .set("Accept", "application/vnd.github+json")
        .call()
    {
        Ok(r) => r,
        Err(e) => {
            if silent_on_network_error {
                log::info!("Silent update check skipped (offline or unreachable): {e}");
                return Ok(UpdateCheckResult {
                    update_available: false,
                    update_info: None,
                    current_version,
                    latest_version: None,
                    offline_or_skipped: true,
                });
            }
            return Err(format!("Could not reach GitHub Releases: {e}"));
        }
    };

    let release: GitHubRelease = match resp.into_json() {
        Ok(r) => r,
        Err(e) => {
            if silent_on_network_error {
                log::warn!("Silent update check JSON parse error: {e}");
                return Ok(UpdateCheckResult {
                    update_available: false,
                    update_info: None,
                    current_version,
                    latest_version: None,
                    offline_or_skipped: true,
                });
            }
            return Err(format!("Invalid GitHub release response: {e}"));
        }
    };

    if release.draft.unwrap_or(false) || release.prerelease.unwrap_or(false) {
        return Ok(UpdateCheckResult {
            update_available: false,
            update_info: None,
            current_version,
            latest_version: Some(release.tag_name),
            offline_or_skipped: false,
        });
    }

    let latest_clean = release.tag_name.trim().trim_start_matches(['v', 'V']).to_string();
    if !is_newer_version(&current_version, &latest_clean) {
        log::info!(
            "VoxaLocal is up to date (current: v{}, latest: v{}).",
            current_version,
            latest_clean
        );
        return Ok(UpdateCheckResult {
            update_available: false,
            update_info: None,
            current_version,
            latest_version: Some(latest_clean),
            offline_or_skipped: false,
        });
    }

    let Some(asset) = select_platform_asset(&release.assets) else {
        log::warn!(
            "Newer release v{} found, but no matching installer asset for current OS.",
            latest_clean
        );
        return Ok(UpdateCheckResult {
            update_available: false,
            update_info: None,
            current_version,
            latest_version: Some(latest_clean),
            offline_or_skipped: false,
        });
    };

    log::info!(
        "New VoxaLocal version v{} found (current v{}). Downloading {} silently...",
        latest_clean,
        current_version,
        asset.name
    );

    let updates_dir = state.app_data_dir.join("updates");
    let asset_path = download_asset_silently(
        &asset.browser_download_url,
        &updates_dir,
        &asset.name,
        asset.size,
    )?;

    let info = UpdateInfo {
        version: latest_clean.clone(),
        current_version: current_version.clone(),
        release_notes: release.body.unwrap_or_default(),
        html_url: release.html_url,
        asset_name: asset.name.clone(),
        asset_path: asset_path.to_string_lossy().to_string(),
        asset_size: asset.size,
    };

    *state.pending_update.lock() = Some(info.clone());
    let _ = app_handle.emit("app://update-ready", &info);

    Ok(UpdateCheckResult {
        update_available: true,
        update_info: Some(info),
        current_version,
        latest_version: Some(latest_clean),
        offline_or_skipped: false,
    })
}

/// Launches the downloaded installer and exits VoxaLocal cleanly so installation can proceed.
pub fn install_and_restart(app_handle: &AppHandle, asset_path: &str) -> Result<(), String> {
    let path = Path::new(asset_path);
    if !path.exists() {
        return Err(format!("Downloaded installer not found at {:?}", path));
    }

    #[cfg(target_os = "windows")]
    {
        let lower = asset_path.to_lowercase();
        if lower.ends_with(".msi") {
            std::process::Command::new("msiexec")
                .args(["/i", asset_path])
                .spawn()
                .map_err(|e| format!("Failed to launch MSI installer: {e}"))?;
        } else {
            std::process::Command::new(asset_path)
                .spawn()
                .map_err(|e| format!("Failed to launch setup installer: {e}"))?;
        }
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(asset_path)
            .spawn()
            .map_err(|e| format!("Failed to open macOS DMG installer: {e}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        if asset_path.ends_with(".AppImage") {
            let _ = std::process::Command::new("chmod")
                .args(["+x", asset_path])
                .status();
            std::process::Command::new(asset_path)
                .spawn()
                .map_err(|e| format!("Failed to launch new AppImage: {e}"))?;
        } else {
            std::process::Command::new("xdg-open")
                .arg(asset_path)
                .spawn()
                .map_err(|e| format!("Failed to open Linux package: {e}"))?;
        }
    }

    app_handle.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_semver_comparison() {
        assert_eq!(parse_semver("v1.0.0"), Some((1, 0, 0)));
        assert_eq!(parse_semver("1.2.3-beta"), Some((1, 2, 3)));
        assert!(is_newer_version("1.0.0", "1.0.1"));
        assert!(is_newer_version("1.0.0", "v1.1.0"));
        assert!(is_newer_version("1.0.0", "2.0.0"));
        assert!(!is_newer_version("1.0.0", "1.0.0"));
        assert!(!is_newer_version("1.2.0", "1.1.9"));
    }
}
