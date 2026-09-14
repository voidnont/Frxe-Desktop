# Frxe Desktop

**Frxe Desktop** is the desktop build of Frxe for Windows, Linux and macOS, using one shared Tauri/Rust backend and the Frxe liquid-glass interface.

## Experience

- YouTube Music-first search with YouTube and yt-dlp fallback
- Liquid-glass surfaces and artwork-reactive ambient background
- Fast queue skipping with adjacent-track stream prefetch
- Glass mini-player with always-accessible volume control
- Lyrics, queue, favorites, offline downloads and responsive desktop layouts
- Ko-fi and GitHub support links in the app

## Native backend

The native Rust/Tauri backend is checked into this repository under `src-tauri/`. Builds no longer download or depend on a separate backend repository.

It provides:

- YouTube Music / YouTube InnerTube search
- yt-dlp fallback search and stream URL resolution
- downloads and audio conversion
- local download scanning
- LRCLIB metadata lyrics
- runtime dependency updates
- tray/native integration

## Build requirements

All platforms require Node.js 20+, npm, Rust/Cargo, and the normal Tauri prerequisites for the target OS.

### Windows

```bat
build.bat
```

Output:

```text
release-upload\Frxe-Desktop-0.1.0-x64.msi
```

### Linux

Install the normal Tauri Linux/WebKitGTK development dependencies, then run:

```bash
bash build-linux.sh
```

Outputs:

```text
release-upload/Frxe-Desktop-0.1.0-amd64.deb
release-upload/Frxe-Desktop-0.1.0-x86_64.AppImage
```

### macOS

```bash
bash build-macos.sh
```

Output depends on the Mac architecture:

```text
release-upload/Frxe-Desktop-0.1.0-macos-arm64.dmg
release-upload/Frxe-Desktop-0.1.0-macos-x64.dmg
```

The CI-built macOS packages are unsigned and unnotarized unless Apple Developer signing credentials are configured separately, so Gatekeeper may show the normal unidentified-developer warning.

## Runtime tools

Frxe can update its own yt-dlp runtime from Settings. FFmpeg is intentionally not downloaded from an unpinned third-party binary provider; install FFmpeg on the operating system when using MP3, FLAC, WAV or M4A conversion/remux. Deno is detected when available and shown in runtime status.

## Development

```bash
npm install
npm run check
npm run tauri:dev
```

Platform package commands:

```text
npm run tauri:build:windows
npm run tauri:build:linux
npm run tauri:build:macos
```

## Product identity

- Product: **Frxe Desktop**
- Publisher: **void**
- App identifier: `app.frxe.desktop`
- Version: `0.1.0`

GitHub Actions builds the Windows MSI, Linux DEB/AppImage, and separate Apple Silicon/Intel macOS DMGs from the same checked-in source.
