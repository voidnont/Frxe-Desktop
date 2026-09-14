import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');
const exists = async (path) => access(join(root, path)).then(() => true, () => false);

test('desktop builds are self-contained and platform entry points are separated', async () => {
  for (const path of [
    'platforms/windows/build.bat',
    'platforms/windows/dev.bat',
    'platforms/linux/build.sh',
    'platforms/macos/build.sh',
    'docs/REPOSITORY_STRUCTURE.md',
  ]) {
    assert.equal(await exists(path), true, `${path} must exist`);
  }
  for (const path of ['build.bat', 'dev.bat', 'build-linux.sh', 'build-macos.sh']) {
    assert.equal(await exists(path), false, `${path} must move under platforms/`);
  }

  const [pkg, win, linux, mac, structure, windowsWorkflow, linuxWorkflow, macWorkflow] = await Promise.all([
    read('package.json'),
    read('platforms/windows/build.bat'),
    read('platforms/linux/build.sh'),
    read('platforms/macos/build.sh'),
    read('docs/REPOSITORY_STRUCTURE.md'),
    read('.github/workflows/windows-msi.yml'),
    read('.github/workflows/linux-packages.yml'),
    read('.github/workflows/macos-dmg.yml'),
  ]);
  const joined = [pkg, win, linux, mac].join('\n');
  assert.doesNotMatch(joined, /backend:prepare|prepare-backend|1367264568/);
  assert.match(pkg, /tauri:build:windows/);
  assert.match(pkg, /tauri:build:linux/);
  assert.match(pkg, /tauri:build:macos/);
  assert.match(pkg, /tauri icon web\/frxe-icon\.svg/);
  assert.match(windowsWorkflow, /platforms[\\/]windows[\\/]build\.bat/i);
  assert.match(linuxWorkflow, /platforms\/linux\/build\.sh/);
  assert.match(macWorkflow, /platforms\/macos\/build\.sh/);
  assert.match(structure, /web\/.*shared/si);
  assert.match(structure, /src-tauri\/.*shared/si);
  assert.match(structure, /platforms\/windows\//);
  assert.match(structure, /platforms\/linux\//);
  assert.match(structure, /platforms\/macos\//);
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
  assert.match(runtimeRs, /creation_flags\(0x08000000\)/);
  assert.match(runtimeRs, /pub\s+fn\s+silent_command/);
  assert.doesNotMatch(searchRs, /Command::new/);
  assert.doesNotMatch(downloadsRs, /Command::new/);
});

test('Home and About use canonical Frxe Desktop support links', async () => {
  const [ui, app] = await Promise.all([
    read('web/ui.mjs'),
    read('web/app.mjs'),
  ]);
  assert.match(ui, /home-support/);
  assert.match(ui, /https:\/\/ko-fi\.com\/voidnont/);
  assert.match(ui, /https:\/\/github\.com\/voidnont\/Frxe-Desktop/);
  assert.doesNotMatch(ui, /github\.com\/voidnont\/frxe-windows/i);
  assert.match(ui, /data-external=/);
  assert.match(app, /closest\('\[data-external\]'\)/);
  assert.doesNotMatch(app, /github\.com\/voidnont\/frxe-windows/i);
});

test('release version and installer names are consistently 1.2.2', async () => {
  const [pkg, cargo, config, winScript, linuxScript, macScript, windowsWorkflow, linuxWorkflow, macWorkflow, releaseWorkflow, ui, runtime, search] = await Promise.all([
    read('package.json'),
    read('src-tauri/Cargo.toml'),
    read('src-tauri/tauri.conf.json'),
    read('platforms/windows/build.bat'),
    read('platforms/linux/build.sh'),
    read('platforms/macos/build.sh'),
    read('.github/workflows/windows-msi.yml'),
    read('.github/workflows/linux-packages.yml'),
    read('.github/workflows/macos-dmg.yml'),
    read('.github/workflows/release-installers.yml'),
    read('web/ui.mjs'),
    read('src-tauri/src/runtime.rs'),
    read('src-tauri/src/search.rs'),
  ]);
  assert.match(pkg, /"version"\s*:\s*"1\.2\.2"/);
  assert.match(cargo, /^version\s*=\s*"1\.2\.2"/m);
  assert.match(config, /"version"\s*:\s*"1\.2\.2"/);
  assert.match(ui, /Frxe Desktop 1\.2\.2/);
  assert.match(runtime, /Frxe-Desktop\/1\.2\.2/);
  assert.match(search, /Frxe-Desktop\/1\.2\.2/);

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

test('current project links use voidnont/Frxe-Desktop', async () => {
  const [config, ui, readme, releaseWorkflow] = await Promise.all([
    read('src-tauri/tauri.conf.json'),
    read('web/ui.mjs'),
    read('README.md'),
    read('.github/workflows/release-installers.yml'),
  ]);
  const joined = [config, ui, readme, releaseWorkflow].join('\n');
  assert.match(joined, /github\.com\/voidnont\/Frxe-Desktop/);
  assert.doesNotMatch(joined, /github\.com\/voidnont\/Frxe-Windows/i);
});

test('Frxe Desktop ships without an in-app updater', async () => {
  const [cargo, lib, capabilities, config, backend, app, ui, windowsWorkflow, linuxWorkflow, macWorkflow, releaseWorkflow] = await Promise.all([
    read('src-tauri/Cargo.toml'),
    read('src-tauri/src/lib.rs'),
    read('src-tauri/capabilities/default.json'),
    read('src-tauri/tauri.conf.json'),
    read('web/backend.mjs'),
    read('web/app.mjs'),
    read('web/ui.mjs'),
    read('.github/workflows/windows-msi.yml'),
    read('.github/workflows/linux-packages.yml'),
    read('.github/workflows/macos-dmg.yml'),
    read('.github/workflows/release-installers.yml'),
  ]);
  const joined = [cargo, lib, capabilities, config, backend, app, ui, windowsWorkflow, linuxWorkflow, macWorkflow, releaseWorkflow].join('\n');
  assert.doesNotMatch(joined, /tauri-plugin-updater|tauri_plugin_updater|updater:default|check_app_update|install_app_update|checkAppUpdate|installAppUpdate|app-update-progress|createUpdaterArtifacts|latest\.json|TAURI_SIGNING_PRIVATE_KEY|Frxe Updates|Check for updates|Update now/);
  assert.equal(await exists('src-tauri/src/updater.rs'), false);
  assert.equal(await exists('tools/generate-latest-json.mjs'), false);
  assert.equal(await exists('tests/updater-ui.test.mjs'), false);
  assert.equal(await exists('tests/release-metadata.test.mjs'), false);
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
