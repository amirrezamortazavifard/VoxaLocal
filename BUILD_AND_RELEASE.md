# VoxLocal — Build and Release Guide

This document describes how to compile, package, and distribute **VoxLocal** for Windows x64, with portability notes for macOS and Linux.

---

## 1. Prerequisites

- **Operating System**: Windows 10/11 x64 (Primary development target)
- **Rust Toolchain**: 1.80+ (stable-x86_64-pc-windows-msvc)
- **Node.js**: v20+ or v24+ with npm
- **C++ Build Tools**: Microsoft Visual C++ Build Tools (MSVC)
- **WiX Toolset**: (Optional, for MSI generation; installed by Tauri CLI)
- **NSIS**: (Optional, for EXE installer generation; installed by Tauri CLI)

---

## 2. Development Mode

Run the application with hot reloading:
```bash
# 1. Install frontend dependencies
npm install

# 2. Run Tauri development environment
npm run tauri dev
```

---

## 3. Production Release Build

To build the optimized standalone binary and Windows installers:
```bash
npm run tauri build
```

### Build Artifacts Produced

The release process outputs the following artifacts:

1. **Standalone Portable Binary**:
   - Location: `src-tauri/target/release/voxlocal.exe`
2. **NSIS Installer**:
   - Location: `src-tauri/target/release/bundle/nsis/VoxLocal_0.1.0_x64-setup.exe` (~4.1 MiB)
3. **MSI Package**:
   - Location: `src-tauri/target/release/bundle/msi/VoxLocal_0.1.0_x64_en-US.msi` (~5.8 MiB)

---

## 4. Cross-Platform Portability Notes

The backend architecture is portable across platforms:
- **Audio Capture**: CPAL supports Windows (WASAPI), macOS (CoreAudio), and Linux (ALSA / PulseAudio / PipeWire).
- **Audio Resampling**: Rubato is 100% pure Rust and platform-independent.
- **Audio Decoding**: Symphonia is pure Rust with zero external C dependencies.
- **Inference Engine**: TinyASR compiles natively on x86_64 and ARM64 (Apple Silicon NEON).
- **Database**: SQLite via `rusqlite` bundled mode compiles on all major operating systems.
