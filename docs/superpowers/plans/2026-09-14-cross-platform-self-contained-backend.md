# Frxe Desktop Cross-Platform Self-Contained Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Frxe Desktop self-contained and build working Windows MSI, Linux DEB/AppImage, and macOS Apple Silicon/Intel DMG installers from the same repository and Tauri/Rust backend.

**Architecture:** Check a platform-neutral Tauri 2 backend into `src-tauri/` and preserve the existing JavaScript command contract in `web/backend.mjs`. Native modules are split by responsibility: runtime helper discovery/update, YouTube Music/YouTube search and stream resolution, downloads/offline files, lyrics, and tray/app lifecycle. Packaging scripts and GitHub Actions invoke the same source on Windows, Ubuntu, and macOS instead of downloading the deleted backend snapshot.

**Tech Stack:** Tauri 2, Rust stable, Tokio, Reqwest/Rustls, Serde, yt-dlp subprocess integration, LRCLIB HTTP API, Node.js 22 test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-14-linux-self-contained-backend-design.md`

## Global Constraints

- Product version remains exactly `0.1.0`.
- Product name remains `Frxe Desktop`, publisher `void`, identifier `app.frxe.desktop`.
- YouTube Music is the first search source; regular YouTube and yt-dlp are fallbacks.
- Preserve the existing frontend resolver cache and adjacent-track prefetch for fast Next/Previous.
- Preserve the current mini-player volume control, Ko-fi/GitHub support pills, and readable dark select menus.
- No credentials, signing keys, Apple certificates, private tokens, build output, or downloaded runtime binaries are committed.
- Windows output: `Frxe-Desktop-0.1.0-x64.msi`.
- Linux outputs: `Frxe-Desktop-0.1.0-amd64.deb` and `Frxe-Desktop-0.1.0-x86_64.AppImage`.
- macOS outputs: `Frxe-Desktop-0.1.0-macos-arm64.dmg` and `Frxe-Desktop-0.1.0-macos-x64.dmg`.
- macOS CI packages are unsigned and unnotarized unless Apple credentials are added separately later.
- ARM Linux, Flatpak, Snap, and a universal macOS binary are out of scope.

## File Structure

- `src-tauri/Cargo.toml` — Rust/Tauri dependencies and package identity.
- `src-tauri/build.rs` — Tauri build hook.
- `src-tauri/tauri.conf.json` — window, bundle, icon, asset protocol, and product configuration.
- `src-tauri/capabilities/default.json` — Tauri capability permissions for the main window and opener plugin.
- `src-tauri/src/main.rs` — native executable entry point.
- `src-tauri/src/lib.rs` — Tauri builder, plugin setup, native state, and command registration.
- `src-tauri/src/models.rs` — serializable track, lyrics, runtime, and progress DTOs shared by native modules.
- `src-tauri/src/runtime.rs` — yt-dlp/FFmpeg discovery and explicit runtime update command.
- `src-tauri/src/search.rs` — YouTube Music/YouTube InnerTube search, yt-dlp search, and stream URL resolution.
- `src-tauri/src/downloads.rs` — download process, progress events, cancellation, local scan, existence check, and deletion.
- `src-tauri/src/lyrics.rs` — metadata-based LRCLIB lookup.
- `src-tauri/src/tray.rs` — tray enable/disable and app lifecycle behavior.
- `src-tauri/tests/fixtures/*.json` — deterministic parser fixtures, never live-network tests.
- `tests/build-contract.test.mjs` — guards the self-contained build scripts/workflows and prevents reintroduction of remote backend bootstrap.
- `tests/branding.test.mjs` — expands branding checks into checked-in Rust/Tauri source and replaces the old `prepare-backend.ps1` icon assertion.
- `package.json` — platform-neutral Tauri scripts.
- `build.bat` — Windows local MSI build.
- `build-linux.sh` — Linux local DEB/AppImage build.
- `build-macos.sh` — macOS local DMG build.
- `.github/workflows/windows-msi.yml` — Windows package CI.
- `.github/workflows/linux-packages.yml` — Linux package CI.
- `.github/workflows/macos-dmg.yml` — Apple Silicon + Intel package CI.
- `README.md` — cross-platform build/install documentation.
- `.gitignore` — track native source while ignoring native build/icon/runtime output.

---

### Task 1: Check in a minimal cross-platform Tauri shell

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Modify: `.gitignore`
- Modify: `tests/branding.test.mjs`

**Interfaces:**
- Consumes: existing static frontend at `../web`.
- Produces: `frxe_desktop_lib::run()` and a Tauri app that compiles without downloading any other repository.

- [ ] **Step 1: Update the branding/build guard so checked-in native source is required**

Change `tests/branding.test.mjs` so `src-tauri` is no longer skipped, add `.rs` and `.toml` to `textExtensions`, and replace the old PowerShell assertion with checks for Tauri config and the canonical SVG icon command:

```js
const skipped = new Set(['.git', 'node_modules', 'release-upload', 'target', 'icons']);
const textExtensions = new Set(['.bat', '.css', '.html', '.json', '.md', '.mjs', '.rs', '.sh', '.svg', '.toml', '.txt', '.yml', '.yaml']);

const [index, styles, config, pkg, icon] = await Promise.all([
  readFile(join(root, 'web', 'index.html'), 'utf8'),
  readFile(join(root, 'web', 'styles-1.css'), 'utf8'),
  readFile(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'),
  readFile(join(root, 'package.json'), 'utf8'),
  readFile(join(root, 'web', 'frxe-icon.svg'), 'utf8'),
]);
assert.match(config, /"productName"\s*:\s*"Frxe Desktop"/);
assert.match(pkg, /tauri icon web\/frxe-icon\.svg/);
```

- [ ] **Step 2: Run the JS test and verify RED**

Run:

```bash
npm test
```

Expected: branding test fails because `src-tauri/tauri.conf.json` does not exist and `package.json` does not yet contain the icon command.

- [ ] **Step 3: Replace the broad `src-tauri/` ignore with generated-only ignores**

Use this `.gitignore`:

```gitignore
node_modules/
release-upload/
src-tauri/target/
src-tauri/icons/
.frxe-runtime/
*.log
.DS_Store
```

- [ ] **Step 4: Add the native Cargo manifest and Tauri build hook**

Create `src-tauri/Cargo.toml`:

```toml
[package]
name = "frxe-desktop"
version = "0.1.0"
edition = "2021"
description = "Frxe Desktop"
authors = ["void"]

[lib]
name = "frxe_desktop_lib"
crate-type = ["lib", "cdylib", "staticlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
tokio = { version = "1", features = ["process", "io-util", "sync", "rt-multi-thread", "macros"] }
regex = "1"
dirs = "6"
sysinfo = "0.37"
urlencoding = "2"
walkdir = "2"

[dev-dependencies]
tempfile = "3"
```

Create `src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build();
}
```

- [ ] **Step 5: Add Tauri configuration and capability**

Create `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Frxe Desktop",
  "version": "0.1.0",
  "identifier": "app.frxe.desktop",
  "build": { "frontendDist": "../web" },
  "app": {
    "withGlobalTauri": true,
    "windows": [{
      "label": "main",
      "title": "Frxe Desktop",
      "width": 1280,
      "height": 820,
      "minWidth": 900,
      "minHeight": 620,
      "resizable": true,
      "fullscreen": false,
      "decorations": false,
      "devtools": false,
      "center": true,
      "shadow": true,
      "backgroundColor": "#07070a"
    }],
    "security": {
      "csp": null,
      "assetProtocol": { "enable": true, "scope": ["$HOME/**", "$AUDIO/**", "$DOWNLOAD/**"] }
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "publisher": "void",
    "shortDescription": "Frxe Desktop music player",
    "longDescription": "Frxe Desktop by void - a liquid-glass desktop music experience.",
    "homepage": "https://github.com/voidnont/Frxe-Windows",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.ico", "icons/icon.icns"]
  }
}
```

Create `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Frxe Desktop main window permissions",
  "windows": ["main"],
  "permissions": ["core:default", "opener:default"]
}
```

- [ ] **Step 6: Add the minimal entry point and builder**

Create `src-tauri/src/main.rs`:

```rust
fn main() {
    frxe_desktop_lib::run();
}
```

Create `src-tauri/src/lib.rs`:

```rust
#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![exit_app])
        .run(tauri::generate_context!())
        .expect("Frxe Desktop failed to start");
}
```

- [ ] **Step 7: Verify the native shell compiles**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: exit code 0.

- [ ] **Step 8: Commit**

```bash
git add .gitignore tests/branding.test.mjs src-tauri
git commit -m "feat: add self-contained Tauri desktop shell"
```

---

### Task 2: Add runtime helper discovery and explicit yt-dlp updater

**Files:**
- Create: `src-tauri/src/models.rs`
- Create: `src-tauri/src/runtime.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `RuntimeStatus { ytdlp_path, ffmpeg_path, warnings }` serialized with snake_case field names.
- Produces: `runtime::resolve_ytdlp(&Path) -> Result<PathBuf, String>` and `runtime::resolve_ffmpeg(&Path) -> Option<PathBuf>`.
- Produces Tauri command: `update_runtime_dependencies(app: AppHandle) -> Result<RuntimeStatus, String>`.

- [ ] **Step 1: Write unit tests for platform binary naming and URL selection**

In `runtime.rs`, add tests around pure helpers:

```rust
#[test]
fn ytdlp_asset_name_matches_platform() {
    let expected = if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else if cfg!(target_os = "macos") {
        "yt-dlp_macos"
    } else {
        "yt-dlp"
    };
    assert_eq!(ytdlp_asset_name(), expected);
}

#[test]
fn ytdlp_download_url_uses_official_release_asset() {
    assert_eq!(
        ytdlp_download_url(),
        format!("https://github.com/yt-dlp/yt-dlp/releases/latest/download/{}", ytdlp_asset_name())
    );
}
```

- [ ] **Step 2: Run the Rust test and verify RED**

```bash
cargo test --manifest-path src-tauri/Cargo.toml runtime::tests -- --nocapture
```

Expected: compile failure because `runtime` helpers do not exist.

- [ ] **Step 3: Add shared DTOs**

Create `models.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub cover: Option<String>,
    pub duration_seconds: Option<f64>,
    pub source: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResult {
    pub synced_lyrics: Option<String>,
    pub plain_lyrics: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeStatus {
    pub ytdlp_path: Option<String>,
    pub ffmpeg_path: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub task_id: String,
    pub percent: f64,
    pub speed: String,
    pub eta: String,
    pub item_title: String,
}
```

- [ ] **Step 4: Implement runtime path lookup and updater**

`runtime.rs` must:

```rust
pub fn ytdlp_asset_name() -> &'static str { /* cfg branches returning the exact names tested above */ }
pub fn ytdlp_download_url() -> String { format!("https://github.com/yt-dlp/yt-dlp/releases/latest/download/{}", ytdlp_asset_name()) }
pub fn runtime_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> { /* app.path().app_data_dir()/runtime */ }
pub fn resolve_ytdlp(runtime_dir: &std::path::Path) -> Result<std::path::PathBuf, String> { /* local runtime first, then PATH */ }
pub fn resolve_ffmpeg(runtime_dir: &std::path::Path) -> Option<std::path::PathBuf> { /* local runtime first, then PATH */ }
```

The updater downloads only yt-dlp from its official release URL into the app runtime directory, marks it executable on Unix, and reports an FFmpeg warning when no FFmpeg is discoverable. Do not silently download third-party FFmpeg binaries.

- [ ] **Step 5: Register the runtime command**

Add `mod models; mod runtime;` and `runtime::update_runtime_dependencies` to `tauri::generate_handler!` in `lib.rs`.

- [ ] **Step 6: Run focused and full Rust tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/models.rs src-tauri/src/runtime.rs src-tauri/src/lib.rs
git commit -m "feat: add cross-platform runtime dependency manager"
```

---

### Task 3: Implement YouTube Music-first search and stream resolution

**Files:**
- Create: `src-tauri/src/search.rs`
- Create: `src-tauri/tests/fixtures/music-search.json`
- Create: `src-tauri/tests/fixtures/web-search.json`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces Tauri commands matching the existing adapter exactly: `innertube_search(query: String, client: String)`, `ytdlp_search(query: String)`, `resolve_stream_url(video_id: String)`.
- Uses `runtime::resolve_ytdlp` for CLI fallback and playback resolution.
- Returns `Vec<Track>` for search and `String` for resolved stream URL.

- [ ] **Step 1: Add parser fixtures and failing parser tests**

Use minimal deterministic JSON fixtures containing one `musicResponsiveListItemRenderer` and one `videoRenderer`. Test the exact frontend shape:

```rust
#[test]
fn parses_music_renderer_into_frxe_track() {
    let json: serde_json::Value = serde_json::from_str(include_str!("../tests/fixtures/music-search.json")).unwrap();
    let tracks = parse_music_results(&json);
    assert_eq!(tracks[0].id, "abcdefghijk");
    assert_eq!(tracks[0].kind, "youtube");
    assert_eq!(tracks[0].source.as_deref(), Some("YouTube Music"));
}
```

- [ ] **Step 2: Run the parser tests and verify RED**

```bash
cargo test --manifest-path src-tauri/Cargo.toml search::tests -- --nocapture
```

Expected: FAIL because `parse_music_results` and `parse_web_results` do not exist.

- [ ] **Step 3: Implement InnerTube bootstrap and response parsing**

`search.rs` must fetch public YouTube/YouTube Music page configuration, extract `INNERTUBE_API_KEY` and `INNERTUBE_CLIENT_VERSION`, then POST to the matching `/youtubei/v1/search` endpoint. Use `WEB_REMIX` for `client == "music"` and `WEB` for `client == "web"`.

Use these signatures:

```rust
#[derive(Debug, Clone)]
struct InnerTubeConfig {
    api_key: String,
    client_name: String,
    client_version: String,
}

async fn fetch_innertube_config(client: &str) -> Result<InnerTubeConfig, String>;
fn parse_music_results(root: &serde_json::Value) -> Vec<Track>;
fn parse_web_results(root: &serde_json::Value) -> Vec<Track>;
```

Recursive parser helpers must ignore entries without a valid 11-character video id and never panic on missing renderer fields.

- [ ] **Step 4: Implement yt-dlp fallback search**

Use the discovered yt-dlp binary and this command shape:

```text
yt-dlp --no-warnings --flat-playlist --dump-single-json ytsearch20:<query>
```

Parse `entries[]` into `Track { kind: "youtube", source: Some("YouTube"), ... }`.

- [ ] **Step 5: Implement direct audio stream resolution**

Validate `video_id` against `^[A-Za-z0-9_-]{11}$`, then run:

```text
yt-dlp --no-warnings --no-playlist -f bestaudio/best -g https://www.youtube.com/watch?v=<video_id>
```

Return the first non-empty `http://` or `https://` output line. Error text must identify missing yt-dlp separately from an extractor failure.

- [ ] **Step 6: Register all three commands and run native tests**

Add the commands to `generate_handler!`, then run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS with no live network dependency in tests.

- [ ] **Step 7: Run the existing frontend adapter tests**

```bash
npm test
```

Expected: the existing test still confirms call order `music -> web -> ytdlp` and deduplication.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/search.rs src-tauri/tests/fixtures src-tauri/src/lib.rs
git commit -m "feat: add YouTube Music search and stream resolver"
```

---

### Task 4: Implement downloads, cancellation, and offline file operations

**Files:**
- Create: `src-tauri/src/downloads.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces `DownloadManager` managed by Tauri state.
- Produces commands: `scan_downloads`, `clear_removed_downloads`, `download_already_exists`, `download_track`, `cancel_download`, `remove_download`.
- Emits `download-progress` with `{ task_id, percent, speed, eta, item_title }`, matching `web/app.mjs` exactly.

- [ ] **Step 1: Add failing pure tests for progress parsing and path safety**

```rust
#[test]
fn parses_frxe_progress_line() {
    let p = parse_progress("FRXE:42.5%|1.2MiB/s|00:31|Example Song").unwrap();
    assert_eq!(p.percent, 42.5);
    assert_eq!(p.item_title, "Example Song");
}

#[test]
fn rejects_delete_outside_download_root() {
    let root = tempfile::tempdir().unwrap();
    let outside = root.path().parent().unwrap().join("outside.mp3");
    assert!(validated_child_path(root.path(), &outside).is_err());
}
```

- [ ] **Step 2: Run and verify RED**

```bash
cargo test --manifest-path src-tauri/Cargo.toml downloads::tests -- --nocapture
```

Expected: FAIL because helpers are not defined.

- [ ] **Step 3: Implement local scanning and safe deletion**

Scan only these extensions case-insensitively: `mp3`, `m4a`, `flac`, `wav`, `opus`, `ogg`, `webm`. Return local `Track` objects with `id` and `path` set to the absolute path, `kind: "local"`, title from the file stem, and artist `Offline` when metadata is unavailable.

`clear_removed_downloads` returns `0` because the checked-in backend has no stale download database; `scan_downloads` is authoritative on every refresh.

`remove_download` must canonicalize both the chosen download root and target and reject any target outside the root before deleting.

- [ ] **Step 4: Implement download existence and format arguments**

`download_already_exists(video_id, output_dir)` searches filenames for `[<video_id>]`.

Use output template:

```text
%(title).180B [%(id)s].%(ext)s
```

Map formats exactly:

```rust
match format.as_str() {
    "mp3" | "flac" | "wav" => { args.extend(["-x", "--audio-format", format.as_str()]); }
    "m4a" => { args.extend(["-f", "bestaudio[ext=m4a]/bestaudio", "--remux-video", "m4a"]); }
    _ => return Err("Unsupported audio format".into()),
}
```

Map quality `best -> 0`, `high -> 2`, `balanced -> 5` for extracted-audio formats. If conversion/remux requires FFmpeg and FFmpeg is not discoverable, return `FFmpeg is required for this format. Install FFmpeg, then use Update runtime dependencies again.`

- [ ] **Step 5: Implement async download progress and cancellation**

Launch yt-dlp with:

```text
--newline --progress --progress-template download:FRXE:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.title)s
```

Store `task_id -> process id` in `DownloadManager`. `cancel_download` finds the process with `sysinfo`, kills it, and removes the task mapping. Read stdout line-by-line and emit `download-progress` from the Tauri `AppHandle`.

- [ ] **Step 6: Register download state and commands**

`lib.rs` must call `.manage(downloads::DownloadManager::default())` and register all six commands.

- [ ] **Step 7: Run Rust + JS tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/downloads.rs src-tauri/src/lib.rs
git commit -m "feat: add cross-platform downloads and offline library"
```

---

### Task 5: Implement lyrics, tray behavior, and final native command wiring

**Files:**
- Create: `src-tauri/src/lyrics.rs`
- Create: `src-tauri/src/tray.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces `fetch_metadata_lyrics(title, artist, album, duration_seconds) -> LyricsResult`.
- Produces `set_tray_enabled(app, enabled) -> Result<(), String>`.
- Preserves `exit_app` used by `web/window-controls.mjs`.

- [ ] **Step 1: Add a failing deterministic LRCLIB deserialization test**

```rust
#[test]
fn maps_lrclib_payload() {
    let raw = r#"{"syncedLyrics":"[00:01.00]Hi","plainLyrics":"Hi"}"#;
    let result = parse_lrclib(raw).unwrap();
    assert_eq!(result.plain_lyrics.as_deref(), Some("Hi"));
}
```

- [ ] **Step 2: Run and verify RED**

```bash
cargo test --manifest-path src-tauri/Cargo.toml lyrics::tests -- --nocapture
```

- [ ] **Step 3: Implement metadata lyrics lookup**

Request `https://lrclib.net/api/get` with query parameters `track_name`, `artist_name`, optional `album_name`, and rounded `duration`. Send a `Frxe-Desktop/0.1.0` user agent. Treat HTTP 404 as an empty `LyricsResult`, not an application crash.

- [ ] **Step 4: Implement a cross-platform tray toggle**

Use one stable tray id, `frxe-tray`. When enabled and missing, build a tray icon with tooltip `Frxe Desktop`; clicking it shows and focuses the `main` window. When disabled, remove that tray id. Use `app.default_window_icon()` when available rather than adding a second branding asset.

- [ ] **Step 5: Make the final native command list explicit**

`tauri::generate_handler!` must contain exactly the frontend-required native surface plus `exit_app`:

```rust
search::innertube_search,
search::ytdlp_search,
search::resolve_stream_url,
downloads::scan_downloads,
downloads::clear_removed_downloads,
downloads::download_already_exists,
downloads::download_track,
downloads::cancel_download,
downloads::remove_download,
lyrics::fetch_metadata_lyrics,
runtime::update_runtime_dependencies,
tray::set_tray_enabled,
exit_app
```

- [ ] **Step 6: Verify native and frontend command contracts**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/lyrics.rs src-tauri/src/tray.rs src-tauri/src/lib.rs
git commit -m "feat: complete Frxe native command surface"
```

---

### Task 6: Replace remote backend preparation with direct platform build scripts

**Files:**
- Create: `tests/build-contract.test.mjs`
- Modify: `package.json`
- Modify: `build.bat`
- Create: `build-linux.sh`
- Create: `build-macos.sh`
- Delete: `tools/prepare-backend.ps1`
- Modify: `tests/branding.test.mjs`

**Interfaces:**
- Produces scripts `tauri:build:windows`, `tauri:build:linux`, `tauri:build:macos` and `icons`.
- No script may reference repository id `1367264568`, `backend:prepare`, or `prepare-backend.ps1`.

- [ ] **Step 1: Write a failing self-contained build contract test**

Create `tests/build-contract.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');

test('desktop build is self-contained and exposes all platform targets', async () => {
  const [pkg, win, linux, mac] = await Promise.all([
    read('package.json'), read('build.bat'), read('build-linux.sh'), read('build-macos.sh'),
  ]);
  const joined = [pkg, win, linux, mac].join('\n');
  assert.doesNotMatch(joined, /backend:prepare|prepare-backend|1367264568/);
  assert.match(pkg, /tauri:build:windows/);
  assert.match(pkg, /tauri:build:linux/);
  assert.match(pkg, /tauri:build:macos/);
  assert.match(pkg, /tauri icon web\/frxe-icon\.svg/);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test
```

Expected: FAIL because Linux/macOS scripts do not exist and package scripts still use `backend:prepare`.

- [ ] **Step 3: Make package scripts platform-neutral**

Set the relevant `package.json` fields to:

```json
{
  "description": "Frxe Desktop for Windows, Linux and macOS",
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "check": "npm test && node --check web/core.mjs && node --check web/backend.mjs && node --check web/ui-primitives.mjs && node --check web/ui.mjs && node --check web/window-controls.mjs && node --check web/app.mjs",
    "icons": "tauri icon web/frxe-icon.svg --output src-tauri/icons",
    "tauri:dev": "npm run icons && tauri dev",
    "tauri:build:windows": "npm run icons && tauri build --bundles msi",
    "tauri:build:linux": "npm run icons && tauri build --bundles deb,appimage",
    "tauri:build:macos": "npm run icons && tauri build --bundles dmg"
  }
}
```

Keep `@tauri-apps/cli` and add no new JavaScript runtime framework.

- [ ] **Step 4: Rewrite `build.bat` to build checked-in native source**

Keep the existing tool checks and `npm run check`, but replace the build command with:

```bat
echo [4/4] Building Frxe Desktop MSI...
call npm run tauri:build:windows
if errorlevel 1 exit /b 1
```

Keep staging to `release-upload\Frxe-Desktop-0.1.0-x64.msi`.

- [ ] **Step 5: Add Linux local packaging script**

Create `build-linux.sh` with `set -euo pipefail`, verify `node`, `npm`, `cargo`, run `npm install`, `npm run check`, `npm run tauri:build:linux`, then stage the first generated `.deb` and `.AppImage` to exactly:

```text
release-upload/Frxe-Desktop-0.1.0-amd64.deb
release-upload/Frxe-Desktop-0.1.0-x86_64.AppImage
```

Exit nonzero if either package cannot be found.

- [ ] **Step 6: Add macOS local packaging script**

Create `build-macos.sh` with the same checks, then `npm run tauri:build:macos`. Detect `uname -m`: `arm64` stages `Frxe-Desktop-0.1.0-macos-arm64.dmg`; `x86_64` stages `Frxe-Desktop-0.1.0-macos-x64.dmg`. Reject any other architecture.

- [ ] **Step 7: Delete the obsolete remote bootstrap and update branding test**

Remove `tools/prepare-backend.ps1`. Ensure the branding test now validates the icon command and `src-tauri/tauri.conf.json`, not the deleted PowerShell file.

- [ ] **Step 8: Run JS checks**

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json build.bat build-linux.sh build-macos.sh tests/build-contract.test.mjs tests/branding.test.mjs
git rm tools/prepare-backend.ps1
git commit -m "build: make Frxe Desktop self-contained"
```

---

### Task 7: Add Windows, Linux, and macOS package CI

**Files:**
- Modify: `.github/workflows/windows-msi.yml`
- Create: `.github/workflows/linux-packages.yml`
- Create: `.github/workflows/macos-dmg.yml`
- Modify: `tests/build-contract.test.mjs`

**Interfaces:**
- Windows artifact: `Frxe-Desktop-0.1.0-Windows`.
- Linux artifact: `Frxe-Desktop-0.1.0-Linux` containing both packages.
- macOS artifacts: `Frxe-Desktop-0.1.0-macOS-Apple-Silicon` and `Frxe-Desktop-0.1.0-macOS-Intel`.

- [ ] **Step 1: Extend the build contract test to require all workflow names and staged filenames**

Read the three workflow files and assert the exact artifact/package names from Global Constraints. Run `npm test` and verify RED because Linux/macOS workflows do not exist yet.

- [ ] **Step 2: Update Windows CI to use the direct build**

Use `windows-2025`, Node 22, stable Rust, `npm install`, `npm run check`, then `npm run tauri:build:windows`. Keep the existing MSI staging/upload logic and remove every backend-preparation reference.

- [ ] **Step 3: Add Linux CI on Ubuntu 24.04**

Install the native dependencies before Rust compilation:

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf libfuse2
```

Then Node 22, stable Rust, `npm install`, `npm run check`, `npm run tauri:build:linux`. Stage both packages under the exact Global Constraint filenames and upload them together as `Frxe-Desktop-0.1.0-Linux` with `if-no-files-found: error`.

- [ ] **Step 4: Add a two-architecture macOS matrix**

Use explicit current GitHub runner labels:

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - runner: macos-26
        arch: arm64
        artifact: Frxe-Desktop-0.1.0-macOS-Apple-Silicon
      - runner: macos-26-intel
        arch: x64
        artifact: Frxe-Desktop-0.1.0-macOS-Intel
runs-on: ${{ matrix.runner }}
```

Each job runs Node 22, stable Rust, `npm install`, `npm run check`, and `npm run tauri:build:macos`, then stages the first generated `.dmg` as `Frxe-Desktop-0.1.0-macos-${{ matrix.arch }}.dmg` and uploads it using `${{ matrix.artifact }}`. Do not add signing/notarization environment variables.

- [ ] **Step 5: Run local static contract checks**

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows tests/build-contract.test.mjs
git commit -m "ci: build Frxe Desktop on Windows Linux and macOS"
```

---

### Task 8: Update documentation and perform end-to-end verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-14-linux-self-contained-backend-design.md` only if implementation reveals a factual mismatch; do not change approved scope.

**Interfaces:**
- Produces user-visible build/install instructions and verified GitHub Actions artifacts.

- [ ] **Step 1: Rewrite README platform language**

State that Frxe Desktop supports Windows, Linux, and macOS. Document:

```text
Windows: build.bat -> release-upload\Frxe-Desktop-0.1.0-x64.msi
Linux:   bash build-linux.sh -> .deb + .AppImage
macOS:   bash build-macos.sh -> architecture-specific .dmg
```

Explain that macOS CI packages are unsigned/unnotarized, and that Linux conversion formats requiring FFmpeg need a discoverable FFmpeg installation.

- [ ] **Step 2: Verify no retired remote backend mechanism remains**

Run:

```bash
git grep -n -E '1367264568|5e8cec3611514bc73037bbf195efa066d6dd3fb8|backend:prepare|prepare-backend\.ps1' -- ':!docs/superpowers/specs/*' ':!docs/superpowers/plans/*'
```

Expected: no output.

- [ ] **Step 3: Run the full local test suite**

```bash
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: all exit 0.

- [ ] **Step 4: Verify preserved frontend requirements explicitly**

Run:

```bash
node --test tests/backend.test.mjs tests/core.test.mjs tests/ui-accessibility.test.mjs tests/window-controls.test.mjs
```

Expected: YouTube Music-first ordering, source prefetch/cache, mini-player volume, Ko-fi/GitHub pills, dark select styling, and native exit tests all pass.

- [ ] **Step 5: Push and require all three package workflows to succeed**

After pushing the implementation branch/main integration, inspect GitHub Actions and require:

```text
Windows MSI: success
Linux Packages: success
macOS DMG: Apple Silicon success
macOS DMG: Intel success
```

Do not claim installer completion while any packaging job is failed, cancelled, or still running.

- [ ] **Step 6: Verify artifact contents**

Download each workflow artifact and confirm these files exist and are non-empty:

```text
Frxe-Desktop-0.1.0-x64.msi
Frxe-Desktop-0.1.0-amd64.deb
Frxe-Desktop-0.1.0-x86_64.AppImage
Frxe-Desktop-0.1.0-macos-arm64.dmg
Frxe-Desktop-0.1.0-macos-x64.dmg
```

- [ ] **Step 7: Commit documentation**

```bash
git add README.md
git commit -m "docs: document Frxe Desktop cross-platform installers"
```

- [ ] **Step 8: Final verification before handoff**

Re-run the commands from Steps 2-4 against the final commit, then confirm the successful workflow run ids and artifact ids before presenting installer download links to the user.
