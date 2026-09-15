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

Use a dedicated Rust `media_controls` subsystem backed by `playwire` 1.0.x.

Reasons:

- one API surface for Windows SMTC, Linux MPRIS, and macOS Now Playing / Remote Command Center;
- supports the full integration scope selected for v1.2.4, including metadata, artwork, playback state, position, seeking, repeat, shuffle, volume on MPRIS, and dynamic next/previous/seek capabilities;
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
- volume/mute state;
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
- volume publication where the platform supports it;
- shuffle/repeat publication;
- receiving native media commands;
- emitting normalized Tauri events back to the frontend.

The module must not own queue logic or mutate Frxe playback state directly.

### 3. Native playback snapshot

The frontend sends a normalized snapshot through a Tauri command whenever playback state changes.

Proposed shape:

```text
MediaPlaybackSnapshot
- track_id: optional string
- title: optional string
- artist: optional string
- album: optional string
- artwork_url: optional string
- source_url: optional string
- duration_seconds: optional float
- position_seconds: float
- playing: bool
- volume: float (0.0..1.0)
- shuffle: bool
- repeat: off | queue | track
- can_next: bool
- can_previous: bool
- can_seek: bool
```

The Rust mapper converts this to `playwire::PlaybackState`, `playwire::Track`, `playwire::Repeat`, and `playwire::Capabilities`.

Artwork supplied to `playwire` must be an `http://`, `https://`, or `file://` URL. Local filesystem artwork is normalized to `file://` before publication. Unsupported artwork forms are omitted rather than causing the snapshot update to fail.

Track ids must be stable and unique per track because the native layer and MPRIS clients use them to distinguish metadata changes.

### 4. Frontend-to-native synchronization

Add a backend wrapper such as `backend.updateMediaControls(snapshot)` that invokes a Tauri command owned by the new Rust module.

Snapshots are published:

- when the active track changes;
- when playback starts or pauses;
- on normal playback position ticks (`timeupdate`);
- after an explicit seek;
- when duration becomes known or changes;
- when volume/mute changes;
- when shuffle changes;
- when repeat changes;
- when queue capabilities change.

`playwire` performs its own state diffing, so publishing each playback tick is intentional and keeps OS timeline/scrubber state accurate without rebuilding unchanged metadata.

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
set-volume { volume }
set-shuffle { enabled }
set-repeat { mode }
raise
quit
open-uri { uri }
```

The frontend listener maps playback commands to existing Frxe functions and state mutations.

Examples:

- `play` -> `audio.play()`
- `pause` -> `audio.pause()`
- `toggle-play` -> existing `togglePlay()`
- `next` -> existing `goNext()`
- `previous` -> existing `goPrevious()`
- `stop` -> pause and set current position to zero
- `seek-to` -> clamp and set `audio.currentTime`
- `seek-by` -> clamp relative movement within the current duration
- `set-volume` -> clamp to 0.0..1.0, update `state.prefs.volume`/`muted`, update the audio element, save preferences, and publish a fresh snapshot
- `set-shuffle` -> update `state.prefs.shuffle`, save preferences, render, publish a fresh snapshot
- `set-repeat` -> update `state.prefs.repeat`, save preferences, render, publish a fresh snapshot
- `raise` -> show/focus the main Frxe window when supported
- `quit` -> use the existing native application exit path when supported
- `open-uri` -> ignore unless the URI is a supported Frxe media target; v1.2.4 does not add arbitrary URI playback

Unknown commands are ignored safely. Platform-specific commands that are not useful to Frxe may be ignored without failing the media session.

## Platform behavior

### Windows

Use Windows SMTC / Now Playing through the native media-control layer.

Requirements:

- expose Frxe Desktop as the active media session;
- show current song title, artist, album, and artwork;
- expose play/pause, previous, next, and seek where supported;
- publish duration and current timeline position;
- respond to hardware media keys and Windows media flyout controls;
- publish shuffle and repeat state;
- preserve existing tray and window behavior.

`playwire::PlayerConfig::hwnd` is required on Windows. The HWND is obtained from the Tauri main window during setup and supplied only to the Windows backend.

### Linux

Expose a compliant MPRIS v2 player.

Requirements:

- desktop identity: Frxe Desktop;
- metadata and artwork;
- play/pause, previous, next;
- position and seeking;
- playback status;
- shuffle and loop status;
- MPRIS volume synchronized with Frxe's existing volume preference/audio element;
- Raise/Quit support mapped to existing application behavior where practical.

The Linux desktop entry identifier supplied to `playwire` must match Frxe's packaged desktop identity so GNOME/KDE can resolve the correct app icon.

### macOS

Use Now Playing Info Center and Remote Command Center.

Requirements:

- publish current title, artist, album, artwork, duration, and elapsed position;
- support play, pause, toggle, previous, next, and seek where available;
- publish shuffle and repeat state;
- respond to media keys and compatible headset/media-button commands;
- clear stale Now Playing information when playback is removed.

The existing Tauri application provides the running macOS application context required by the native Now Playing integration.

## Browser Media Session fallback

Keep the existing `navigator.mediaSession` implementation.

It remains useful as a fallback and does not replace the new native subsystem. Native synchronization is the preferred desktop path; browser Media Session should continue to fail silently when unsupported.

## Backend API

Add one primary Tauri command:

```text
update_media_controls(snapshot)
```

Initialization happens during Tauri setup, alongside tray installation.

The native manager is stored as Tauri managed state so update commands can safely mutate the `MediaControls` handle from the application lifecycle.

The command is resilient: unsupported optional capabilities or artwork failures must not crash the application. Fatal initialization failure disables native media controls while leaving normal Frxe playback functional.

## Error handling

Native media controls are an enhancement, not a playback dependency.

Rules:

- Frxe audio playback must continue if native media-control initialization fails.
- Optional metadata/artwork failures must be logged or omitted and must not interrupt playback.
- Invalid positions, durations, or volume values are clamped before publication/application.
- Commands received before a track exists are ignored.
- Native session teardown must not panic during application shutdown.
- Platform-specific unsupported features degrade gracefully rather than blocking startup.
- OS callback threads must hand work off to Tauri/frontend events and must not perform blocking playback work directly.

## Testing strategy

### Rust unit/contract tests

Test pure mapping logic separately from OS APIs:

- Frxe repeat mode -> `playwire::Repeat`;
- native `playwire::Event` -> normalized `player-command` payload;
- next/previous/seek capability calculation/mapping;
- cleared snapshot behavior;
- position/duration/volume clamping;
- metadata conversion with missing optional fields;
- stable track id mapping;
- invalid artwork omission.

OS API wrappers should be kept thin enough that most behavior can be tested without requiring a desktop media service in CI.

### Frontend tests

Add tests covering:

- snapshot construction from Frxe state;
- snapshot publication on track change;
- play/pause synchronization;
- position publication from playback ticks;
- seek command handling;
- next/previous command handling;
- volume command handling;
- shuffle/repeat command handling;
- clearing native metadata when the active track disappears.

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
- Linux MPRIS volume synchronization;
- shuffle/repeat integration;
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
- in-app updater changes;
- arbitrary external URI playback.

## Success criteria

v1.2.4 is ready when:

1. Standard media keys control Frxe on Windows, Linux, and macOS.
2. Each supported OS shows accurate current-track metadata and artwork.
3. OS play/pause/next/previous commands affect the same playback state as the Frxe UI.
4. OS seek controls update the Frxe audio element and UI.
5. Frxe state changes are reflected back into the OS media session, including timeline, shuffle, repeat, and MPRIS volume where supported.
6. Native media-control failure never prevents normal audio playback.
7. All automated checks pass.
8. Platform package workflows compile successfully for Windows, Linux, Apple Silicon macOS, and Intel macOS.
