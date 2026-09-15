# Frxe Desktop v1.2.4 — Native OS Media Controls Design

Date: 2026-09-15
Status: Approved design
Branch: `v1.2.4`

## Goal

Make Frxe Desktop behave like a first-class native music player on Windows, Linux, and macOS by integrating system media controls with the existing shared playback engine.

The v1.2.4 feature must provide:

- hardware/media-key play, pause, next, and previous controls;
- Windows System Media Transport Controls (SMTC) / Now Playing integration;
- Linux MPRIS integration;
- macOS Now Playing Info Center and Remote Command Center integration;
- title, artist, album, artwork, duration, current position, and playback-state publication;
- OS seek controls where supported;
- shuffle and repeat state/capabilities where supported;
- a single playback source of truth so OS controls and the Frxe UI never become separate competing players.

## Current architecture

Frxe currently uses the shared web audio element as the playback engine. `web/app.mjs` owns track selection, queue state, play/pause, next/previous, seeking, shuffle, repeat, session restoration, and browser Media Session support.

The Tauri backend already exposes an event path from native code back into the frontend: native code emits `player-command`, and the frontend maps those commands to the existing playback functions.

This design keeps that architecture intact.

## Chosen approach

Use a dedicated Rust `media_controls` subsystem backed by the `playwire` crate.

Reasons:

- one API surface for Windows SMTC, Linux MPRIS, and macOS Now Playing / Remote Command Center;
- supports the full integration scope selected for v1.2.4, including metadata, artwork, playback state, position, seeking, repeat, shuffle, and capabilities;
- avoids maintaining three separate platform integrations while still using native OS facilities;
- keeps platform-specific details behind the Rust module boundary.

Alternatives rejected:

1. Three custom native implementations: highest control, but much more maintenance and duplicated platform logic.
2. Browser Media Session only: too limited and unreliable for desktop-native behavior.
3. `souvlaki`: viable, but less aligned with the requested full cross-platform capability set and requires additional platform plumbing.

## Architecture

### 1. Frontend remains the playback authority

The HTML audio element and existing playback functions remain authoritative for:

- current track;
- queue and queue index;
- playing/paused state;
- playback position and duration;
- next/previous behavior;
- shuffle;
- repeat;
- seek behavior.

No Rust-side audio playback engine will be introduced in v1.2.4.

### 2. New Rust `media_controls` subsystem

Add `src-tauri/src/media_controls.rs` with one responsibility: translate between Frxe playback snapshots and native OS media-control APIs.

The module owns:

- media-control session initialization;
- native capability registration;
- metadata publication;
- artwork publication;
- playback-state publication;
- position/duration publication;
- shuffle/repeat publication when supported;
- receiving native media commands;
- emitting normalized Tauri events back to the frontend.

The module must not own queue logic or mutate Frxe playback state directly.

### 3. Native playback snapshot

The frontend sends a normalized snapshot through a Tauri command whenever meaningful playback state changes.

Proposed shape:

```text
MediaPlaybackSnapshot
- track_id: optional string
- title: optional string
- artist: optional string
- album: optional string
- artwork: optional string
- duration_seconds: optional float
- position_seconds: optional float
- playing: bool
- can_play: bool
- can_pause: bool
- can_next: bool
- can_previous: bool
- can_seek: bool
- shuffle: bool
- repeat: off | queue | track
```

Artwork may be a network URL, data URL, or local asset URL. If the native backend cannot consume a supplied artwork source safely, it must omit artwork rather than fail the entire snapshot update.

### 4. Frontend-to-native synchronization

Add a backend wrapper such as `backend.updateMediaControls(snapshot)` that invokes a Tauri command owned by the new Rust module.

Snapshots are published:

- when the active track changes;
- when playback starts or pauses;
- after a seek;
- when duration becomes known or changes;
- when shuffle changes;
- when repeat changes;
- when queue capabilities change;
- periodically during active playback at a conservative interval rather than on every `timeupdate` event.

The periodic update should be throttled to avoid unnecessary IPC traffic. The native layer may extrapolate position between updates where supported.

When no track is active, Frxe sends a cleared/inactive snapshot and the OS media session removes stale metadata.

### 5. Native-to-frontend commands

The Rust subsystem emits normalized `player-command` events.

Supported command payloads:

```text
play
pause
toggle-play
next
previous
stop
seek-to { position_seconds }
seek-by { offset_seconds }
set-shuffle { enabled }
set-repeat { mode }
```

The frontend listener maps these commands to the existing Frxe functions and state mutations.

Examples:

- `play` -> `audio.play()`
- `pause` -> `audio.pause()`
- `toggle-play` -> existing `togglePlay()`
- `next` -> existing `goNext()`
- `previous` -> existing `goPrevious()`
- `stop` -> pause and set current position to zero
- `seek-to` -> clamp and set `audio.currentTime`
- `seek-by` -> clamp relative movement within the current duration
- `set-shuffle` -> update `state.prefs.shuffle`, save preferences, render, publish a fresh snapshot
- `set-repeat` -> update `state.prefs.repeat`, save preferences, render, publish a fresh snapshot

Unknown commands are ignored safely.

## Platform behavior

### Windows

Use Windows SMTC / Now Playing through the native media-control layer.

Requirements:

- expose Frxe Desktop as the active media session;
- show current song title, artist, album, and artwork;
- expose play/pause, previous, next, and seek where supported;
- publish duration and current timeline position;
- respond to hardware media keys and Windows media flyout controls;
- preserve existing tray and window behavior.

The Tauri main window handle is supplied to the native media-control backend when Windows requires it.

### Linux

Expose a compliant MPRIS v2 player.

Requirements:

- desktop identity: Frxe Desktop;
- metadata and artwork;
- play/pause, previous, next;
- position and seeking;
- playback status;
- shuffle and loop status where supported;
- volume only if it can be represented without creating a second source of truth. Volume remains owned by the frontend audio element.

### macOS

Use Now Playing Info Center and Remote Command Center.

Requirements:

- publish current title, artist, album, artwork, duration, and elapsed position;
- support play, pause, toggle, previous, next, and seek where available;
- respond to media keys and compatible headset/media-button commands;
- clear stale Now Playing information when playback is removed.

## Browser Media Session fallback

Keep the existing `navigator.mediaSession` implementation.

It remains useful as a fallback and does not replace the new native subsystem. Native synchronization is the preferred desktop path; browser Media Session should continue to fail silently when unsupported.

## Backend API

Add one primary Tauri command:

```text
update_media_controls(snapshot)
```

Initialization happens during Tauri setup, alongside tray installation.

The command should be resilient: unsupported optional capabilities or artwork failures must not crash the application. Fatal initialization failure should disable native media controls while leaving normal Frxe playback functional.

## Error handling

Native media controls are an enhancement, not a playback dependency.

Rules:

- Frxe audio playback must continue if native media-control initialization fails.
- Optional metadata/artwork failures must be swallowed or logged and must not interrupt playback.
- Invalid seek requests are clamped to valid playback bounds.
- Commands received before a track exists are ignored.
- Native session teardown must not panic during application shutdown.
- Platform-specific unsupported features degrade gracefully rather than blocking startup.

## Testing strategy

### Rust unit/contract tests

Test pure mapping logic separately from OS APIs:

- Frxe repeat mode -> native repeat mode;
- native command -> normalized `player-command` payload;
- capability calculation;
- cleared snapshot behavior;
- position and duration clamping;
- metadata conversion with missing optional fields.

OS API wrappers should be kept thin enough that most behavior can be tested without requiring a desktop media service in CI.

### Frontend tests

Add tests covering:

- snapshot construction from Frxe state;
- snapshot publication on track change;
- play/pause synchronization;
- seek command handling;
- next/previous command handling;
- shuffle/repeat command handling;
- clearing native metadata when the active track disappears;
- throttled position synchronization rather than IPC on every `timeupdate` event.

### CI

Existing CI remains mandatory:

- `npm run check`
- icon generation
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`

The implementation must compile on all release platforms through the existing Windows, Linux, and macOS package workflows before v1.2.4 can be merged to `main`.

## Scope boundaries

Included in v1.2.4:

- native media metadata;
- media keys;
- OS play/pause/next/previous;
- seek and timeline integration;
- shuffle/repeat integration where supported;
- artwork;
- Windows SMTC;
- Linux MPRIS;
- macOS Now Playing / Remote Command Center.

Not included:

- replacing the web audio element with a Rust audio engine;
- global custom hotkey configuration unrelated to standard media keys;
- audio-device routing;
- equalizer/DSP work;
- mobile integrations;
- in-app updater changes.

## Success criteria

v1.2.4 is ready when:

1. Standard media keys control Frxe on Windows, Linux, and macOS.
2. Each supported OS shows accurate current-track metadata and artwork.
3. OS play/pause/next/previous commands affect the same playback state as the Frxe UI.
4. OS seek controls update the Frxe audio element and UI.
5. Frxe state changes are reflected back into the OS media session.
6. Native media-control failure never prevents normal audio playback.
7. All automated checks pass.
8. Platform package workflows compile successfully for Windows, Linux, Apple Silicon macOS, and Intel macOS.
