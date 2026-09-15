# Repository structure

Frxe Desktop uses one shared application codebase for Windows, Linux and macOS.

```text
Frxe-Desktop/
├── web/                    # shared desktop UI and frontend logic
├── src-tauri/              # shared Rust/Tauri backend and native app config
├── platforms/
│   ├── windows/            # Windows-only local build/development entry points
│   ├── linux/              # Linux-only local build/package entry points
│   └── macos/              # macOS-only local build/package entry points
├── tests/                  # shared automated source and release contracts
├── .github/workflows/      # CI orchestration for each operating system
└── README.md
```

## Shared source

`web/` is the shared Frxe Desktop interface. `src-tauri/` is the shared native backend. Features that work on all desktop operating systems belong in these shared folders so fixes do not drift between copies.

Do not duplicate `web/` or `src-tauri/` inside a platform folder.

## Platform folders

`platforms/windows/` contains Windows-only build and development files. Its local entry points are `platforms/windows/build.bat` and `platforms/windows/dev.bat`.

`platforms/linux/` contains Linux-only build and packaging files. Its primary local entry point is `platforms/linux/build.sh`.

`platforms/macos/` contains macOS-only build and packaging files. Its primary local entry point is `platforms/macos/build.sh`.

Platform-specific native behavior should stay behind Rust target configuration in `src-tauri/` when it is part of the application itself. Platform folders are for build/package entry points and operating-system-specific packaging support, not copies of application source.

## CI and releases

The workflows under `.github/workflows/` call the matching platform build entry point. A release is publishable only when Windows, Linux, Apple Silicon macOS and Intel macOS packages come from the same source commit and all required builds pass.

The five user-facing packages are:

- `Frxe-Desktop-1.2.3-x64.msi`
- `Frxe-Desktop-1.2.3-amd64.deb`
- `Frxe-Desktop-1.2.3-x86_64.AppImage`
- `Frxe-Desktop-1.2.3-macos-arm64.dmg`
- `Frxe-Desktop-1.2.3-macos-x64.dmg`
