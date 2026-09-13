# Frxe Desktop

**Frxe Desktop** is the Windows build of Frxe: the Frxe Android visual/interaction language on desktop, powered by the **NontMusic** Rust/Tauri backend.

## What it keeps from Frxe

- Liquid-glass surfaces and artwork-reactive ambient background
- Spring-style press and navigation motion
- Bottom floating navigation with the selected destination expanding to icon + label
- Home, Search, Save, Library and Settings flow
- Glass mini-player and full Now Playing experience
- Lyrics, queue, favorites, offline downloads and responsive desktop layouts

## Backend

This repository pins `voidnont/NontMusic` as a Git submodule at a known commit. `tools/prepare-backend.ps1` copies that pinned `src-tauri` backend into a generated local build folder and changes only the desktop product identity/configuration needed for **Frxe Desktop**.

The NontMusic backend provides the native service logic for:

- YouTube / YouTube Music InnerTube search
- yt-dlp fallback search
- stream URL resolution
- downloads and conversion
- local download scanning
- metadata lyrics
- runtime dependency updates
- Tauri tray/native integration

The generated `src-tauri/` folder is intentionally gitignored so backend changes continue to come from the pinned NontMusic source instead of silently drifting.

## Windows build

Requirements:

- Windows 10 or 11
- Git
- Node.js 20+
- npm
- Rust/Cargo with the MSVC toolchain
- WebView2 / normal Tauri Windows prerequisites

Clone with submodules:

```bat
git clone --recurse-submodules https://github.com/voidnont/Frxe-Windows.git
cd Frxe-Windows
```

Build the MSI:

```bat
build.bat
```

Output:

```text
release-upload\Frxe-Desktop-0.1.0-x64.msi
```

For development:

```bat
dev.bat
```

Every push to `main` also runs the **Windows MSI** GitHub Actions workflow and uploads the MSI as a workflow artifact.

## Tests

The frontend core and NontMusic command adapter use Node's built-in test runner:

```bat
npm test
npm run check
```

## Product identity

- Product: **Frxe Desktop**
- Publisher: **void**
- App identifier: `app.frxe.desktop`
- Installer: MSI
- Backend: pinned NontMusic

## Repository layout

```text
Frxe-Windows/
├── backend/NontMusic/       # git submodule, exact backend source
├── web/                     # Frxe Desktop UI/UX
│   ├── index.html
│   ├── app.mjs
│   ├── backend.mjs
│   ├── core.mjs
│   ├── ui.mjs
│   ├── ui-primitives.mjs
│   └── styles-*.css
├── assets/                  # Frxe launcher artwork source
├── tests/                   # frontend/backend-adapter tests
├── tools/prepare-backend.ps1
├── build.bat
├── dev.bat
└── package.json
```

Frxe Desktop is intentionally a separate Windows application identity and does not overwrite an installed NontMusic app.
