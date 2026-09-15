# Frxe Desktop v1.2.4 Native Media Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class Windows SMTC, Linux MPRIS, and macOS Now Playing/media-key integration while keeping the existing HTML audio element as Frxe Desktop's single playback authority.

**Architecture:** A focused `web/media-controls.mjs` module builds native playback snapshots and applies normalized native commands. The Tauri backend adds a `media_controls` Rust module backed by `playwire` 1.0.0; it converts snapshots to `PlaybackState`, emits `player-command` events from OS media actions, and degrades to a disabled native session if platform initialization fails. `web/app.mjs` wires the existing playback functions into this bridge and republishes state on track/playback/settings changes and each playback-position tick.

**Tech Stack:** JavaScript ES modules, Node test runner, Tauri 2, Rust 2021, `playwire = "1.0.0"`, serde, existing GitHub Actions matrix.

**Spec:** `docs/superpowers/specs/2026-09-15-native-media-controls-design.md`

## Global Constraints

- The HTML audio element remains the only playback engine.
- Native media controls must never become a playback dependency: initialization or update failure must not stop normal Frxe playback.
- Use `playwire` 1.0.x; its `PlaybackState` is republished on every playback-position tick.
- `playwire::Capabilities` only carries `can_go_next`, `can_go_previous`, and `can_seek`.
- Artwork published to native controls must be an `http://`, `https://`, or `file://` URL; invalid or unsupported artwork becomes an empty string instead of failing a snapshot.
- Linux MPRIS may request volume; volume remains authoritative in the frontend audio element and the updated volume is published back in the next snapshot.
- Windows uses the Tauri main window HWND for SMTC.
- Existing browser `navigator.mediaSession` support remains as a fallback.
- Existing CI commands remain mandatory: `npm run check`, icon generation, Rust tests, and `cargo check`.
- The feature must compile in the existing Windows, Linux, Apple Silicon macOS, and Intel macOS package workflows before merge to `main`.

---

### Task 1: Add pure frontend snapshot and command helpers

**Files:**
- Create: `web/media-controls.mjs`
- Create: `tests/media-controls.test.mjs`

**Interfaces:**
- Produces: `buildMediaPlaybackSnapshot(input) -> object`
- Produces: `applyNativeMediaCommand(context, payload) -> Promise<boolean>`
- `buildMediaPlaybackSnapshot` accepts `{ track, queue, queueIndex, prefs, playing, positionSeconds, durationSeconds }`.
- `applyNativeMediaCommand` receives callbacks `{ play, pause, togglePlay, next, previous, stop, seekTo, setVolume, setShuffle, setRepeat }` and a normalized payload from Rust.

- [ ] **Step 1: Write failing snapshot tests**

Create `tests/media-controls.test.mjs` with cases that assert:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMediaPlaybackSnapshot, applyNativeMediaCommand } from '../web/media-controls.mjs';

const track = {
  id: 'abcdefghijk',
  kind: 'youtube',
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  cover: 'https://img.test/cover.jpg',
};

test('buildMediaPlaybackSnapshot maps Frxe state into the native contract', () => {
  assert.deepEqual(buildMediaPlaybackSnapshot({
    track,
    queue: [track, { ...track, id: 'next-track' }],
    queueIndex: 0,
    prefs: { volume: 0.7, muted: false, shuffle: true, repeat: 'queue' },
    playing: true,
    positionSeconds: 42,
    durationSeconds: 200,
  }), {
    trackId: 'abcdefghijk',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    artwork: 'https://img.test/cover.jpg',
    durationSeconds: 200,
    positionSeconds: 42,
    playing: true,
    volume: 0.7,
    shuffle: true,
    repeat: 'queue',
    canNext: true,
    canPrevious: false,
    canSeek: true,
  });
});

test('buildMediaPlaybackSnapshot clears metadata when no track is loaded', () => {
  const snapshot = buildMediaPlaybackSnapshot({
    track: null,
    queue: [],
    queueIndex: -1,
    prefs: { volume: 1, muted: false, shuffle: false, repeat: 'off' },
    playing: false,
    positionSeconds: 0,
    durationSeconds: 0,
  });
  assert.equal(snapshot.trackId, null);
  assert.equal(snapshot.title, null);
  assert.equal(snapshot.canSeek, false);
});

test('buildMediaPlaybackSnapshot omits unsupported artwork schemes and clamps media values', () => {
  const snapshot = buildMediaPlaybackSnapshot({
    track: { ...track, cover: 'data:image/png;base64,abc' },
    queue: [track],
    queueIndex: 0,
    prefs: { volume: 3, muted: true, shuffle: false, repeat: 'track' },
    playing: false,
    positionSeconds: 999,
    durationSeconds: 120,
  });
  assert.equal(snapshot.artwork, '');
  assert.equal(snapshot.volume, 0);
  assert.equal(snapshot.positionSeconds, 120);
  assert.equal(snapshot.repeat, 'track');
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run: `node --test tests/media-controls.test.mjs`

Expected: FAIL because `web/media-controls.mjs` does not exist.

- [ ] **Step 3: Implement `buildMediaPlaybackSnapshot` minimally**

Create `web/media-controls.mjs` with helpers that:

```js
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const nativeArtwork = (value) => /^(https?:|file:)/i.test(String(value || '')) ? String(value) : '';

export function buildMediaPlaybackSnapshot({ track, queue = [], queueIndex = -1, prefs = {}, playing = false, positionSeconds = 0, durationSeconds = 0 }) {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null;
  const position = duration == null ? Math.max(0, Number(positionSeconds) || 0) : clamp(Number(positionSeconds) || 0, 0, duration);
  return {
    trackId: track?.id || track?.path || null,
    title: track?.title || null,
    artist: track?.artist || null,
    album: track?.album || null,
    artwork: nativeArtwork(track?.cover),
    durationSeconds: duration,
    positionSeconds: position,
    playing: Boolean(track && playing),
    volume: prefs.muted ? 0 : clamp(Number(prefs.volume ?? 1), 0, 1),
    shuffle: Boolean(prefs.shuffle),
    repeat: ['off', 'queue', 'track'].includes(prefs.repeat) ? prefs.repeat : 'off',
    canNext: Boolean(track && queueIndex >= 0 && (queueIndex < queue.length - 1 || prefs.repeat === 'queue' || prefs.shuffle)),
    canPrevious: Boolean(track && queueIndex > 0),
    canSeek: Boolean(track && duration != null),
  };
}
```

- [ ] **Step 4: Add failing native-command mapping tests**

Append tests that send payloads `{ action: 'play' }`, `{ action: 'pause' }`, `{ action: 'toggle-play' }`, `{ action: 'next' }`, `{ action: 'previous' }`, `{ action: 'stop' }`, `{ action: 'seek-to', positionSeconds: 25 }`, `{ action: 'seek-by', offsetSeconds: -10 }`, `{ action: 'set-volume', volume: 0.4 }`, `{ action: 'set-shuffle', enabled: true }`, and `{ action: 'set-repeat', mode: 'track' }` into `applyNativeMediaCommand` and assert exactly one matching callback runs. Assert an unknown action returns `false` and calls nothing.

- [ ] **Step 5: Run the command tests and verify RED**

Run: `node --test tests/media-controls.test.mjs`

Expected: snapshot tests PASS; command tests FAIL because `applyNativeMediaCommand` is not implemented.

- [ ] **Step 6: Implement `applyNativeMediaCommand`**

Implement a switch that returns `true` for handled commands and awaits the provided callback. Validate repeat modes against `off|queue|track`; clamp volume to `0..1`; pass seek numbers only when finite; otherwise return `false`.

- [ ] **Step 7: Run Task 1 tests and commit**

Run: `node --test tests/media-controls.test.mjs`

Expected: PASS.

Commit: `feat: add media control state helpers`

---

### Task 2: Add the frontend-to-Tauri backend contract

**Files:**
- Modify: `web/backend.mjs`
- Modify: `tests/backend.test.mjs`

**Interfaces:**
- Consumes: snapshot object from Task 1.
- Produces: `backend.updateMediaControls(snapshot) -> Promise<unknown>` invoking `update_media_controls` with `{ snapshot }`.

- [ ] **Step 1: Write a failing backend mapping test**

Append:

```js
test('updateMediaControls maps the snapshot to the native command', async () => {
  let call;
  const backend = createBackend({ invoke: async (command, payload) => { call = [command, payload]; } });
  const snapshot = { trackId: 'abc', playing: true };
  await backend.updateMediaControls(snapshot);
  assert.deepEqual(call, ['update_media_controls', { snapshot }]);
});
```

- [ ] **Step 2: Run the focused backend test and verify RED**

Run: `node --test tests/backend.test.mjs`

Expected: FAIL because `updateMediaControls` is missing.

- [ ] **Step 3: Implement the backend method**

Add to the returned backend object:

```js
updateMediaControls(snapshot) {
  return invoke('update_media_controls', { snapshot });
},
```

- [ ] **Step 4: Verify and commit**

Run: `node --test tests/backend.test.mjs`

Expected: PASS.

Commit: `feat: expose native media control updates`

---

### Task 3: Add Rust snapshot conversion and event mapping with unit tests

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/media_controls.rs`

**Interfaces:**
- Produces: `MediaPlaybackSnapshot` serde input type.
- Produces: `snapshot_to_playwire(&MediaPlaybackSnapshot) -> playwire::PlaybackState`.
- Produces: `event_payload(playwire::Event) -> Option<serde_json::Value>`.
- Later tasks use `NativeMediaControls::new(app)` and `NativeMediaControls::set_state(snapshot)` from the same module.

- [ ] **Step 1: Add `playwire = "1.0.0"` and write failing pure Rust tests**

Add dependency to `src-tauri/Cargo.toml`. In `media_controls.rs`, define the serde shape and tests before implementations. Tests must cover:

```rust
#[test]
fn maps_snapshot_to_playwire_state() { /* assert track, repeat All, shuffle, capability fields, duration/position */ }

#[test]
fn clamps_position_and_volume() { /* 150s position on 100s track becomes 100s; volume 2.0 becomes 1.0 */ }

#[test]
fn maps_native_events_to_player_commands() { /* Play -> {action:"play"}, SeekTo -> seek-to, SetRepeat(One) -> set-repeat track */ }

#[test]
fn empty_snapshot_clears_track() { /* track_id None -> PlaybackState.track None and playing false */ }
```

Use `serde::{Deserialize, Serialize}` and `#[serde(rename_all = "camelCase")]` on the snapshot type so the frontend contract is direct.

- [ ] **Step 2: Run Rust tests and verify RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml media_controls -- --nocapture`

Expected: compile/test failure because conversion and event functions are incomplete.

- [ ] **Step 3: Implement conversion**

Map repeat modes exactly:

```rust
fn repeat_mode(value: &str) -> playwire::Repeat {
    match value {
        "track" => playwire::Repeat::One,
        "queue" => playwire::Repeat::All,
        _ => playwire::Repeat::Off,
    }
}
```

Build `playwire::PlaybackState` with `Duration::from_secs_f64`, sanitized finite non-negative values, `Capabilities { can_go_next, can_go_previous, can_seek }`, and `Track { id, title, artists: vec![artist], album, artwork_url, url: String::new() }`. Empty optional metadata becomes an empty string. A missing `track_id` yields `track: None` and `playing: false`.

- [ ] **Step 4: Implement event payload mapping**

Map:

```text
Play -> play
Pause -> pause
PlayPause -> toggle-play
Stop -> stop
Next -> next
Previous -> previous
SeekTo -> seek-to + positionSeconds
SeekBy -> seek-by + offsetSeconds
SetVolume -> set-volume + volume
SetShuffle -> set-shuffle + enabled
SetRepeat(Off|All|One) -> set-repeat + off|queue|track
Raise -> raise
Quit -> quit
OpenUri(_) -> ignored for v1.2.4
unknown future variants -> ignored
```

- [ ] **Step 5: Verify and commit**

Run: `cargo test --manifest-path src-tauri/Cargo.toml media_controls -- --nocapture`

Expected: PASS.

Commit: `feat: map Frxe state to native media controls`

---

### Task 4: Initialize playwire and expose `update_media_controls`

**Files:**
- Modify: `src-tauri/src/media_controls.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `tests/build-contract.test.mjs`

**Interfaces:**
- Produces managed Tauri state: `MediaControlsManager` wrapping `Mutex<Option<playwire::MediaControls>>`.
- Produces Tauri command: `update_media_controls(state: State<MediaControlsManager>, snapshot: MediaPlaybackSnapshot) -> Result<(), String>`.
- Produces setup helper: `install(app: &tauri::App) -> Result<(), String>` that leaves a disabled manager when native initialization fails.

- [ ] **Step 1: Add a failing source contract test**

Extend `tests/build-contract.test.mjs` to assert:

```js
const media = await read('src-tauri/src/media_controls.rs');
const lib = await read('src-tauri/src/lib.rs');
const cargo = await read('src-tauri/Cargo.toml');
assert.match(cargo, /playwire\s*=\s*"1\.0\.0"/);
assert.match(lib, /mod\s+media_controls/);
assert.match(lib, /media_controls::install/);
assert.match(lib, /media_controls::update_media_controls/);
assert.match(media, /MediaControls::new/);
assert.match(media, /emit\("player-command"/);
```

- [ ] **Step 2: Run the source contract test and verify RED**

Run: `node --test tests/build-contract.test.mjs`

Expected: FAIL on missing install/command wiring.

- [ ] **Step 3: Implement native session initialization**

In `install`:

1. Build `PlayerConfig::new("Frxe Desktop")`.
2. Add `.desktop_entry("app.frxe.desktop")` and `.track_id_prefix("/app/frxe/desktop/track")`.
3. On Windows obtain `app.get_webview_window("main")`, call `.hwnd()`, convert the HWND integer to the type accepted by `PlayerConfig::hwnd`, and attach it before `MediaControls::new`.
4. Construct `MediaControls::new(config, move |event| { ... })`.
5. Convert each event with `event_payload` and emit it using `app_handle.emit("player-command", payload)`.
6. For `Raise`, show/focus the `main` window directly and do not route it through the frontend.
7. For `Quit`, call `app_handle.exit(0)` directly.
8. If initialization fails, log a warning and manage `MediaControlsManager(Mutex::new(None))` so app startup still succeeds.

`playwire` documents one cross-platform API covering MPRIS, Windows SMTC, and macOS Now Playing, with `PlayerConfig::hwnd` required on Windows. Its state should be republished each playback tick. The implementation must use the actual 1.0.0 signatures verified during coding rather than introducing compatibility shims.

- [ ] **Step 4: Implement `update_media_controls`**

Lock the manager; if controls are `None`, return `Ok(())`. Otherwise convert the snapshot and call `controls.set_state(&state)`. Convert a `playwire` error to `String` but never panic.

- [ ] **Step 5: Wire Tauri startup and command registration**

In `src-tauri/src/lib.rs`:

```rust
mod media_controls;
```

Call `media_controls::install(app)` inside `.setup` after tray installation, but treat an error as a warning rather than returning it from setup. Add `media_controls::update_media_controls` to `tauri::generate_handler!`.

- [ ] **Step 6: Run JS source contracts and Rust tests/check**

Run:

```text
node --test tests/build-contract.test.mjs
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: all PASS on the current CI host.

- [ ] **Step 7: Commit**

Commit: `feat: initialize cross-platform native media session`

---

### Task 5: Wire Frxe playback state into native controls

**Files:**
- Modify: `web/app.mjs`
- Modify: `tests/media-controls.test.mjs`
- Modify: `tests/runtime-settings.test.mjs` or create `tests/native-media-integration.test.mjs` if keeping the assertions focused is clearer.

**Interfaces:**
- Consumes: Task 1 helpers and Task 2 backend method.
- Produces internal `publishMediaControls()` in `web/app.mjs`.

- [ ] **Step 1: Write failing integration source tests**

Assert that `web/app.mjs`:

```js
assert.match(app, /buildMediaPlaybackSnapshot/);
assert.match(app, /backend\.updateMediaControls/);
assert.match(app, /applyNativeMediaCommand/);
assert.match(app, /player-command/);
```

Also assert playback events publish native state and `timeupdate` calls the publisher, because `playwire` explicitly expects a new state snapshot on every position tick.

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --test tests/native-media-integration.test.mjs`

Expected: FAIL because the helpers are not wired into `app.mjs`.

- [ ] **Step 3: Add `publishMediaControls()`**

Import Task 1 helpers. Build the snapshot from:

```js
buildMediaPlaybackSnapshot({
  track: state.current,
  queue: state.queue,
  queueIndex: state.queueIndex,
  prefs: state.prefs,
  playing: state.playing,
  positionSeconds: audio.currentTime || 0,
  durationSeconds: audio.duration || state.current?.durationSeconds || 0,
})
```

Then call `backend.updateMediaControls(snapshot).catch(() => {})`. Do not surface native-control errors as playback errors or toasts.

- [ ] **Step 4: Publish on all meaningful state changes**

Call `publishMediaControls()` after:

- setting a new current track;
- playback `play` and `pause` events;
- `durationchange`;
- every `timeupdate` tick;
- seek input;
- queue changes caused by next/previous/playlist playback;
- shuffle toggle;
- repeat toggle;
- volume changes in both full player and mini player;
- session restoration once the current track is known;
- clearing/removing the currently playing downloaded track.

- [ ] **Step 5: Route native commands through existing playback functions**

Replace the limited inline `player-command` listener with `applyNativeMediaCommand`. Bind callbacks:

```js
play: () => audio.play(),
pause: () => audio.pause(),
togglePlay,
next: goNext,
previous: goPrevious,
stop: () => { audio.pause(); audio.currentTime = 0; },
seekTo: (seconds) => { audio.currentTime = Math.max(0, Math.min(audio.duration || seconds, seconds)); syncPlayerUi(); publishMediaControls(); },
setVolume: (value) => { state.prefs.volume = value; state.prefs.muted = value === 0; audio.volume = value; audio.muted = state.prefs.muted; savePrefs(); render(); publishMediaControls(); },
setShuffle: (enabled) => { state.prefs.shuffle = enabled; savePrefs(); render(); publishMediaControls(); },
setRepeat: (mode) => { state.prefs.repeat = mode; savePrefs(); render(); publishMediaControls(); },
```

`seek-by` is handled by the helper by calling `seekTo` with the current position plus offset, supplied through context or a dedicated callback.

- [ ] **Step 6: Keep browser Media Session fallback intact**

Do not remove `navigator.mediaSession` metadata or action handlers. Ensure native synchronization is additive.

- [ ] **Step 7: Verify frontend checks and commit**

Run:

```text
node --test tests/media-controls.test.mjs tests/native-media-integration.test.mjs tests/backend.test.mjs
npm run check
```

Expected: PASS.

Commit: `feat: synchronize playback with OS media controls`

---

### Task 6: Bump the development release surface to 1.2.4

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `web/ui.mjs`
- Modify: `src-tauri/src/runtime.rs`
- Modify: `src-tauri/src/search.rs`
- Modify: `platforms/windows/build.bat`
- Modify: `platforms/linux/build.sh`
- Modify: `platforms/macos/build.sh`
- Modify: `.github/workflows/windows-msi.yml`
- Modify: `.github/workflows/linux-packages.yml`
- Modify: `.github/workflows/macos-dmg.yml`
- Modify: `README.md`
- Modify: `docs/REPOSITORY_STRUCTURE.md`
- Modify: `tests/build-contract.test.mjs`

**Interfaces:**
- Produces a consistent 1.2.4 version and artifact naming contract across app metadata, UI, user agents, docs, build scripts, and workflows.

- [ ] **Step 1: Update release-contract expectations to 1.2.4 first**

Change only the relevant version assertions in `tests/build-contract.test.mjs` from `1.2.3` to `1.2.4` and change test titles accordingly.

- [ ] **Step 2: Run release-contract test and verify RED**

Run: `node --test tests/build-contract.test.mjs`

Expected: FAIL because production/config files still contain 1.2.3.

- [ ] **Step 3: Update all release surfaces**

Replace 1.2.3 with 1.2.4 in the listed files, including installer names:

```text
Frxe-Desktop-1.2.4-x64.msi
Frxe-Desktop-1.2.4-amd64.deb
Frxe-Desktop-1.2.4-x86_64.AppImage
Frxe-Desktop-1.2.4-macos-arm64.dmg
Frxe-Desktop-1.2.4-macos-x64.dmg
```

Update About UI to `Frxe Desktop 1.2.4`, native HTTP user agents to `Frxe-Desktop/1.2.4`, README current release/version text, and package-workflow artifact names.

- [ ] **Step 4: Verify and commit**

Run:

```text
node --test tests/build-contract.test.mjs
npm run check
```

Expected: PASS.

Commit: `chore: prepare Frxe Desktop 1.2.4`

---

### Task 7: Full verification and cross-platform PR gate

**Files:**
- No new production files unless verification exposes a defect.
- Create/update PR from `v1.2.4` to `main` after local/CI verification.

**Interfaces:**
- Produces a reviewable `v1.2.4` branch with green CI; does not merge to `main` until the branch is verified.

- [ ] **Step 1: Run the complete frontend contract**

Run: `npm run check`

Expected: PASS with zero test failures and zero syntax errors.

- [ ] **Step 2: Run complete native tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS with zero failures.

- [ ] **Step 3: Run native compile check**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: exit 0.

- [ ] **Step 4: Open/update a PR `v1.2.4` -> `main`**

PR title: `v1.2.4: native OS media controls`

PR body must summarize Windows SMTC, Linux MPRIS, macOS Now Playing, media keys, metadata/artwork, seek/timeline, shuffle/repeat, and the fact that the web audio element remains authoritative.

- [ ] **Step 5: Verify GitHub CI on the exact head SHA**

Require the normal CI workflow to complete successfully. Do not infer success from older runs.

- [ ] **Step 6: Trigger/verify package workflows on the exact head SHA before release merge**

Verify Windows MSI, Linux Packages, and both macOS matrix jobs compile 1.2.4 from the same commit. Any platform-specific compile failure is a blocker and must be fixed on `v1.2.4` before merge.

- [ ] **Step 7: Final branch comparison**

Confirm `v1.2.4` is based on current `main` with no unintended divergence. Only after all exact-head checks are green is the branch eligible to fast-forward/merge into `main`.
