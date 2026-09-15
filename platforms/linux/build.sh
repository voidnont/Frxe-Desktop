#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

command -v cargo >/dev/null || { echo "Cargo/Rust is required." >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is required." >&2; exit 1; }

npm install
npx tauri icon web/frxe-icon.svg --output src-tauri/icons
npm run check
npx tauri build --bundles deb,appimage

DEB_SOURCE="src-tauri/target/release/bundle/deb/Frxe Desktop_1.2.4_amd64.deb"
APPIMAGE_SOURCE="src-tauri/target/release/bundle/appimage/Frxe Desktop_1.2.4_amd64.AppImage"

[[ -f "$DEB_SOURCE" ]] || { echo "Built DEB not found: $DEB_SOURCE" >&2; exit 1; }
[[ -f "$APPIMAGE_SOURCE" ]] || { echo "Built AppImage not found: $APPIMAGE_SOURCE" >&2; exit 1; }

mkdir -p release-upload
cp "$DEB_SOURCE" "release-upload/Frxe-Desktop-1.2.4-amd64.deb"
cp "$APPIMAGE_SOURCE" "release-upload/Frxe-Desktop-1.2.4-x86_64.AppImage"

echo "Built:"
echo "  release-upload/Frxe-Desktop-1.2.4-amd64.deb"
echo "  release-upload/Frxe-Desktop-1.2.4-x86_64.AppImage"
