#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

command -v node >/dev/null || { echo "[ERROR] Node.js 20+ is required."; exit 1; }
command -v npm >/dev/null || { echo "[ERROR] npm is required."; exit 1; }
command -v cargo >/dev/null || { echo "[ERROR] Rust/Cargo is required."; exit 1; }

npm install
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build:macos

mkdir -p release-upload

dmg="$(find src-tauri/target/release/bundle/dmg -type f -name '*.dmg' | head -n 1 || true)"
updater="$(find src-tauri/target/release/bundle/macos -type f -name '*.app.tar.gz' | head -n 1 || true)"
sig="$(find src-tauri/target/release/bundle/macos -type f -name '*.app.tar.gz.sig' | head -n 1 || true)"
[[ -n "$dmg" && -f "$dmg" ]] || { echo "[ERROR] No DMG produced."; exit 1; }
[[ -n "$updater" && -f "$updater" ]] || { echo "[ERROR] No macOS updater bundle produced."; exit 1; }
[[ -n "$sig" && -f "$sig" ]] || { echo "[ERROR] No macOS updater signature produced."; exit 1; }

case "$(uname -m)" in
  arm64)
    dmg_out="Frxe-Desktop-1.2.2-macos-arm64.dmg"
    updater_out="Frxe-Desktop-1.2.2-macos-arm64.app.tar.gz"
    sig_out="Frxe-Desktop-1.2.2-macos-arm64.app.tar.gz.sig"
    ;;
  x86_64)
    dmg_out="Frxe-Desktop-1.2.2-macos-x64.dmg"
    updater_out="Frxe-Desktop-1.2.2-macos-x64.app.tar.gz"
    sig_out="Frxe-Desktop-1.2.2-macos-x64.app.tar.gz.sig"
    ;;
  *) echo "[ERROR] Unsupported macOS architecture."; exit 1 ;;
esac

cp "$dmg" "release-upload/$dmg_out"
cp "$updater" "release-upload/$updater_out"
cp "$sig" "release-upload/$sig_out"
echo "[OK] release-upload/$dmg_out"
