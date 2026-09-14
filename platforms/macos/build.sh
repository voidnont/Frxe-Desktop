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
npm run tauri:build:macos

mkdir -p release-upload

dmg="$(find src-tauri/target/release/bundle/dmg -type f -name '*.dmg' | head -n 1 || true)"
[[ -n "$dmg" && -f "$dmg" ]] || { echo "[ERROR] No DMG produced."; exit 1; }

case "$(uname -m)" in
  arm64) dmg_out="Frxe-Desktop-1.2.2-macos-arm64.dmg" ;;
  x86_64) dmg_out="Frxe-Desktop-1.2.2-macos-x64.dmg" ;;
  *) echo "[ERROR] Unsupported macOS architecture."; exit 1 ;;
esac

cp "$dmg" "release-upload/$dmg_out"
echo "[OK] release-upload/$dmg_out"
