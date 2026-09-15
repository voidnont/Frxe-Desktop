#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

command -v cargo >/dev/null || { echo "Cargo/Rust is required." >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is required." >&2; exit 1; }

npm install
npx tauri icon web/frxe-icon.svg --output src-tauri/icons
npm run check
npx tauri build --bundles dmg

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) TARGET_ARCH="aarch64"; RELEASE_ARCH="arm64" ;;
  x86_64) TARGET_ARCH="x64"; RELEASE_ARCH="x64" ;;
  *) echo "Unsupported macOS architecture: $ARCH" >&2; exit 1 ;;
esac

DMG_SOURCE="src-tauri/target/release/bundle/dmg/Frxe Desktop_1.2.4_${TARGET_ARCH}.dmg"
[[ -f "$DMG_SOURCE" ]] || { echo "Built DMG not found: $DMG_SOURCE" >&2; exit 1; }

mkdir -p release-upload
OUTPUT="release-upload/Frxe-Desktop-1.2.4-macos-${RELEASE_ARCH}.dmg"
cp "$DMG_SOURCE" "$OUTPUT"

echo "Built $OUTPUT"
