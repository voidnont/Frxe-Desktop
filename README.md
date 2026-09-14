# Frxe Desktop

Frxe Desktop is the Windows, Linux and macOS desktop edition of Frxe, built from one shared Tauri/Rust backend and one shared desktop interface.

Current release: **1.2.2**

## Features

- YouTube Music-first search with YouTube and yt-dlp fallback
- native desktop audio playback and queue controls
- fast next/previous with adjacent-track source prefetch
- always-accessible mini-player volume control
- favorites, history, downloads and offline playback
- lyrics and queue views
- runtime dependency updates for yt-dlp
- signed in-app Frxe Desktop update checks and installation
- system tray integration
- Ko-fi and GitHub links in Home and About

## Repository layout

Shared application code stays in `web/` and `src-tauri/`. Platform-specific build entry points live in `platforms/windows/`, `platforms/linux/`, and `platforms/macos/`.

See `docs/REPOSITORY_STRUCTURE.md` for the maintained layout and packaging rules.

## Build requirements

All platforms require Node.js 20+, npm, Rust/Cargo and the normal Tauri prerequisites for the target operating system.

### Windows

```bat
platforms\windows\build.bat
```

Output:

```text
release-upload\Frxe-Desktop-1.2.2-x64.msi
```

### Linux

Install the normal Tauri Linux/WebKitGTK development dependencies, then run:

```bash
bash platforms/linux/build.sh
```

Outputs:

```text
release-upload/Frxe-Desktop-1.2.2-amd64.deb
release-upload/Frxe-Desktop-1.2.2-x86_64.AppImage
```

### macOS

```bash
bash platforms/macos/build.sh
```

Output depends on the Mac architecture:

```text
release-upload/Frxe-Desktop-1.2.2-macos-arm64.dmg
release-upload/Frxe-Desktop-1.2.2-macos-x64.dmg
```

Apple Developer signing and notarization can be configured separately. Without those credentials, macOS may show the normal unidentified-developer warning.

## In-app updates

Frxe Desktop uses signed Tauri updater artifacts published with GitHub Releases. The app checks the canonical release feed at the Frxe Desktop repository and verifies the update signature before installation.

Release builds require these GitHub Actions secrets:

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

The private updater key and password must never be committed. Only the matching public verification key belongs in `src-tauri/tauri.conf.json`.

## Development

```bash
npm install
npm run check
npm run tauri:dev
```

Shared package commands:

```text
npm run tauri:build:windows
npm run tauri:build:linux
npm run tauri:build:macos
```

## Product identity

- Product: **Frxe Desktop**
- Publisher: **void**
- App identifier: `app.frxe.desktop`
- Version: **1.2.2**
- Repository: `https://github.com/voidnont/Frxe-Desktop`
