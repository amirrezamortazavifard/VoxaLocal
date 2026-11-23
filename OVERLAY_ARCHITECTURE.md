# VoxaLocal — Floating Overlay Architecture

## Overview

The **Quick Dictation Floating Overlay** is a dedicated lightweight secondary window (`quick-dictation`) configured in `tauri.conf.json`. Rather than cramming the full Studio interface into a small window, the overlay is purposefully designed for distraction-free rapid voice input.

---

## 1. Window Configuration

In `src-tauri/tauri.conf.json`:
```json
{
  "label": "quick-dictation",
  "title": "VoxaLocal Quick Dictation",
  "url": "index.html?window=quick-dictation",
  "width": 560,
  "height": 240,
  "resizable": false,
  "decorations": false,
  "alwaysOnTop": true,
  "visible": false,
  "skipTaskbar": true,
  "transparent": true,
  "center": true
}
```

### Key Window Properties
- **Undecorated**: Borderless, sleek rounded geometry with glassmorphic transparency.
- **Skip Taskbar**: Does not clutter the Windows taskbar or Alt+Tab switcher.
- **Always on Top**: Floats above all other windows during active dictation.
- **Hidden by Default**: Kept loaded in memory for zero-latency instant display when the global shortcut is triggered.

---

## 2. Multi-Window Frontend Routing

VoxaLocal uses URL query parameter dispatching in `src/App.tsx`:
```tsx
export const App: React.FC = () => {
  const isOverlay = window.location.search.includes('window=quick-dictation');
  return (
    <LanguageProvider>
      {isOverlay ? <QuickDictationOverlay /> : <MainApp />}
    </LanguageProvider>
  );
};
```
Both windows share the same optimized frontend bundle, state types, and Tauri IPC bridge.

---

## 3. Visual States

The overlay transitions through three distinct phases:

### Phase 1: Idle
- Hidden from view.
- Event listeners remain connected to the Tauri IPC bus ready to receive session events.

### Phase 2: Recording (Non-Activating)
- Displayed on the active monitor without stealing input focus (`SW_SHOWNOACTIVATE`).
- Live audio waveform and decibel level meter.
- Live word-by-word streaming transcript with Telegram-style animation differentiation.
- Duration timer and release prompt.

### Phase 3: Result & Editor (Interactive)
- Becomes interactive for editing, copying, or pasting.
- Textarea allows manual correction of recognized text before pasting.
- Action buttons: Paste, Copy, Open in Studio, Dismiss.
- Configurable countdown timer for auto-dismissal.
