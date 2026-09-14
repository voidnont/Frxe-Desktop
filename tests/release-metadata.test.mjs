import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function runGenerator(dir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'tools/generate-latest-json.mjs'), dir], {
      cwd: root,
      env: {
        ...process.env,
        FRXE_PUB_DATE: '2026-09-14T21:00:00.000Z',
        FRXE_RELEASE_NOTES: 'Frxe Desktop 1.2.2 test release',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr || `generator exited ${code}`)));
  });
}

test('latest.json maps signed updater artifacts to canonical Frxe Desktop release URLs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'frxe-latest-'));
  const files = [
    'Frxe-Desktop-1.2.2-x64.msi',
    'Frxe-Desktop-1.2.2-x64.msi.sig',
    'Frxe-Desktop-1.2.2-x86_64.AppImage',
    'Frxe-Desktop-1.2.2-x86_64.AppImage.sig',
    'Frxe-Desktop-1.2.2-macos-arm64.app.tar.gz',
    'Frxe-Desktop-1.2.2-macos-arm64.app.tar.gz.sig',
    'Frxe-Desktop-1.2.2-macos-x64.app.tar.gz',
    'Frxe-Desktop-1.2.2-macos-x64.app.tar.gz.sig',
  ];

  try {
    for (const name of files) {
      await writeFile(join(dir, name), name.endsWith('.sig') ? `signature-${name}\n` : 'artifact');
    }
    await runGenerator(dir);
    const latest = JSON.parse(await readFile(join(dir, 'latest.json'), 'utf8'));
    assert.equal(latest.version, '1.2.2');
    assert.equal(latest.pub_date, '2026-09-14T21:00:00.000Z');
    assert.deepEqual(Object.keys(latest.platforms).sort(), [
      'darwin-aarch64',
      'darwin-x86_64',
      'linux-x86_64',
      'windows-x86_64',
    ]);
    for (const entry of Object.values(latest.platforms)) {
      assert.match(entry.signature, /^signature-/);
      assert.match(entry.url, /^https:\/\/github\.com\/voidnont\/Frxe-Desktop\/releases\/download\/v1\.2\.2\/Frxe-Desktop-1\.2\.2-/);
      assert.doesNotMatch(entry.url, /Frxe-Windows/i);
    }
    assert.match(latest.platforms['windows-x86_64'].url, /\.msi$/);
    assert.match(latest.platforms['linux-x86_64'].url, /\.AppImage$/);
    assert.match(latest.platforms['darwin-aarch64'].url, /arm64\.app\.tar\.gz$/);
    assert.match(latest.platforms['darwin-x86_64'].url, /x64\.app\.tar\.gz$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
