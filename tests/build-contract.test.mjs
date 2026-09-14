import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');

test('desktop builds are self-contained for all platforms', async () => {
  const [pkg, win, linux, mac] = await Promise.all([
    read('package.json'),
    read('build.bat'),
    read('build-linux.sh'),
    read('build-macos.sh'),
  ]);
  const joined = [pkg, win, linux, mac].join('\n');
  assert.doesNotMatch(joined, /backend:prepare|prepare-backend|1367264568/);
  assert.match(pkg, /tauri:build:windows/);
  assert.match(pkg, /tauri:build:linux/);
  assert.match(pkg, /tauri:build:macos/);
  assert.match(pkg, /tauri icon web\/frxe-icon\.svg/);
});

test('Tauri asset protocol config has the matching Rust feature', async () => {
  const [config, cargo] = await Promise.all([
    read('src-tauri/tauri.conf.json'),
    read('src-tauri/Cargo.toml'),
  ]);
  assert.match(config, /"assetProtocol"\s*:\s*\{/);
  assert.match(config, /"enable"\s*:\s*true/);
  assert.match(cargo, /features\s*=\s*\[[^\]]*"protocol-asset"[^\]]*\]/s);
});

test('Windows release never opens console windows', async () => {
  const [mainRs, runtimeRs, searchRs, downloadsRs] = await Promise.all([
    read('src-tauri/src/main.rs'),
    read('src-tauri/src/runtime.rs'),
    read('src-tauri/src/search.rs'),
    read('src-tauri/src/downloads.rs'),
  ]);

  assert.match(mainRs, /cfg_attr\(not\(debug_assertions\),\s*windows_subsystem\s*=\s*"windows"\)/);
  assert.match(runtimeRs, /CREATE_NO_WINDOW/);
  assert.match(runtimeRs, /silent_command/);
  assert.doesNotMatch(searchRs, /Command::new/);
  assert.doesNotMatch(downloadsRs, /Command::new/);
});

test('CI publishes the exact Windows Linux and macOS package names', async () => {
  const [windowsWorkflow, linuxWorkflow, macWorkflow] = await Promise.all([
    read('.github/workflows/windows-msi.yml'),
    read('.github/workflows/linux-packages.yml'),
    read('.github/workflows/macos-dmg.yml'),
  ]);
  assert.match(windowsWorkflow, /Frxe-Desktop-0\.1\.0-Windows/);
  assert.match(windowsWorkflow, /Frxe-Desktop-0\.1\.0-x64\.msi/);
  assert.match(linuxWorkflow, /Frxe-Desktop-0\.1\.0-Linux/);
  assert.match(linuxWorkflow, /Frxe-Desktop-0\.1\.0-amd64\.deb/);
  assert.match(linuxWorkflow, /Frxe-Desktop-0\.1\.0-x86_64\.AppImage/);
  assert.match(macWorkflow, /Frxe-Desktop-0\.1\.0-macOS-Apple-Silicon/);
  assert.match(macWorkflow, /Frxe-Desktop-0\.1\.0-macOS-Intel/);
  assert.match(macWorkflow, /Frxe-Desktop-0\.1\.0-macos-arm64\.dmg/);
  assert.match(macWorkflow, /Frxe-Desktop-0\.1\.0-macos-x64\.dmg/);
});
