import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');

test('Settings exposes signed Frxe app update controls and status', async () => {
  const [ui, app, backend] = await Promise.all([
    read('web/ui.mjs'),
    read('web/app.mjs'),
    read('web/backend.mjs'),
  ]);

  assert.match(ui, /Frxe Updates/);
  assert.match(ui, /Current version\s*<b>1\.2\.2<\/b>/);
  assert.match(ui, /Check for updates/);
  assert.match(ui, /Update now/);
  assert.match(ui, /updateProgress/);
  assert.match(ui, /release|notes/i);

  assert.match(app, /checkForAppUpdate/);
  assert.match(app, /installAppUpdate/);
  assert.match(app, /onAppUpdateProgress/);
  assert.match(app, /You're up to date\./);
  assert.match(app, /Update failed/);

  assert.match(backend, /invoke\('check_app_update'\)/);
  assert.match(backend, /invoke\('install_app_update'\)/);
  assert.match(backend, /listen\('app-update-progress'/);
});
