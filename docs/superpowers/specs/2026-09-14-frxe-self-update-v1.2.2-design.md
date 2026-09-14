# Frxe Desktop v1.2.2 Self-Update Design

## Goal

Ship Frxe Desktop v1.2.2 for Windows, Linux and macOS with a built-in signed updater in Settings. The updater checks the latest GitHub Release, downloads the correct signed update artifact for the running platform, installs it, and restarts or relaunches Frxe as supported by the operating system.

## Included v1.2.2 changes

- Set the desktop app and every package/release artifact to version `1.2.2`.
- Windows release builds must use the Windows GUI subsystem so launching Frxe does not open a console window.
- Windows child processes used for yt-dlp, FFmpeg and runtime checks must use `CREATE_NO_WINDOW` so playback/search/download activity does not flash command windows.
- Add Ko-fi and GitHub glass-pill links to the bottom of Home while keeping the existing About links.
- Add a Settings `Frxe Updates` card with current version, update status, release notes, progress, `Check for updates`, and `Update now` actions.
- Build and release Windows MSI, Linux DEB, Linux AppImage, macOS Apple Silicon DMG, and macOS Intel DMG.

## Updater architecture

Use Tauri v2's official updater plugin. The app config points at `https://github.com/voidnont/Frxe-Windows/releases/latest/download/latest.json`. The updater public key is embedded in `tauri.conf.json`; the private key never enters the repository.

The frontend calls the updater plugin to check for a newer SemVer. When an update is available it shows the target version and notes. `Update now` downloads and installs with progress events. Windows uses Tauri's passive install mode and exits when the installer starts. macOS and Linux relaunch Frxe after installation completes.

Tauri updater signatures are mandatory. Release builds set `bundle.createUpdaterArtifacts` to `true` and receive the signing key through GitHub Actions environment variables.

## Signing and secrets

The release workflow expects these GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: the full Tauri updater private key content.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password used when generating that key, or an empty value if generated without one.

The matching public key is safe to commit in `src-tauri/tauri.conf.json`.

The GitHub connector available in this chat cannot write repository Actions secrets. The implementation must therefore generate the keypair outside the repository, commit only the public key, and provide the user the private key/password for one-time entry under GitHub repository Settings → Secrets and variables → Actions. The private key must not appear in commits, workflow logs, release assets, or test fixtures.

## Release pipeline

Each platform workflow builds v1.2.2 normal installers plus updater signature artifacts. A release publisher waits until Windows, Linux, and both macOS architectures have succeeded for the same commit, creates or updates tag/release `v1.2.2`, uploads the five user-facing installers, uploads updater bundles/signatures needed by `latest.json`, then publishes `latest.json` with platform entries for:

- `windows-x86_64`
- `linux-x86_64`
- `darwin-aarch64`
- `darwin-x86_64`

The release pipeline must fail closed when signing secrets are missing; it must not publish unsigned updater metadata.

## Testing and verification

Automated tests must cover:

- version `1.2.2` consistency across npm, Cargo, Tauri config, UI copy, local build scripts and CI artifact names;
- Windows GUI subsystem and no-console child process configuration;
- Home Ko-fi/GitHub links and their external-link handler;
- updater plugin dependency/config/permissions and GitHub endpoint;
- Settings update card states and actions;
- release workflows referencing signing secrets and producing updater metadata.

Before publishing, all frontend checks, native Rust tests, Windows packaging, Linux packaging, and both macOS packaging jobs must succeed. The release is complete only after `v1.2.2` contains all five installers plus a valid `latest.json` and signed updater artifacts.