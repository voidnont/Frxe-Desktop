import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const skipped = new Set(['.git', 'node_modules', 'src-tauri', 'release-upload']);
const textExtensions = new Set(['.bat', '.css', '.html', '.json', '.md', '.mjs', '.ps1', '.svg', '.txt', '.yml', '.yaml']);
const retiredBrand = ['nont', 'music'].join('');

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (skipped.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collect(full));
    else if (textExtensions.has(extname(entry.name).toLowerCase()) || entry.name === '.gitignore') files.push(full);
  }
  return files;
}

test('tracked text stays Frxe-only', async () => {
  const matches = [];
  for (const file of await collect(root)) {
    const content = (await readFile(file, 'utf8')).toLowerCase();
    if (content.includes(retiredBrand)) matches.push(relative(root, file));
  }
  assert.deepEqual(matches, []);
});

test('Windows and in-app Frxe branding use one canonical icon asset', async () => {
  const [index, ui, prepare] = await Promise.all([
    readFile(join(root, 'web', 'index.html'), 'utf8'),
    readFile(join(root, 'web', 'ui.mjs'), 'utf8'),
    readFile(join(root, 'tools', 'prepare-backend.ps1'), 'utf8'),
  ]);

  assert.match(index, /<link rel="icon" href="\.\/frxe-icon\.svg"/);
  assert.match(index, /<img class="brand-mark" src="\.\/frxe-icon\.svg"/);
  assert.match(ui, /<img class="brand-mark large" src="\.\/frxe-icon\.svg"/);
  assert.match(prepare, /Join-Path \$Root "web\\frxe-icon\.svg"/);
  assert.doesNotMatch(index, /<div class="brand-mark">F<\/div>/);
  assert.doesNotMatch(ui, /<div class="brand-mark large">F<\/div>/);
});
