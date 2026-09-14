# Frxe Desktop Cross-Platform Self-Contained Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Frxe Desktop self-contained and produce Windows MSI, Linux DEB/AppImage, and macOS Apple Silicon/Intel DMG installers from one Tauri/Rust backend.

**Architecture:** Check the native backend into `src-tauri/` and preserve the command names and payloads already used by `web/backend.mjs`. Keep native responsibilities separated into runtime helpers, search/stream resolution, downloads/offline files, lyrics, and tray/lifecycle modules. Windows, Linux, and macOS packaging all compile the same checked-in source and never download the deleted backend repository.

**Tech Stack:** Tauri 2, Rust stable, Tokio, Reqwest with Rustls, Serde, yt-dlp subprocess integration, LRCLIB, Node.js 22 tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-14-linux-self-contained-backend-design.md`

## Global Constraints

- Version stays `0.1.0`.
- Product is `Frxe Desktop`, publisher `void`, identifier `app.frxe.desktop`.
- Search priority stays YouTube Music -> YouTube -> yt-dlp fallback.
- Keep the existing frontend source cache/prefetch for fast Next/Previous.
- Keep mini-player volume, Ko-fi/GitHub pills, and dark readable selects unchanged.
- Do not commit credentials, signing material, Apple certificates, downloaded binaries, or build output.
- Windows output: `Frxe-Desktop-0.1.0-x64.msi`.
- Linux outputs: `Frxe-Desktop-0.1.0-amd64.deb`, `Frxe-Desktop-0.1.0-x86_64.AppImage`.
- macOS outputs: `Frxe-Desktop-0.1.0-macos-arm64.dmg`, `Frxe-Desktop-0.1.0-macos-x64.dmg`.
- macOS artifacts are unsigned/unnotarized for now.
- ARM Linux, Flatpak, Snap, and universal macOS binaries are out of scope.

## File Structure

- `src-tauri/Cargo.toml` — native dependencies.
- `src-tauri/build.rs` — Tauri build hook.
- `src-tauri/tauri.conf.json` — product/window/bundle configuration.
- `src-tauri/capabilities/default.json` — Tauri permissions.
- `src-tauri/src/main.rs` — executable entry point.
- `src-tauri/src/lib.rs` — app builder and command registration.
- `src-tauri/src/models.rs` — shared serializable DTOs.
- `src-tauri/src/runtime.rs` — yt-dlp/FFmpeg discovery and explicit updater.
- `src-tauri/src/search.rs` — InnerTube search, yt-dlp fallback search, stream resolver.
- `src-tauri/src/downloads.rs` — download/offline/cancel/remove operations.
- `src-tauri/src/lyrics.rs` — LRCLIB metadata lyrics.
- `src-tauri/src/tray.rs` — tray creation and visibility.
- `src-tauri/tests/fixtures/` — deterministic search parser fixtures.
- `tests/build-contract.test.mjs` — build/CI contract regression tests.
- `package.json`, `build.bat`, `build-linux.sh`, `build-macos.sh` — platform build entry points.
- `.github/workflows/` — Windows, Linux, and macOS packaging.

---

### Task 1: Check in the minimal Tauri shell

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
- Consumes `../web` as static frontend.
- Produces `frxe_desktop_lib::run()` and native `exit_app`.

- [ ] **Step 1: Make branding tests require checked-in native source**

Use these test constants and assertions in `tests/branding.test.mjs`:

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
assert.match(icon, /fill="#09090B"/);
assert.match(icon, /fill="#FFFFFF"/);
assert.match(icon, /fill="#B7FF59"/);
```

- [ ] **Step 2: Run the test and verify RED**

```bash
npm test
```

Expected: failure because `src-tauri/tauri.conf.json` and the icon build script do not exist yet.

- [ ] **Step 3: Track native source but ignore generated native output**

Replace `.gitignore` with:

```gitignore
node_modules/
release-upload/
src-tauri/target/
src-tauri/icons/
.frxe-runtime/
*.log
.DS_Store
```

- [ ] **Step 4: Add the Cargo manifest**

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
tokio = { version = "1", features = ["fs", "io-util", "macros", "process", "rt-multi-thread", "sync"] }
regex = "1"
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

- [ ] **Step 5: Add Tauri product configuration**

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
      "assetProtocol": {
        "enable": true,
        "scope": ["$HOME/**", "$AUDIO/**", "$DOWNLOAD/**"]
      }
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

- [ ] **Step 6: Add the native entry point and app builder**

`src-tauri/src/main.rs`:

```rust
fn main() {
    frxe_desktop_lib::run();
}
```

`src-tauri/src/lib.rs`:

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

- [ ] **Step 7: Verify GREEN**

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add .gitignore tests/branding.test.mjs src-tauri
git commit -m "feat: add self-contained Tauri desktop shell"
```

---

### Task 2: Add runtime helper discovery and updater

**Files:**
- Create: `src-tauri/src/models.rs`
- Create: `src-tauri/src/runtime.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- `runtime_dir(&AppHandle) -> Result<PathBuf, String>`.
- `resolve_ytdlp(&Path) -> Result<PathBuf, String>`.
- `resolve_ffmpeg(&Path) -> Option<PathBuf>`.
- Tauri command `update_runtime_dependencies` returns `RuntimeStatus`.

- [ ] **Step 1: Write failing platform helper tests**

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
fn ytdlp_url_is_official_release_asset() {
    assert_eq!(
        ytdlp_download_url(),
        format!("https://github.com/yt-dlp/yt-dlp/releases/latest/download/{}", ytdlp_asset_name())
    );
}
```

- [ ] **Step 2: Verify RED**

```bash
cargo test --manifest-path src-tauri/Cargo.toml runtime::tests -- --nocapture
```

Expected: compile failure because the helper functions do not exist.

- [ ] **Step 3: Add shared DTOs**

Create `src-tauri/src/models.rs`:

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

- [ ] **Step 4: Implement exact helper lookup behavior**

Use these concrete helpers in `runtime.rs`:

```rust
use std::{env, path::{Path, PathBuf}};
use tauri::Manager;

pub fn ytdlp_asset_name() -> &'static str {
    if cfg!(target_os = "windows") { "yt-dlp.exe" }
    else if cfg!(target_os = "macos") { "yt-dlp_macos" }
    else { "yt-dlp" }
}

pub fn ytdlp_download_url() -> String {
    format!("https://github.com/yt-dlp/yt-dlp/releases/latest/download/{}", ytdlp_asset_name())
}

fn executable_in_path(name: &str) -> Option<PathBuf> {
    env::var_os("PATH")
        .into_iter()
        .flat_map(|value| env::split_paths(&value).collect::<Vec<_>>())
        .map(|dir| dir.join(name))
        .find(|path| path.is_file())
}

pub fn runtime_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("runtime");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn resolve_ytdlp(dir: &Path) -> Result<PathBuf, String> {
    let local = dir.join(ytdlp_asset_name());
    if local.is_file() { return Ok(local); }
    executable_in_path(if cfg!(target_os = "windows") { "yt-dlp.exe" } else { "yt-dlp" })
        .ok_or_else(|| "yt-dlp is unavailable. Use Update runtime dependencies first.".to_string())
}

pub fn resolve_ffmpeg(dir: &Path) -> Option<PathBuf> {
    let name = if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" };
    let local = dir.join(name);
    if local.is_file() { Some(local) } else { executable_in_path(name) }
}
```

- [ ] **Step 5: Implement explicit yt-dlp update command**

Use this flow in `update_runtime_dependencies`:

```rust
#[tauri::command]
pub async fn update_runtime_dependencies(app: tauri::AppHandle) -> Result<crate::models::RuntimeStatus, String> {
    let dir = runtime_dir(&app)?;
    let target = dir.join(ytdlp_asset_name());
    let bytes = reqwest::Client::new()
        .get(ytdlp_download_url())
        .header("User-Agent", "Frxe-Desktop/0.1.0")
        .send().await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?
        .bytes().await.map_err(|e| e.to_string())?;
    tokio::fs::write(&target, &bytes).await.map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    }
    let ffmpeg = resolve_ffmpeg(&dir);
    let warnings = if ffmpeg.is_none() {
        vec!["FFmpeg was not found. MP3/FLAC/WAV conversion requires an installed FFmpeg binary.".to_string()]
    } else { Vec::new() };
    Ok(crate::models::RuntimeStatus {
        ytdlp_path: Some(target.to_string_lossy().into_owned()),
        ffmpeg_path: ffmpeg.map(|p| p.to_string_lossy().into_owned()),
        warnings,
    })
}
```

- [ ] **Step 6: Register and verify GREEN**

Add `mod models; mod runtime;` and `runtime::update_runtime_dependencies` to `generate_handler!`, then run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/models.rs src-tauri/src/runtime.rs src-tauri/src/lib.rs
git commit -m "feat: add runtime dependency manager"
```

---

### Task 3: Implement YouTube Music-first search and stream resolution

**Files:**
- Create: `src-tauri/src/search.rs`
- Create: `src-tauri/tests/fixtures/music-search.json`
- Create: `src-tauri/tests/fixtures/web-search.json`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Commands: `innertube_search(query, client)`, `ytdlp_search(query)`, `resolve_stream_url(video_id)`.
- Search returns `Vec<Track>`; resolver returns a direct HTTP(S) URL string.

- [ ] **Step 1: Add deterministic parser fixtures and failing tests**

Use this complete music fixture:

```json
{"contents":{"items":[{"musicResponsiveListItemRenderer":{"playlistItemData":{"videoId":"abcdefghijk"},"flexColumns":[{"musicResponsiveListItemFlexColumnRenderer":{"text":{"runs":[{"text":"Example Song"}]}}},{"musicResponsiveListItemFlexColumnRenderer":{"text":{"runs":[{"text":"Example Artist"}]}}}],"thumbnail":{"musicThumbnailRenderer":{"thumbnail":{"thumbnails":[{"url":"https://img.test/cover.jpg"}]}}}}}]}}
```

Use this complete web fixture:

```json
{"contents":{"items":[{"videoRenderer":{"videoId":"abcdefghijk","title":{"runs":[{"text":"Example Song"}]},"ownerText":{"runs":[{"text":"Example Artist"}]},"thumbnail":{"thumbnails":[{"url":"https://img.test/cover.jpg"}]}}}]}}
```

Add tests:

```rust
#[test]
fn parses_music_track() {
    let json: serde_json::Value = serde_json::from_str(include_str!("../tests/fixtures/music-search.json")).unwrap();
    let tracks = parse_music_results(&json);
    assert_eq!(tracks[0].id, "abcdefghijk");
    assert_eq!(tracks[0].source.as_deref(), Some("YouTube Music"));
}

#[test]
fn parses_web_track() {
    let json: serde_json::Value = serde_json::from_str(include_str!("../tests/fixtures/web-search.json")).unwrap();
    let tracks = parse_web_results(&json);
    assert_eq!(tracks[0].source.as_deref(), Some("YouTube"));
}
```

- [ ] **Step 2: Verify RED**

```bash
cargo test --manifest-path src-tauri/Cargo.toml search::tests -- --nocapture
```

Expected: compile failure because search parsing functions do not exist.

- [ ] **Step 3: Implement safe recursive renderer collection**

Use these helpers so malformed provider responses never panic:

```rust
fn collect_named(node: &serde_json::Value, key: &str, out: &mut Vec<serde_json::Value>) {
    match node {
        serde_json::Value::Object(map) => {
            if let Some(value) = map.get(key) { out.push(value.clone()); }
            for value in map.values() { collect_named(value, key, out); }
        }
        serde_json::Value::Array(values) => {
            for value in values { collect_named(value, key, out); }
        }
        _ => {}
    }
}

fn run_text(value: &serde_json::Value, pointer: &str) -> String {
    value.pointer(pointer)
        .and_then(|v| v.as_array())
        .and_then(|runs| runs.first())
        .and_then(|run| run.get("text"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn valid_video_id(value: &str) -> bool {
    value.len() == 11 && value.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}
```

`parse_music_results` collects `musicResponsiveListItemRenderer`, reads `/playlistItemData/videoId`, first flex-column run as title, second flex-column run as artist, last thumbnail URL, and emits source `YouTube Music`. `parse_web_results` collects `videoRenderer`, reads `/videoId`, `/title/runs`, `/ownerText/runs`, last thumbnail URL, and emits source `YouTube`.

- [ ] **Step 4: Implement InnerTube config bootstrap and POST**

Use these exact hosts/client names:

```rust
fn client_settings(client: &str) -> Result<(&'static str, &'static str, &'static str), String> {
    match client {
        "music" => Ok(("https://music.youtube.com/", "https://music.youtube.com/youtubei/v1/search", "WEB_REMIX")),
        "web" => Ok(("https://www.youtube.com/", "https://www.youtube.com/youtubei/v1/search", "WEB")),
        _ => Err("Unsupported InnerTube client".to_string()),
    }
}
```

Fetch the homepage with `Frxe-Desktop/0.1.0`, extract `INNERTUBE_API_KEY` and `INNERTUBE_CLIENT_VERSION` using regexes, then POST:

```json
{"context":{"client":{"clientName":"WEB_REMIX","clientVersion":"<extracted>","hl":"en"}},"query":"<query>"}
```

For `web`, replace `WEB_REMIX` with `WEB`. Add `?key=<api key>&prettyPrint=false` to the endpoint. Parse with the matching parser.

- [ ] **Step 5: Implement yt-dlp fallback search**

Resolve yt-dlp through `runtime_dir` + `resolve_ytdlp`, then execute:

```text
yt-dlp --no-warnings --flat-playlist --dump-single-json ytsearch20:<query>
```

Parse `entries` fields `id`, `title`, `channel`/`uploader`, `thumbnail`, and `duration`; reject invalid video ids; emit `kind: youtube` and `source: YouTube`.

- [ ] **Step 6: Implement stream resolution**

Validate the 11-character id, then execute:

```text
yt-dlp --no-warnings --no-playlist -f bestaudio/best -g https://www.youtube.com/watch?v=<video_id>
```

Return the first trimmed stdout line beginning with `https://` or `http://`. If the subprocess exits nonzero, return stderr text prefixed with `yt-dlp could not resolve this track:`.

- [ ] **Step 7: Register and verify**

Register all three search commands and run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm test
```

Expected: Rust parser tests pass, and the existing JS adapter test still verifies `music`, then `web`, then yt-dlp ordering.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/search.rs src-tauri/tests/fixtures src-tauri/src/lib.rs
git commit -m "feat: add YouTube Music search and stream resolver"
```

---

### Task 4: Implement downloads, cancellation, and offline operations

**Files:**
- Create: `src-tauri/src/downloads.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- `DownloadManager` stores `task_id -> process id`.
- Commands: `scan_downloads`, `clear_removed_downloads`, `download_already_exists`, `download_track`, `cancel_download`, `remove_download`.
- Event: `download-progress` with snake_case `{ task_id, percent, speed, eta, item_title }`.

- [ ] **Step 1: Add failing helper tests**

```rust
#[test]
fn parses_progress() {
    let p = parse_progress("FRXE:42.5%|1.2MiB/s|00:31|Example Song").unwrap();
    assert_eq!(p.percent, 42.5);
    assert_eq!(p.speed, "1.2MiB/s");
    assert_eq!(p.item_title, "Example Song");
}

#[test]
fn rejects_delete_outside_root() {
    let root = tempfile::tempdir().unwrap();
    let outside = root.path().parent().unwrap().join("outside.mp3");
    assert!(validated_child_path(root.path(), &outside).is_err());
}
```

- [ ] **Step 2: Verify RED**

```bash
cargo test --manifest-path src-tauri/Cargo.toml downloads::tests -- --nocapture
```

- [ ] **Step 3: Implement local scan and safe remove**

Use `walkdir::WalkDir` and allow only `mp3`, `m4a`, `flac`, `wav`, `opus`, `ogg`, `webm`. Each result is:

```rust
Track {
    id: path.to_string_lossy().into_owned(),
    kind: "local".into(),
    title: path.file_stem().and_then(|v| v.to_str()).unwrap_or("Offline track").to_string(),
    artist: "Offline".into(),
    album: None,
    cover: None,
    duration_seconds: None,
    source: Some("Offline".into()),
    path: Some(path.to_string_lossy().into_owned()),
}
```

`clear_removed_downloads` returns `Ok(0u32)` because there is no native stale-file database. `remove_download` canonicalizes the root and target, rejects targets that do not start with the root, then deletes only regular files.

- [ ] **Step 4: Implement download existence and exact format mapping**

Search filenames for `[<video_id>]`. Use output template:

```text
%(title).180B [%(id)s].%(ext)s
```

Use this mapping:

```rust
match format.as_str() {
    "mp3" | "flac" | "wav" => {
        args.extend(["-x".into(), "--audio-format".into(), format.clone()]);
        let q = match quality.as_str() { "best" => "0", "high" => "2", "balanced" => "5", _ => "5" };
        args.extend(["--audio-quality".into(), q.into()]);
    }
    "m4a" => args.extend([
        "-f".into(), "bestaudio[ext=m4a]/bestaudio".into(), "--remux-video".into(), "m4a".into()
    ]),
    _ => return Err("Unsupported audio format".into()),
}
```

Before MP3/FLAC/WAV/M4A conversion/remux, require `resolve_ffmpeg(&runtime_dir)` and return this exact error when missing: `FFmpeg is required for this format. Install FFmpeg, then use Update runtime dependencies again.`

- [ ] **Step 5: Implement download process and event parsing**

Build yt-dlp args with:

```text
--newline
--progress
--progress-template
download:FRXE:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.title)s
-o
<output_dir>/%(title).180B [%(id)s].%(ext)s
```

Add `--no-playlist` when `allow_playlist` is false. Spawn with piped stdout/stderr, store its process id in `DownloadManager`, parse every line beginning `FRXE:`, emit `DownloadProgress` with `app.emit("download-progress", payload)`, await process exit, remove the task id, and return an error with stderr content when the exit status is nonzero.

- [ ] **Step 6: Implement cancellation using the stored PID**

Use:

```rust
let mut system = sysinfo::System::new_all();
system.refresh_all();
let pid = sysinfo::Pid::from_u32(pid_u32);
let killed = system.process(pid).map(|p| p.kill()).unwrap_or(false);
if !killed { return Err("Download process is no longer running".into()); }
```

Remove the task mapping whether the process is found or already gone.

- [ ] **Step 7: Register state/commands and verify**

Call `.manage(downloads::DownloadManager::default())`, register all six commands, then run:

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

### Task 5: Add lyrics, tray, and final command surface

**Files:**
- Create: `src-tauri/src/lyrics.rs`
- Create: `src-tauri/src/tray.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Command `fetch_metadata_lyrics(title, artist, album, duration_seconds)` returns `LyricsResult`.
- Command `set_tray_enabled(enabled)` toggles one persistent tray icon.
- Keep `exit_app` for `web/window-controls.mjs`.

- [ ] **Step 1: Write failing lyrics mapping test**

```rust
#[test]
fn maps_lrclib_payload() {
    let raw = r#"{"syncedLyrics":"[00:01.00]Hi","plainLyrics":"Hi"}"#;
    let result = parse_lrclib(raw).unwrap();
    assert_eq!(result.synced_lyrics.as_deref(), Some("[00:01.00]Hi"));
    assert_eq!(result.plain_lyrics.as_deref(), Some("Hi"));
}
```

- [ ] **Step 2: Verify RED**

```bash
cargo test --manifest-path src-tauri/Cargo.toml lyrics::tests -- --nocapture
```

- [ ] **Step 3: Implement LRCLIB lookup**

Deserialize only `syncedLyrics` and `plainLyrics`; request `https://lrclib.net/api/get` with `track_name`, `artist_name`, optional `album_name`, and rounded `duration`. Use user agent `Frxe-Desktop/0.1.0`. Return `LyricsResult::default()` on HTTP 404 and descriptive errors for other non-success statuses.

- [ ] **Step 4: Build the tray once and toggle visibility**

In `tray.rs`, expose:

```rust
use tauri::{Manager, tray::{TrayIconBuilder, TrayIconEvent}};

pub fn install(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let mut builder = TrayIconBuilder::with_id("frxe-tray").tooltip("Frxe Desktop");
    if let Some(icon) = app.default_window_icon() { builder = builder.icon(icon.clone()); }
    let tray = builder.on_tray_icon_event(|tray, event| {
        if matches!(event, TrayIconEvent::Click { .. }) {
            if let Some(window) = tray.app_handle().get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }).build(app)?;
    tray.set_visible(false)?;
    Ok(())
}

#[tauri::command]
pub fn set_tray_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let tray = app.tray_by_id("frxe-tray").ok_or_else(|| "Frxe tray is unavailable".to_string())?;
    tray.set_visible(enabled).map_err(|e| e.to_string())
}
```

Call `tray::install(app)?` from `Builder::setup`.

- [ ] **Step 5: Register the final command list**

`generate_handler!` must include:

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

- [ ] **Step 6: Verify GREEN**

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

### Task 6: Replace backend bootstrap with direct build scripts

**Files:**
- Create: `tests/build-contract.test.mjs`
- Modify: `package.json`
- Modify: `build.bat`
- Create: `build-linux.sh`
- Create: `build-macos.sh`
- Delete: `tools/prepare-backend.ps1`
- Modify: `tests/branding.test.mjs`

**Interfaces:**
- Scripts: `icons`, `tauri:dev`, `tauri:build:windows`, `tauri:build:linux`, `tauri:build:macos`.
- No build path references `1367264568`, `backend:prepare`, or `prepare-backend.ps1`.

- [ ] **Step 1: Write failing build contract test**

Create `tests/build-contract.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');

test('desktop builds are self-contained for all platforms', async () => {
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

- [ ] **Step 2: Verify RED**

```bash
npm test
```

Expected: fail because Linux/macOS scripts are absent and package scripts still call backend preparation.

- [ ] **Step 3: Replace package scripts**

Use:

```json
"scripts": {
  "test": "node --test tests/*.test.mjs",
  "check": "npm test && node --check web/core.mjs && node --check web/backend.mjs && node --check web/ui-primitives.mjs && node --check web/ui.mjs && node --check web/window-controls.mjs && node --check web/app.mjs",
  "icons": "tauri icon web/frxe-icon.svg --output src-tauri/icons",
  "tauri:dev": "npm run icons && tauri dev",
  "tauri:build:windows": "npm run icons && tauri build --bundles msi",
  "tauri:build:linux": "npm run icons && tauri build --bundles deb,appimage",
  "tauri:build:macos": "npm run icons && tauri build --bundles dmg"
}
```

Also change description to `Frxe Desktop for Windows, Linux and macOS`.

- [ ] **Step 4: Update Windows build command**

Keep the existing checks/staging and replace only the native build invocation with:

```bat
echo [4/4] Building Frxe Desktop MSI...
call npm run tauri:build:windows
if errorlevel 1 exit /b 1
```

- [ ] **Step 5: Create complete Linux build script**

`build-linux.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "[ERROR] Node.js 20+ is required."; exit 1; }
command -v npm >/dev/null || { echo "[ERROR] npm is required."; exit 1; }
command -v cargo >/dev/null || { echo "[ERROR] Rust/Cargo is required."; exit 1; }
npm install
npm run check
npm run tauri:build:linux
mkdir -p release-upload
deb="$(find src-tauri/target/release/bundle/deb -type f -name '*.deb' | head -n 1)"
appimage="$(find src-tauri/target/release/bundle/appimage -type f -name '*.AppImage' | head -n 1)"
[[ -n "$deb" && -f "$deb" ]] || { echo "[ERROR] No DEB produced."; exit 1; }
[[ -n "$appimage" && -f "$appimage" ]] || { echo "[ERROR] No AppImage produced."; exit 1; }
cp "$deb" release-upload/Frxe-Desktop-0.1.0-amd64.deb
cp "$appimage" release-upload/Frxe-Desktop-0.1.0-x86_64.AppImage
```

- [ ] **Step 6: Create complete macOS build script**

`build-macos.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "[ERROR] Node.js 20+ is required."; exit 1; }
command -v npm >/dev/null || { echo "[ERROR] npm is required."; exit 1; }
command -v cargo >/dev/null || { echo "[ERROR] Rust/Cargo is required."; exit 1; }
npm install
npm run check
npm run tauri:build:macos
mkdir -p release-upload
dmg="$(find src-tauri/target/release/bundle/dmg -type f -name '*.dmg' | head -n 1)"
[[ -n "$dmg" && -f "$dmg" ]] || { echo "[ERROR] No DMG produced."; exit 1; }
case "$(uname -m)" in
  arm64) out="Frxe-Desktop-0.1.0-macos-arm64.dmg" ;;
  x86_64) out="Frxe-Desktop-0.1.0-macos-x64.dmg" ;;
  *) echo "[ERROR] Unsupported macOS architecture."; exit 1 ;;
esac
cp "$dmg" "release-upload/$out"
```

- [ ] **Step 7: Remove old bootstrap and verify GREEN**

Delete `tools/prepare-backend.ps1`, update branding test to read Tauri config/package scripts, then run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json build.bat build-linux.sh build-macos.sh tests/build-contract.test.mjs tests/branding.test.mjs
git rm tools/prepare-backend.ps1
git commit -m "build: make Frxe Desktop self-contained"
```

---

### Task 7: Add Windows, Linux, and macOS packaging workflows

**Files:**
- Modify: `.github/workflows/windows-msi.yml`
- Create: `.github/workflows/linux-packages.yml`
- Create: `.github/workflows/macos-dmg.yml`
- Modify: `tests/build-contract.test.mjs`

**Interfaces:**
- Windows artifact `Frxe-Desktop-0.1.0-Windows`.
- Linux artifact `Frxe-Desktop-0.1.0-Linux`.
- macOS artifacts `Frxe-Desktop-0.1.0-macOS-Apple-Silicon`, `Frxe-Desktop-0.1.0-macOS-Intel`.

- [ ] **Step 1: Extend build-contract test and verify RED**

Add reads for all three workflow files and these assertions:

```js
assert.match(windowsWorkflow, /Frxe-Desktop-0\.1\.0-Windows/);
assert.match(linuxWorkflow, /Frxe-Desktop-0\.1\.0-Linux/);
assert.match(linuxWorkflow, /Frxe-Desktop-0\.1\.0-amd64\.deb/);
assert.match(linuxWorkflow, /Frxe-Desktop-0\.1\.0-x86_64\.AppImage/);
assert.match(macWorkflow, /Frxe-Desktop-0\.1\.0-macOS-Apple-Silicon/);
assert.match(macWorkflow, /Frxe-Desktop-0\.1\.0-macOS-Intel/);
```

Run `npm test`; expected failure because Linux/macOS workflow files do not exist.

- [ ] **Step 2: Update Windows workflow**

Keep checkout, Node 22, stable Rust and artifact upload. Set `runs-on: windows-2025`; run `npm install`, `npm run check`, `npm run tauri:build:windows`; stage `Frxe-Desktop-0.1.0-x64.msi`. Do not run the removed backend preparation command.

- [ ] **Step 3: Add Linux workflow**

Create a job on `ubuntu-24.04` with this dependency step:

```yaml
- name: Install Tauri Linux dependencies
  run: |
    sudo apt-get update
    sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf libfuse2
```

Then checkout, Node 22, stable Rust, `npm install`, `npm run check`, `npm run tauri:build:linux`. Stage both exact filenames into `release-upload/` and upload with:

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: Frxe-Desktop-0.1.0-Linux
    path: |
      release-upload/Frxe-Desktop-0.1.0-amd64.deb
      release-upload/Frxe-Desktop-0.1.0-x86_64.AppImage
    if-no-files-found: error
```

- [ ] **Step 4: Add two-architecture macOS workflow**

Use this matrix:

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

Each job uses Node 22 and stable Rust, runs `npm install`, `npm run check`, `npm run tauri:build:macos`, copies the produced DMG to `release-upload/Frxe-Desktop-0.1.0-macos-${{ matrix.arch }}.dmg`, and uploads it as `${{ matrix.artifact }}`. Do not add signing or notarization secrets.

- [ ] **Step 5: Verify static contract GREEN**

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

### Task 8: Document and verify all installers end to end

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces final documented installers and artifact download handoff.

- [ ] **Step 1: Update README with all platform commands**

Document exactly:

```text
Windows: build.bat -> release-upload\Frxe-Desktop-0.1.0-x64.msi
Linux:   bash build-linux.sh -> release-upload/Frxe-Desktop-0.1.0-amd64.deb + Frxe-Desktop-0.1.0-x86_64.AppImage
macOS:   bash build-macos.sh -> architecture-specific Frxe-Desktop-0.1.0-macos-*.dmg
```

Also state that macOS artifacts are unsigned/unnotarized and that MP3/FLAC/WAV/M4A conversion/remux needs discoverable FFmpeg.

- [ ] **Step 2: Verify old backend bootstrap is gone from executable source/build files**

```bash
git grep -n -E '1367264568|5e8cec3611514bc73037bbf195efa066d6dd3fb8|backend:prepare|prepare-backend\.ps1' -- ':!docs/superpowers/specs/*' ':!docs/superpowers/plans/*'
```

Expected: no output.

- [ ] **Step 3: Run complete local verification**

```bash
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
node --test tests/backend.test.mjs tests/core.test.mjs tests/ui-accessibility.test.mjs tests/window-controls.test.mjs tests/build-contract.test.mjs
```

Expected: all commands exit 0; preserved tests prove YouTube Music priority, fast-skip source cache/prefetch, mini-player volume, support pills, dark selects, and native exit behavior remain intact.

- [ ] **Step 4: Commit README**

```bash
git add README.md
git commit -m "docs: document cross-platform Frxe installers"
```

- [ ] **Step 5: Push and require all package jobs to succeed**

Before any completion claim, verify GitHub Actions reports:

```text
Windows MSI: success
Linux Packages: success
macOS DMG / arm64: success
macOS DMG / x64: success
```

- [ ] **Step 6: Download and inspect every artifact**

Require all five files to exist and have non-zero size:

```text
Frxe-Desktop-0.1.0-x64.msi
Frxe-Desktop-0.1.0-amd64.deb
Frxe-Desktop-0.1.0-x86_64.AppImage
Frxe-Desktop-0.1.0-macos-arm64.dmg
Frxe-Desktop-0.1.0-macos-x64.dmg
```

- [ ] **Step 7: Final verification on the final commit**

Re-run Step 2 and Step 3, then record the successful workflow run ids and artifact ids. Only after that present installer links to the user.
