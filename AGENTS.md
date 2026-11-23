# VoxaLocal — Agent Instructions & Operational Rules

This document establishes the mandatory architectural rules, engineering standards, and behavioral constraints for any AI coding agent operating within the **VoxaLocal** repository (`amirrezamortazavifard/VoxaLocal`).

Whenever a new agent session is started, you MUST read, adhere to, and strictly enforce every rule defined in this document without exception.

---

## 1. Mandatory GitHub Synchronization (Critical Law)
- **Source-Only Remote Sync**: Whenever you modify raw source code, add features, optimize styles, fix bugs, or create new assets, you **MUST** commit and push the changes to GitHub:
  - Remote: `origin/main` (`https://github.com/amirrezamortazavifard/VoxaLocal.git`).
  - Use informative, conventional commit messages (e.g. `feat: ...`, `fix: ...`, `chore: ...`, `style: ...`, `docs: ...`).
- **Strict Compliance with Section 10**: GitHub synchronization applies **STRICTLY AND EXCLUSIVELY to raw source code and tracked assets**. Never push compiled binaries, local databases, models, secrets, or local-only agent files specified in the **Git Push Matrix (Section 10)**.
- **Verification**: Always run `git status` before finishing a task to verify that only intended files were staged, working tree is clean, and `origin/main` is up to date.

---

## 2. Bilingual Architecture (English & Persian) & High-Standard Code
- **Bilingual Software UI**: VoxaLocal is natively bilingual, supporting both **Persian (`fa`)** and **English (`en`)**:
  - All user-facing strings must be localized through `src/i18n/translations.ts` and `LanguageContext.tsx`.
  - Dynamic RTL (Right-to-Left) for Persian and LTR (Left-to-Right) for English must be respected across all pages, layouts, and modals.
  - Smart Persian typography normalizer (Half-Space / Zero-Width Non-Joiner `ZWNJ`, Arabic-to-Persian character unification) must be preserved in transcript views.
- **Code & Developer Communications**: All in-code comments, variable and function names, git commit messages, docstrings, technical documentation, and terminal logs must be written strictly in professional, high-grade English.

---

## 3. Data Storage & OS-Native AppData Architecture
- **Never write to installation directories**: On Windows, applications installed in `C:\Program Files` lack write permissions under standard user accounts.
- **App Data Directory Standard**:
  - **Windows**: `%LOCALAPPDATA%\com.voxlocal.studio\` (or `%LOCALAPPDATA%\VoxLocal\data\`)
  - **macOS**: `~/Library/Application Support/com.voxlocal.studio/`
  - **Linux**: `~/.local/share/com.voxlocal.studio/`
- **Application Files**:
  - **SQLite Database**: `voxlocal.db` (and SQLite WAL files `voxlocal.db-wal`, `voxlocal.db-shm`) stores transcript history and audio metadata.
  - **Models Directory**: Stored under `<app_data_dir>/models/`:
    - `en-fa.tzf` / `en-fa.tzf.gz` (Persian-English Zipformer2 recognizer model, ~28.7 MiB compressed, ~60M parameters).
    - `silero_vad.onnx` / `silero_vad.onnx.gz` (Silero Voice Activity Detection v5 ONNX model).
  - **Settings**: `settings.json` stores user preferences (beam width, language mode, thread allocation).

---

## 4. Vite File Watcher & Windows Cargo DLL Lock (EBUSY Prevention)
- On Windows, when Cargo compiles Rust dependencies into `src-tauri/target/debug/deps/*.dll`, the operating system applies mandatory file write locks.
- **Mandatory Configuration**: `vite.config.ts` must ALWAYS contain:
  ```ts
  server: {
    watch: {
      ignored: ['**/src-tauri/**', '**/vendor/**'],
    },
  },
  ```
  Never remove this ignore rule; doing so causes immediate `EBUSY: resource busy or locked` compiler crashes during `npm run tauri dev`.

---

## 5. Dual-Theme & RTL/LTR Layout Parity
- **Theme Palette**: VoxLocal employs a deep navy glassmorphic palette (`bg-navy-950`, `bg-navy-900/60`, border `border-slate-800/80`, accents in cyan `text-cyan-400`, `bg-cyan-500/15` and emerald/rose indicators).
- **High Contrast & Readability**:
  - Form controls, dropdowns, and buttons must maintain clear text contrast.
  - Native dropdown menus (`<select>`) must specify explicit background and text colors to prevent illegible styling on host OS defaults.
  - Vazirmatn font is loaded for Persian typography; Inter/system font for Latin text.

---

## 6. Tauri Webview External Links
- Standard anchor tags `<a href="..." target="_blank">` do not open in the user's default OS browser inside Tauri webviews.
- Always use `@tauri-apps/plugin-opener` (`openUrl(...)`) or custom IPC opener command for all external links, GitHub repositories, model download guides, and documentation.

---

## 7. Version Synchronization & Semantic Versioning (SemVer)
When updating or releasing the software, adhere strictly to Semantic Versioning (`MAJOR.MINOR.PATCH`):
- **Patch Update (`X.Y.Z+1`)**: Bug fixes, performance optimizations, audio buffering enhancements, minor cosmetic tweaks (e.g. `0.1.0` → `0.1.1`).
- **Minor Update (`X.Y+1.0`)**: New feature tabs, additional audio format decoders, speaker diarization, model architecture updates (e.g. `0.1.1` → `0.2.0`).
- **Major Update (`X+1.0.0`)**: Fundamental engine redesigns, breaking database schema migrations, or new framework migrations (e.g. `0.2.0` → `1.0.0`).

### Mandatory 6-Point Version Synchronization
Whenever the version is updated, update all 6 configuration and source files simultaneously:
1. `package.json` (`"version": "X.Y.Z"`)
2. `src-tauri/Cargo.toml` (`version = "X.Y.Z"`)
3. `src-tauri/tauri.conf.json` (`"version": "X.Y.Z"`)
4. `src/i18n/translations.ts` (`versionBadge: "vX.Y.Z Offline"`)
5. `src/components/Header.tsx` (`vX.Y.Z Offline`)
6. `README.md` (`vX.Y.Z`)

---

## 8. Multi-Platform Automated Releases (CI/CD & Cloud Build)
- Multi-platform desktop builds (Windows, macOS, and Linux) are automated via GitHub Actions in `.github/workflows/release.yml`.
- **Target Distribution Packages**:
  - **Windows**: `.exe` (NSIS setup) & `.msi` (WiX installer)
  - **macOS (Apple Silicon & Intel)**: `.dmg` disk image (x86_64 and arm64 universal)
  - **Linux**: `.AppImage` (portable standalone) & `.deb` (Debian/Ubuntu)
- **Standard Release Trigger Workflow**:
  ```powershell
  git add .; git commit -m "chore(release): bump version to vX.Y.Z"; git push origin main
  git tag -a vX.Y.Z -m "Release vX.Y.Z: [Summary of changes]"; git push origin vX.Y.Z
  ```

---

## 9. Branding, Icons & Native Assets
- The official brand icon is located at:
  - `src-tauri/icons/` (32x32.png, 128x128.png, icon.ico, icon.icns, Square*.png)
  - `public/icon.png` (Webview favicon & preview assets)
- **Windows Icon Cache**: If icon assets are modified, execute `cargo clean` inside `src-tauri` so the Windows RC compiler re-embeds the new icon into `voxlocal.exe`.

---

## 10. Git Push Policy: Strict Whitelist vs. Blacklist Matrix
To maintain repository hygiene, user privacy, and open-source standards, strictly enforce the following matrix:

### A. The Whitelist (Files ALLOWED & REQUIRED to be Pushed)
| Category | Allowed Paths / Patterns | Purpose |
| :--- | :--- | :--- |
| **Frontend Source** | `src/**/*.{ts,tsx,css,json}` | Application UI components, state hooks, i18n |
| **Backend Source** | `src-tauri/src/**/*.{rs}`, `src-tauri/tests/**/*.{rs}` | Rust core engine, IPC commands, unit & integration tests |
| **TinyASR Engine** | `vendor/tinyasr/**/*.{rs,toml,h,md,c}` | Pinned native TinyASR recognition engine source |
| **Web Entry & Config** | `index.html`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `tsconfig*.json` | Build & bundler configurations |
| **Rust Manifests** | `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json` | Tauri & Rust build configurations |
| **Dependencies Manifest** | `package.json`, `package-lock.json` | Node.js dependency lockfiles |
| **Branding & Assets** | `public/icon.png`, `src-tauri/icons/*` | Official app icons and media banners |
| **Public Docs** | `README.md`, `LICENSE`, `ARCHITECTURE.md`, `TINYASR_INTEGRATION.md`, `MODEL_INSTALLATION.md`, `OFFLINE_ARCHITECTURE.md` | Open-source documentation and architecture guides |
| **CI/CD Automation** | `.github/workflows/*.yml` | Automated cloud release and CI workflows |

---

### B. The Blacklist (Files STRICTLY FORBIDDEN from Being Pushed)
1. **Compiled Binaries & Installers**:
   - `*.exe`, `*.msi`, `*.dll`, `*.dmg`, `*.AppImage`, `*.deb`, `*.dylib`, `*.so`
   - `src-tauri/target/`, `vendor/tinyasr/target/`, `target/` (Cargo build trees)
   - `dist/`, `dist-ssr/`, `build/` (Vite web distribution bundles)
2. **Personal Databases & Runtime History**:
   - `*.db`, `*.db-wal`, `*.db-shm` (SQLite transcript databases)
   - User audio files, recordings, or exported transcript caches.
3. **Large Model Binary Blobs**:
   - `*.tzf`, `*.onnx` outside sample documentation (user models must be loaded locally).
4. **Environment & Secrets**:
   - `.env`, `.env.local`, `.env.*`
5. **Operating System & IDE Artifacts**:
   - `.DS_Store`, `Thumbs.db`, `desktop.ini`, `.idea/`, `.vscode/*` (except `.vscode/extensions.json`)

---

### C. Git Staging Safeguard Commands
- **Never blind-commit binaries**: Never run `git add .` if untracked binary files (`.exe`, `.msi`, `.db`) exist.
- Always run `git status --short` to inspect the exact staged file list before committing.

---

## 11. PowerShell Shell Rules (Windows Host)
- Operating system shell is **PowerShell**.
- PowerShell does **NOT** support `&&` for command chaining.
- Always use `;` (semicolon) to separate sequential commands:
  ```powershell
  git add .; git commit -m "..."; git push origin main
  ```

---

## 12. Pre-Completion Validation
- Always run `npm run build` to verify TypeScript type checking and bundle creation.
- Always run `cargo test --manifest-path src-tauri/Cargo.toml` to verify Rust unit and integration tests.
- Ensure the application builds cleanly with zero regressions.
