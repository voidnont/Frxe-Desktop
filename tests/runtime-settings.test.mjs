import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('runtime settings distinguish managed yt-dlp from detected system tools', async () => {
  const [ui, app, backend, lib, runtime] = await Promise.all([
    read('web/ui.mjs'),
    read('web/app.mjs'),
    read('web/backend.mjs'),
    read('src-tauri/src/lib.rs'),
    read('src-tauri/src/runtime.rs'),
  ]);

  assert.match(ui, /Frxe manages yt-dlp/i);
  assert.match(ui, /Deno[^.]*FFmpeg[^.]*detect|detect[^.]*Deno[^.]*FFmpeg/is);
  assert.match(ui, /Update yt-dlp/i);
  assert.doesNotMatch(ui, /yt-dlp, Deno, FFmpeg[^.]*managed by Frxe Desktop/i);

  assert.match(backend, /currentRuntimeStatus\(\)[\s\S]*invoke\('current_runtime_status'\)/);
  assert.match(lib, /runtime::current_runtime_status/);
  assert.match(app, /state\.runtimeStatus\s*=\s*await backend\.currentRuntimeStatus\(\)/);
  assert.match(app, /yt-dlp updated/);
  assert.match(runtime, /#\[tauri::command\][\s\S]*pub async fn current_runtime_status/);
  assert.doesNotMatch(runtime, /Update runtime dependencies first/);
});
