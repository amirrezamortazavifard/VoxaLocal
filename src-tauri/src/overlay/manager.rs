use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize};

pub struct OverlayManager;

impl OverlayManager {
    /// Shows the floating quick dictation overlay window.
    /// If `no_activate` is true (e.g. during Push-to-Talk recording), the window is displayed
    /// without stealing input focus from the active foreground application.
    pub fn show(app: &AppHandle, no_activate: bool) -> Result<(), String> {
        let window = app
            .get_webview_window("quick-dictation")
            .ok_or_else(|| "Quick dictation window not found".to_string())?;

        // Ensure window is always on top
        let _ = window.set_always_on_top(true);

        #[cfg(windows)]
        {
            if no_activate {
                use windows_sys::Win32::UI::WindowsAndMessaging::{
                    SetWindowPos, ShowWindow, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
                    SWP_SHOWWINDOW, SW_SHOWNOACTIVATE,
                };

                if let Ok(hwnd) = window.hwnd() {
                    unsafe {
                        let win_hwnd = hwnd.0 as windows_sys::Win32::Foundation::HWND;
                        ShowWindow(win_hwnd, SW_SHOWNOACTIVATE);
                        SetWindowPos(
                            win_hwnd,
                            HWND_TOPMOST,
                            0,
                            0,
                            0,
                            0,
                            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
                        );
                    }
                    log::info!("Overlay window shown with SW_SHOWNOACTIVATE (focus preserved).");
                    return Ok(());
                }
            }
        }

        window.show().map_err(|e| format!("Failed to show overlay: {e}"))?;
        if !no_activate {
            let _ = window.set_focus();
        }
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
                let height = 240u32;
                let _ = window.set_size(tauri::Size::Physical(PhysicalSize { width, height }));

                // Position slightly below screen center or bottom-center
                let x = screen_pos.x + ((screen_size.width as i32 - width as i32) / 2);
                let y = screen_pos.y + ((screen_size.height as i32 * 65 / 100) - (height as i32 / 2));

                let _ = window.set_position(tauri::Position::Physical(PhysicalPosition { x, y }));
            }
        }
    }
}
