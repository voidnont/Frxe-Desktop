# Frxe Desktop

**Frxe Desktop** is the Windows build of Frxe: the Frxe Android visual and interaction language adapted for desktop with a native Rust/Tauri backend.

## Experience

- Liquid-glass surfaces and artwork-reactive ambient background
- Spring-style press and navigation motion
- Bottom floating navigation with the selected destination expanding to icon + label
- Home, Search, Save, Library and Settings flow
- Glass mini-player and full Now Playing experience
- Lyrics, queue, favorites, offline downloads and responsive desktop layouts

## Native backend

The Windows build prepares a pinned native backend snapshot at build time and applies Frxe Desktop identity and branding before compilation.

It provides native service logic for:

- YouTube / YouTube Music InnerTube search
- yt-dlp fallback search
- stream URL resolution
- downloads and conversion
- local download scanning
- metadata lyrics
- runtime dependency updates
- Tauri tray/native integration

The generated `src-tauri/` folder is intentionally gitignored so the prepared backend remains reproducible and does not drift between builds.

## Windows build

Requirements:

- Windows 10 or 11
- Git
- Node.js 20+
- npm
- Rust/Cargo with the MSVC toolchain
- WebView2 / normal Tauri Windows prerequisites

Clone:

```bat
git clone https://github.com/voidnont/Frxe-Windows.git
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

The frontend core and native command adapter use Node's built-in test runner:

```bat
npm test
npm run check
```

The tests also guard against reintroducing retired product branding into tracked text files.

## Product identity

- Product: **Frxe Desktop**
- Publisher: **void**
- App identifier: `app.frxe.desktop`
- Installer: MSI
- Backend: pinned native Rust/Tauri snapshot

## Repository layout

```text
Frxe-Windows/
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

Frxe Desktop is a standalone Windows application identity.
