#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

command -v node >/dev/null || { echo "[ERROR] Node.js 20+ is required."; exit 1; }
command -v npm >/dev/null || { echo "[ERROR] npm is required."; exit 1; }
command -v cargo >/dev/null || { echo "[ERROR] Rust/Cargo is required."; exit 1; }

npm install
npm run check
npm run icons
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build:linux

mkdir -p release-upload

deb="$(find src-tauri/target/release/bundle/deb -type f -name '*.deb' | head -n 1 || true)"
appimage="$(find src-tauri/target/release/bundle/appimage -type f -name '*.AppImage' | head -n 1 || true)"

[[ -n "$deb" && -f "$deb" ]] || { echo "[ERROR] No DEB produced."; exit 1; }
[[ -n "$appimage" && -f "$appimage" ]] || { echo "[ERROR] No AppImage produced."; exit 1; }

cp "$deb" release-upload/Frxe-Desktop-1.2.2-amd64.deb
cp "$appimage" release-upload/Frxe-Desktop-1.2.2-x86_64.AppImage

echo "[OK] release-upload/Frxe-Desktop-1.2.2-amd64.deb"
echo "[OK] release-upload/Frxe-Desktop-1.2.2-x86_64.AppImage"
