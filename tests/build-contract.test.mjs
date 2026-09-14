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

test('Home exposes Ko-fi and GitHub support pills through the external-link handler', async () => {
  const [ui, app] = await Promise.all([
    read('web/ui.mjs'),
    read('web/app.mjs'),
  ]);
  assert.match(ui, /home-support/);
  assert.match(ui, /https:\/\/ko-fi\.com\/voidnont/);
  assert.match(ui, /https:\/\/github\.com\/voidnont\/frxe-windows/i);
  assert.match(ui, /data-external=/);
  assert.match(app, /closest\('\[data-external\]'\)/);
});

test('release version and installer names are consistently 1.2.2', async () => {
  const [pkg, cargo, config, winScript, linuxScript, macScript, windowsWorkflow, linuxWorkflow, macWorkflow, releaseWorkflow, ui, runtime] = await Promise.all([
    read('package.json'),
    read('src-tauri/Cargo.toml'),
    read('src-tauri/tauri.conf.json'),
    read('build.bat'),
    read('build-linux.sh'),
    read('build-macos.sh'),
    read('.github/workflows/windows-msi.yml'),
    read('.github/workflows/linux-packages.yml'),
    read('.github/workflows/macos-dmg.yml'),
    read('.github/workflows/release-installers.yml'),
    read('web/ui.mjs'),
    read('src-tauri/src/runtime.rs'),
  ]);
  assert.match(pkg, /"version"\s*:\s*"1\.2\.2"/);
  assert.match(cargo, /^version\s*=\s*"1\.2\.2"/m);
  assert.match(config, /"version"\s*:\s*"1\.2\.2"/);
  assert.match(ui, /Frxe Desktop 1\.2\.2/);
  assert.match(runtime, /Frxe-Desktop\/1\.2\.2/);

  const packaging = [winScript, linuxScript, macScript, windowsWorkflow, linuxWorkflow, macWorkflow, releaseWorkflow].join('\n');
  assert.match(packaging, /Frxe-Desktop-1\.2\.2-x64\.msi/);
  assert.match(packaging, /Frxe-Desktop-1\.2\.2-amd64\.deb/);
  assert.match(packaging, /Frxe-Desktop-1\.2\.2-x86_64\.AppImage/);
  assert.match(packaging, /Frxe-Desktop-1\.2\.2-macos-arm64\.dmg/);
  assert.match(packaging, /Frxe-Desktop-1\.2\.2-macos-x64\.dmg/);
  assert.match(releaseWorkflow, /v1\.2\.2/);
  assert.match(releaseWorkflow, /Frxe Desktop 1\.2\.2/);
  assert.doesNotMatch(packaging, /Frxe-Desktop-0\.1\.0|v0\.1\.0/);
});

test('CI publishes the exact Windows Linux and macOS 1.2.2 package names', async () => {
  const [windowsWorkflow, linuxWorkflow, macWorkflow] = await Promise.all([
    read('.github/workflows/windows-msi.yml'),
    read('.github/workflows/linux-packages.yml'),
    read('.github/workflows/macos-dmg.yml'),
  ]);
  assert.match(windowsWorkflow, /Frxe-Desktop-1\.2\.2-Windows/);
  assert.match(windowsWorkflow, /Frxe-Desktop-1\.2\.2-x64\.msi/);
  assert.match(linuxWorkflow, /Frxe-Desktop-1\.2\.2-Linux/);
  assert.match(linuxWorkflow, /Frxe-Desktop-1\.2\.2-amd64\.deb/);
  assert.match(linuxWorkflow, /Frxe-Desktop-1\.2\.2-x86_64\.AppImage/);
  assert.match(macWorkflow, /Frxe-Desktop-1\.2\.2-macOS-Apple-Silicon/);
  assert.match(macWorkflow, /Frxe-Desktop-1\.2\.2-macOS-Intel/);
  assert.match(macWorkflow, /Frxe-Desktop-1\.2\.2-macos-arm64\.dmg/);
  assert.match(macWorkflow, /Frxe-Desktop-1\.2\.2-macos-x64\.dmg/);
});
