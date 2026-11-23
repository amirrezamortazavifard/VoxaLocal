use std::sync::atomic::{AtomicIsize, Ordering};

static SAVED_FOREGROUND_WINDOW: AtomicIsize = AtomicIsize::new(0);

/// Captures the currently active foreground window handle.
pub fn capture_foreground_window() -> Option<isize> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        let hwnd = unsafe { GetForegroundWindow() };
        if !hwnd.is_null() {
            let val = hwnd as isize;
            SAVED_FOREGROUND_WINDOW.store(val, Ordering::SeqCst);
            log::info!("Captured foreground window HWND: {:#x}", val);
            return Some(val);
        }
    }
    None
}

/// Stores a target window handle explicitly.
pub fn set_saved_foreground_window(hwnd: isize) {
    SAVED_FOREGROUND_WINDOW.store(hwnd, Ordering::SeqCst);
}

/// Retrieves the saved target window handle.
pub fn get_saved_foreground_window() -> Option<isize> {
    let val = SAVED_FOREGROUND_WINDOW.load(Ordering::SeqCst);
    if val != 0 {
        Some(val)
    } else {
        None
    }
}

/// Restores focus to the saved foreground window.
pub fn restore_saved_foreground_window() -> bool {
    let val = SAVED_FOREGROUND_WINDOW.load(Ordering::SeqCst);
    if val == 0 {
        return false;
    }

    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{BringWindowToTop, SetForegroundWindow};
        let hwnd = val as windows_sys::Win32::Foundation::HWND;
        unsafe {
            let res = SetForegroundWindow(hwnd);
            BringWindowToTop(hwnd);
            log::info!("Restored foreground window HWND {:#x}, result: {}", val, res != 0);
            return res != 0;
        }
    }

    #[cfg(not(windows))]
    {
        true
    }
}
