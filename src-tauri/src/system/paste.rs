use crate::system::foreground_window::restore_saved_foreground_window;
use std::thread;
use std::time::Duration;

/// Pastes text into the previously focused application window.
/// 1. Copies text to clipboard.
/// 2. Restores focus to the target window.
/// 3. Emits synthetic Ctrl+V keystrokes on Windows.
pub fn paste_text_to_active_app(text: &str) -> Result<(), String> {
    if text.trim().is_empty() {
        return Ok(());
    }

    // Set text to clipboard
    set_clipboard_text(text)?;

    // Restore focus to target window
    restore_saved_foreground_window();

    // Brief delay to allow the operating system window manager to switch focus
    thread::sleep(Duration::from_millis(60));

    // Send synthetic Ctrl+V paste keystrokes
    send_paste_shortcut()?;

    Ok(())
}

fn set_clipboard_text(text: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::DataExchange::{
            CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
        };
        use windows_sys::Win32::System::Memory::{
            GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE,
        };

        // Convert string to UTF-16 with null terminator
        let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        let bytes_len = wide.len() * 2;

        unsafe {
            if OpenClipboard(std::ptr::null_mut()) == 0 {
                return Err("Failed to open Windows clipboard".to_string());
            }

            EmptyClipboard();

            let h_mem = GlobalAlloc(GMEM_MOVEABLE, bytes_len);
            if h_mem.is_null() {
                CloseClipboard();
                return Err("Failed to allocate global memory for clipboard".to_string());
            }

            let p_mem = GlobalLock(h_mem);
            if p_mem.is_null() {
                CloseClipboard();
                return Err("Failed to lock clipboard memory".to_string());
            }

            std::ptr::copy_nonoverlapping(wide.as_ptr() as *const u8, p_mem as *mut u8, bytes_len);
            GlobalUnlock(h_mem);

            const CF_UNICODETEXT: u32 = 13;
            SetClipboardData(CF_UNICODETEXT, h_mem);
            CloseClipboard();
        }

        log::info!(
            "Successfully copied {} UTF-16 units to system clipboard",
            wide.len()
        );
        Ok(())
    }

    #[cfg(not(windows))]
    {
        log::info!(
            "Clipboard copy fallback on non-Windows: {} chars",
            text.len()
        );
        Ok(())
    }
}

fn send_paste_shortcut() -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_CONTROL,
        };

        const VK_V_KEY: u16 = 0x56; // Virtual key code for 'V'

        unsafe {
            let mut inputs: [INPUT; 4] = std::mem::zeroed();

            // 1. Ctrl Down
            inputs[0].r#type = INPUT_KEYBOARD;
            inputs[0].Anonymous.ki = KEYBDINPUT {
                wVk: VK_CONTROL,
                wScan: 0,
                dwFlags: 0,
                time: 0,
                dwExtraInfo: 0,
            };

            // 2. V Down
            inputs[1].r#type = INPUT_KEYBOARD;
            inputs[1].Anonymous.ki = KEYBDINPUT {
                wVk: VK_V_KEY,
                wScan: 0,
                dwFlags: 0,
                time: 0,
                dwExtraInfo: 0,
            };

            // 3. V Up
            inputs[2].r#type = INPUT_KEYBOARD;
            inputs[2].Anonymous.ki = KEYBDINPUT {
                wVk: VK_V_KEY,
                wScan: 0,
                dwFlags: KEYEVENTF_KEYUP,
                time: 0,
                dwExtraInfo: 0,
            };

            // 4. Ctrl Up
            inputs[3].r#type = INPUT_KEYBOARD;
            inputs[3].Anonymous.ki = KEYBDINPUT {
                wVk: VK_CONTROL,
                wScan: 0,
                dwFlags: KEYEVENTF_KEYUP,
                time: 0,
                dwExtraInfo: 0,
            };

            let sent = SendInput(
                4,
                inputs.as_ptr() as *mut _,
                std::mem::size_of::<INPUT>() as i32,
            );

            if sent != 4 {
                log::warn!("SendInput sent {}/4 keystrokes", sent);
            } else {
                log::info!("Successfully sent synthetic Ctrl+V paste input to active application");
            }
        }
        Ok(())
    }

    #[cfg(not(windows))]
    {
        Ok(())
    }
}
