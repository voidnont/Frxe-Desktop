import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const skipped = new Set(['.git', 'node_modules', 'src-tauri', 'release-upload']);
const textExtensions = new Set(['.bat', '.css', '.html', '.json', '.md', '.mjs', '.ps1', '.txt', '.yml', '.yaml']);
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
