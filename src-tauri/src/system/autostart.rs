use std::path::PathBuf;

/// Checks whether VoxaLocal is currently configured to launch automatically on OS startup.
pub fn is_autostart_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let run_key = match hkcu.open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run") {
            Ok(key) => key,
            Err(_) => return Ok(false),
        };
        let val: Result<String, _> = run_key.get_value("VoxaLocal");
        Ok(val.is_ok())
    }

    #[cfg(target_os = "macos")]
    {
        let plist_path = macos_plist_path()?;
        Ok(plist_path.exists())
    }

    #[cfg(target_os = "linux")]
    {
        let desktop_path = linux_desktop_path()?;
        Ok(desktop_path.exists())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Ok(false)
    }
}

/// Enables or disables launching VoxaLocal automatically on OS startup.
pub fn set_autostart_enabled(enabled: bool) -> Result<(), String> {
    let exe_path: PathBuf = std::env::current_exe()
        .map_err(|e| format!("Failed to resolve current executable path: {e}"))?;

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (run_key, _) = hkcu
            .create_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Run", KEY_WRITE)
            .map_err(|e| format!("Failed to open Windows Startup registry key: {e}"))?;

        if enabled {
            let quoted_cmd = format!("\"{}\"", exe_path.display());
            run_key
                .set_value("VoxaLocal", &quoted_cmd)
                .map_err(|e| format!("Failed to write Windows Startup registry value: {e}"))?;
            log::info!("Enabled Windows Startup autostart: {quoted_cmd}");
        } else {
            match run_key.delete_value("VoxaLocal") {
                Ok(_) => log::info!("Disabled Windows Startup autostart."),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    log::info!("Windows Startup autostart was already disabled.");
                }
                Err(e) => {
                    return Err(format!("Failed to remove Windows Startup registry value: {e}"));
                }
            }
        }
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        let plist_path = macos_plist_path()?;
        if enabled {
            if let Some(parent) = plist_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create LaunchAgents directory: {e}"))?;
            }
            let plist_content = format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.voxlocal.studio</string>
    <key>ProgramArguments</key>
    <array>
        <string>{}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
"#,
                exe_path.display()
            );
            std::fs::write(&plist_path, plist_content)
                .map_err(|e| format!("Failed to write macOS LaunchAgent plist: {e}"))?;
        } else if plist_path.exists() {
            std::fs::remove_file(&plist_path)
                .map_err(|e| format!("Failed to remove macOS LaunchAgent plist: {e}"))?;
        }
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        let desktop_path = linux_desktop_path()?;
        if enabled {
            if let Some(parent) = desktop_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create autostart directory: {e}"))?;
            }
            let desktop_content = format!(
                "[Desktop Entry]\nType=Application\nName=VoxaLocal\nExec=\"{}\"\nX-GNOME-Autostart-enabled=true\n",
                exe_path.display()
            );
            std::fs::write(&desktop_path, desktop_content)
                .map_err(|e| format!("Failed to write Linux autostart file: {e}"))?;
        } else if desktop_path.exists() {
            std::fs::remove_file(&desktop_path)
                .map_err(|e| format!("Failed to remove Linux autostart file: {e}"))?;
        }
        Ok(())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = (enabled, exe_path);
        Err("Autostart is not supported on this operating system".to_string())
    }
}

#[cfg(target_os = "macos")]
fn macos_plist_path() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or_else(|| "HOME env var not set".to_string())?;
    Ok(PathBuf::from(home)
        .join("Library")
        .join("LaunchAgents")
        .join("com.voxlocal.studio.plist"))
}

#[cfg(target_os = "linux")]
fn linux_desktop_path() -> Result<PathBuf, String> {
    let config_dir = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
        .ok_or_else(|| "Could not determine Linux config directory".to_string())?;
    Ok(config_dir.join("autostart").join("voxlocal.desktop"))
}
