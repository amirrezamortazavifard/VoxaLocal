use crate::shortcuts::manager::{QuickDictationSettings, ShortcutManager};
use crate::shortcuts::state_machine::PttState;
use crate::storage::SettingsRepository;
use crate::system::paste::paste_text_to_active_app;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub fn get_quick_dictation_settings(
    shortcut_mgr: State<'_, Arc<ShortcutManager>>,
) -> Result<QuickDictationSettings, String> {
    Ok(shortcut_mgr.settings())
}

#[tauri::command]
pub fn update_quick_dictation_settings(
    app: AppHandle,
    settings: QuickDictationSettings,
    shortcut_mgr: State<'_, Arc<ShortcutManager>>,
    settings_repo: State<'_, Arc<SettingsRepository>>,
) -> Result<QuickDictationSettings, String> {
    shortcut_mgr.update_settings(&app, settings.clone())?;

    // Persist to SQLite
    if let Ok(serialized) = serde_json::to_string(&settings) {
        let _ = settings_repo.set("quick_dictation_settings", &serialized);
    }

    Ok(settings)
}

#[tauri::command]
pub fn trigger_quick_dictation_paste(
    text: String,
    app: AppHandle,
    shortcut_mgr: State<'_, Arc<ShortcutManager>>,
) -> Result<(), String> {
    // Hide overlay before pasting so focus properly returns to target app
    shortcut_mgr.dismiss_overlay(&app);

    // Paste into the previously active window
    paste_text_to_active_app(&text)
}

#[tauri::command]
pub fn dismiss_quick_dictation(
    app: AppHandle,
    shortcut_mgr: State<'_, Arc<ShortcutManager>>,
) -> Result<(), String> {
    shortcut_mgr.dismiss_overlay(&app);
    Ok(())
}

#[tauri::command]
pub fn open_in_studio(
    app: AppHandle,
    shortcut_mgr: State<'_, Arc<ShortcutManager>>,
) -> Result<(), String> {
    shortcut_mgr.dismiss_overlay(&app);

    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.show();
        let _ = main_win.unminimize();
        let _ = main_win.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub fn get_quick_dictation_state(
    shortcut_mgr: State<'_, Arc<ShortcutManager>>,
) -> Result<PttState, String> {
    Ok(shortcut_mgr.state())
}

#[tauri::command]
pub fn start_quick_dictation_session(
    app: AppHandle,
    shortcut_mgr: State<'_, Arc<ShortcutManager>>,
) -> Result<(), String> {
    shortcut_mgr.trigger_start(&app);
    Ok(())
}

#[tauri::command]
pub fn stop_quick_dictation_session(
    app: AppHandle,
    shortcut_mgr: State<'_, Arc<ShortcutManager>>,
) -> Result<(), String> {
    shortcut_mgr.trigger_stop(&app);
    Ok(())
}

#[tauri::command]
pub fn cancel_quick_dictation_session(
    app: AppHandle,
    shortcut_mgr: State<'_, Arc<ShortcutManager>>,
) -> Result<(), String> {
    shortcut_mgr.cancel_dictation_session(&app);
    Ok(())
}
