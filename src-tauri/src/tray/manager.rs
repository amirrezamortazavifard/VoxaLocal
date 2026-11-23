use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

pub struct TrayManager;

impl TrayManager {
    pub fn setup(app: &AppHandle) -> Result<(), String> {
        let open_item = MenuItem::with_id(
            app,
            "open_studio",
            "Open VoxaLocal Studio",
            true,
            None::<&str>,
        )
        .map_err(|e| format!("Failed to create menu item: {e}"))?;

        let status_item = MenuItem::with_id(
            app,
            "quick_dictation_info",
            "Quick Dictation: Ready (Ctrl+Shift+Space)",
            false,
            None::<&str>,
        )
        .map_err(|e| format!("Failed to create menu item: {e}"))?;

        let quit_item = MenuItem::with_id(
            app,
            "quit",
            "Quit VoxaLocal",
            true,
            None::<&str>,
        )
        .map_err(|e| format!("Failed to create menu item: {e}"))?;

        let menu = Menu::with_items(app, &[&open_item, &status_item, &quit_item])
            .map_err(|e| format!("Failed to create tray menu: {e}"))?;

        let icon = app
            .default_window_icon()
            .ok_or_else(|| "Default window icon not found".to_string())?
            .clone();

        let _tray = TrayIconBuilder::with_id("voxlocal-tray")
            .icon(icon)
            .tooltip("VoxaLocal — Offline Speech Recognition")
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| match event.id().as_ref() {
                "open_studio" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                }
                "quit" => {
                    log::info!("User initiated application exit from system tray.");
                    app.exit(0);
                }
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    let app = tray.app_handle();
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                }
            })
            .build(app)
            .map_err(|e| format!("Failed to build system tray: {e}"))?;

        log::info!("System tray icon registered successfully.");
        Ok(())
    }
}
