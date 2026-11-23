# VoxaLocal — Global Quick Dictation Guide

## Overview

**Global Quick Dictation** is a lightweight, system-wide speech recognition capability in VoxaLocal. It allows users to dictate text seamlessly into any desktop application (browsers, text editors, IDEs, chat messengers, Microsoft Office) using an operating-system-level shortcut without bringing up the primary VoxaLocal Studio window.

Like Telegram's live speech transcription and Handy's desktop dictation workflow, Quick Dictation provides zero-latency feedback, on-device Persian/English recognition, and instant paste-back into the active target application.

---

## 1. Operating Modes

Quick Dictation supports two user-selectable activation modes in Settings:

### A. Push-to-Talk (Default)
- **Press & Hold**: Hold down the global shortcut (`Ctrl + Shift + Space` by default). The active foreground window is captured, and audio capture starts immediately.
- **Visual Feedback**: The floating overlay appears on screen without stealing keyboard focus (`SW_SHOWNOACTIVATE` on Windows), displaying live audio levels and word-by-word streaming recognition.
- **Release**: Releasing the shortcut flushes remaining audio, finalizes the active TinyASR session, and transforms the overlay into an editable result panel.

### B. Toggle Recording
- **Press Once**: Begins recording speech.
- **Press Again**: Stops recording, finalizes recognition, and opens the result panel.

---

## 2. Interaction Lifecycle & State Machine

The dictation pipeline is governed by a native Rust state machine (`PttStateMachine`):

```
       ┌───────────┐
       │   Idle    │◄─────────────────────────────┐
       └─────┬─────┘                              │
             │ Press                              │
             ▼                                    │
       ┌───────────┐                              │
       │ Starting  │                              │
       └─────┬─────┘                              │
             │ Worker ready                       │
             ▼                                    │
       ┌───────────┐                              │
       │ Recording │                              │
       └─────┬─────┘                              │
             │ Release (PTT) / Press (Toggle)     │ Dismiss
             ▼                                    │
       ┌───────────┐                              │
       │Finalizing │                              │
       └─────┬─────┘                              │
             │ session.finish()                   │
             ▼                                    │
       ┌───────────┐                              │
       │  Result   ├──────────────────────────────┘
       └─────┬─────┘
             │ Paste Action
             ▼
       ┌──────────────────────┐
       │ Focus Restore & Paste│
       └──────────────────────┘
```

### Key Protections
- **Key Repeat Suppression**: Holding down a key combination triggers OS-level key-repeat events. The state machine filters out repeat events when already in `Starting` or `Recording` states.
- **Startup Race Resilience**: If the user releases the key before the asynchronous audio worker finishes initializing, `stop_pending` is set. As soon as the session starts, it immediately transitions to `Finalizing`, guaranteeing that no runaway recording sessions occur.
- **Session Conflict Management**: If an active recording session is already running in Studio, Quick Dictation safely rejects the start request with `RECORDING_ALREADY_ACTIVE` rather than silently destroying the user's studio recording.

---

## 3. Focus Preservation & Paste Mechanism

### Window Focus Preservation
When the overlay appears during Push-to-Talk, it must not steal keyboard focus from the active document:
- On Windows, the window is displayed via the Win32 API `ShowWindow(hwnd, SW_SHOWNOACTIVATE)` and `SetWindowPos(hwnd, HWND_TOPMOST, ..., SWP_NOACTIVATE | SWP_SHOWWINDOW)`.
- The target application remains the active foreground window throughout recording.

### Target Restoration & Synthetic Paste
When the user clicks "Paste" (or if `autoPaste` is enabled in Settings):
1. **Clipboard Preparation**: The final Persian/English transcript is placed onto the system clipboard.
2. **Foreground Window Restoration**: `SetForegroundWindow(saved_hwnd)` restores focus back to the target application.
3. **Focus Delay**: A 60ms delay allows the Windows window manager to complete the focus transition.
4. **Synthetic Paste**: Synthetic `Ctrl + V` keystrokes are emitted using Windows `SendInput`:
   - `VK_CONTROL` Down
   - `0x56` ('V') Down
   - `0x56` ('V') Up
   - `VK_CONTROL` Up
5. **Overlay Dismissal**: The overlay window is automatically hidden.

---

## 4. Local Persistence & Privacy

- All recognition runs locally via the offline TinyASR Zipformer2 model.
- Quick Dictation sessions are automatically recorded in the local SQLite database (`voxlocal.db`) under the title `Quick Dictation - [Timestamp]`.
- No transcripts, audio data, or metadata ever leave your computer.
