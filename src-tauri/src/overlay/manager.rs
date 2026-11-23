use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize};

pub struct OverlayManager;

impl OverlayManager {
    /// Shows the floating quick dictation overlay window.
    /// If `no_activate` is true (e.g. during Push-to-Talk recording), the window is displayed
    /// without stealing input focus from the active foreground application.
    pub fn show(app: &AppHandle, _no_activate: bool) -> Result<(), String> {
        let window = app
            .get_webview_window("quick-dictation")
            .ok_or_else(|| "Quick dictation window not found".to_string())?;

        // Ensure window is always on top and visible
        let _ = window.set_always_on_top(true);
        window.show().map_err(|e| format!("Failed to show overlay: {e}"))?;
        let _ = window.unminimize();
        let _ = window.set_focus();

        log::info!("Overlay window shown and focused.");
        Ok(())
    }

    /// Hides the floating quick dictation overlay window.
    pub fn hide(app: &AppHandle) -> Result<(), String> {
        let window = app
            .get_webview_window("quick-dictation")
            .ok_or_else(|| "Quick dictation window not found".to_string())?;

        window.hide().map_err(|e| format!("Failed to hide overlay: {e}"))?;
        log::info!("Overlay window hidden.");
        Ok(())
    }

    /// Centers or repositions the overlay on the monitor where the cursor/active window resides.
    pub fn center_on_active_monitor(app: &AppHandle) {
        if let Some(window) = app.get_webview_window("quick-dictation") {
            if let Ok(Some(monitor)) = window.current_monitor() {
                let screen_size = monitor.size();
                let screen_pos = monitor.position();

                let width = 560u32;
                let height = 185u32;
                let _ = window.set_size(tauri::Size::Physical(PhysicalSize { width, height }));

                // Position slightly below screen center or bottom-center
                let x = screen_pos.x + ((screen_size.width as i32 - width as i32) / 2);
                let y = screen_pos.y + ((screen_size.height as i32 * 68 / 100) - (height as i32 / 2));

                let _ = window.set_position(tauri::Position::Physical(PhysicalPosition { x, y }));
            }
        }
    }
}
