# Frxe Desktop v1.2.2 Self-Update Design

## Goal

Ship Frxe Desktop v1.2.2 for Windows, Linux and macOS with a built-in signed updater in Settings, clean platform-specific repository organization, and a post-release cleanup that leaves the repository focused on the maintained v1.2.2 source and release pipeline.

## Included v1.2.2 changes

- Set the desktop app and every package/release artifact to version `1.2.2`.
- Windows release builds must use the Windows GUI subsystem so launching Frxe does not open a console window.
- Windows child processes used for yt-dlp, FFmpeg and runtime checks must use `CREATE_NO_WINDOW` so playback/search/download activity does not flash command windows.
- Add Ko-fi and GitHub glass-pill links to the bottom of Home while keeping the existing About links.
- Use the canonical GitHub repository `voidnont/Frxe-Desktop` in all app, updater, documentation and release links.
- Add a Settings `Frxe Updates` card with current version, update status, release notes, progress, `Check for updates`, and `Update now` actions.
- Build and release Windows MSI, Linux DEB, Linux AppImage, macOS Apple Silicon DMG, and macOS Intel DMG.

## Repository organization

Keep one shared Frxe application codebase and separate platform-specific build/package files by operating system. Do not duplicate the shared frontend or Rust backend into platform folders.

Target layout:

```text
Frxe-Desktop/
├─ web/                    # shared Frxe UI
├─ src-tauri/              # shared Rust/Tauri backend
├─ platforms/
│  ├─ windows/
│  │  ├─ build.bat
│  │  └─ Windows-only packaging/config helpers
│  ├─ linux/
│  │  ├─ build.sh
│  │  └─ Linux-only packaging/config helpers
│  └─ macos/
│     ├─ build.sh
│     └─ macOS-only packaging/config helpers
├─ tests/                  # shared source/contract tests
├─ tools/                  # genuinely cross-platform release tooling only
├─ .github/workflows/      # CI orchestration
├─ README.md
└─ docs/REPOSITORY_STRUCTURE.md
```

Platform-specific code, scripts and packaging helpers belong under the matching `platforms/<os>/` directory. Shared application behavior stays in `web/` and `src-tauri/`. GitHub Actions may remain under `.github/workflows/`, but each workflow must call the corresponding platform folder rather than root-level per-platform build scripts.

`docs/REPOSITORY_STRUCTURE.md` must document what belongs in each top-level area and where future Windows/Linux/macOS packaging changes should go.

## Updater architecture

Use Tauri v2's official updater plugin. The app config points at `https://github.com/voidnont/Frxe-Desktop/releases/latest/download/latest.json`. The updater public key is embedded in `tauri.conf.json`; the private key never enters the repository.

The frontend calls the updater plugin to check for a newer SemVer. When an update is available it shows the target version and notes. `Update now` downloads and installs with progress events. Windows uses Tauri's passive install mode and exits when the installer starts. macOS and Linux relaunch Frxe after installation completes.

Tauri updater signatures are mandatory. Release builds set `bundle.createUpdaterArtifacts` to `true` and receive the signing key through GitHub Actions environment variables.

## Signing and secrets

The release workflow expects these GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: the full Tauri updater private key content.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password used when generating that key, or an empty value if generated without one.

The matching public key is safe to commit in `src-tauri/tauri.conf.json`.

The GitHub connector available in this chat cannot write repository Actions secrets. The implementation must therefore generate the keypair outside the repository, commit only the public key, and provide the user the private key/password for one-time entry under GitHub repository Settings → Secrets and variables → Actions. The private key must not appear in commits, workflow logs, release assets, test fixtures, or documentation committed to the repository.

## Release pipeline

Each platform workflow builds v1.2.2 normal installers plus updater signature artifacts. A release publisher waits until Windows, Linux, and both macOS architectures have succeeded for the same commit, creates or updates tag/release `v1.2.2`, uploads the five user-facing installers, uploads updater bundles/signatures needed by `latest.json`, then publishes `latest.json` with platform entries for:

- `windows-x86_64`
- `linux-x86_64`
- `darwin-aarch64`
- `darwin-x86_64`

The release pipeline must fail closed when signing secrets are missing; it must not publish unsigned updater metadata.

## Repository-facing text and attribution policy

Project-facing files should describe Frxe Desktop, its supported platforms, build process and ownership/maintenance without references to AI tools, generated-by language, assistant provenance, temporary planning workflows, or development-chat artifacts.

Do not fabricate authorship, alter Git history, or remove legally required license/attribution notices. Existing source code and legitimate project history remain intact.

## Post-release cleanup

Cleanup happens only after all five v1.2.2 installers, signed updater artifacts and `latest.json` have been verified in the `v1.2.2` GitHub Release.

After successful release verification:

- delete the old `v0.1.0` GitHub Release and its assets;
- delete temporary feature/debug branches created for this work after their verified changes are on `main`;
- delete temporary CI/debug workflows that are no longer part of the maintained release pipeline;
- remove obsolete root-level platform build scripts after their maintained replacements exist under `platforms/`;
- replace all remaining `Frxe-Windows` links/naming with `Frxe-Desktop` where they refer to the current repository/product;
- remove `docs/superpowers/` after the implementation is complete and the useful permanent repository documentation has been moved to normal docs such as `docs/REPOSITORY_STRUCTURE.md`;
- remove generated, temporary, duplicate, obsolete or development-only files that are not required to build, test, maintain or release Frxe Desktop;
- keep all maintained v1.2.2 source code, tests, platform folders, required CI workflows, README, permanent docs, legal files and release tooling.

The cleanup must not delete source code needed for future development or rebuilds.

## Testing and verification

Automated tests must cover:

- version `1.2.2` consistency across npm, Cargo, Tauri config, UI copy, platform build scripts and CI artifact names;
- Windows GUI subsystem and no-console child process configuration;
- Home Ko-fi/GitHub links and their external-link handler;
- updater plugin dependency/config/permissions and `voidnont/Frxe-Desktop` GitHub endpoint;
- Settings update card states and actions;
- platform-folder build paths and absence of obsolete root platform build scripts in the final cleaned tree;
- release workflows referencing signing secrets and producing updater metadata;
- absence of current-project `Frxe-Windows` URLs/naming and development-only AI/planning references from final project-facing files.

Before publishing, all frontend checks, native Rust tests, Windows packaging, Linux packaging, and both macOS packaging jobs must succeed. The release is complete only after `v1.2.2` contains all five installers plus a valid `latest.json` and signed updater artifacts. Repository cleanup runs only after that verification and is itself verified before `main` is considered final.