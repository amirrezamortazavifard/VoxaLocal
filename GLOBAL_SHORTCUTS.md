# VoxaLocal — Global Shortcuts Architecture

## Overview

VoxaLocal uses the official Tauri 2 global shortcut system (`tauri-plugin-global-shortcut`) backed by native OS hooks (`global-hotkey` / `user32.dll` on Windows) to capture system-wide key combinations while the main application is running in the background or minimized to the system tray.

---

## 1. Default Key Combination

- **Default Shortcut**: `Ctrl + Shift + Space`
- **Supported Modifiers**: `Ctrl`, `Shift`, `Alt`, `Super` (Windows Key)
- **Supported Keys**: Letters (`A-Z`), Digits (`0-9`), Function Keys (`F1-F12`), `Space`, `Tab`, `Enter`, `Backquote`.

---

## 2. Interactive Shortcut Recorder

Users can configure custom key combinations in **Settings → Global Push-to-Talk**:

1. Click on the shortcut input field. The recorder enters listening mode (`Listening...`).
2. Press the desired key combination (e.g. `Ctrl + Alt + V` or `Ctrl + Shift + Space`).
3. The recorder captures modifiers and key codes, validates the combination, and registers it with the native backend.
4. If an invalid combination is detected (e.g. modifier-only press), an informative error message is displayed.
5. Click **Reset to default** to restore `Ctrl+Shift+Space` at any time.

---

## 3. Configuration Persistence

Shortcut preferences are stored locally in the SQLite settings table (`voxlocal.db`):
```json
{
  "enabled": true,
  "shortcut": "Ctrl+Shift+Space",
  "mode": "pushToTalk",
  "autoPaste": false,
  "timeoutSeconds": 15,
  "showWaveform": true
}
```
Settings are automatically reloaded and registered upon application startup.

---

## 4. Platform Implementation Notes

### Windows (Primary Target)
- Shortcut registration is managed through Windows `RegisterHotKey` via `global-hotkey`.
- Key states (`Pressed` vs `Released`) are tracked via raw input hooks.
- System-wide hotkeys work regardless of which desktop application has focus.

### macOS & Linux
- macOS: Requires Accessibility permissions under System Preferences → Privacy & Security → Accessibility.
- Linux (X11 / Wayland): Under X11, keys are intercepted via XGrabKey. Under Wayland, desktop portals are used where available.
