import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const skipped = new Set(['.git', 'node_modules', 'release-upload', 'target', 'icons']);
const textExtensions = new Set(['.bat', '.css', '.html', '.json', '.md', '.mjs', '.rs', '.sh', '.svg', '.toml', '.txt', '.yml', '.yaml']);
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

test('desktop and in-app Frxe branding use one canonical icon asset', async () => {
  const [index, styles, config, pkg, icon] = await Promise.all([
    readFile(join(root, 'web', 'index.html'), 'utf8'),
    readFile(join(root, 'web', 'styles-1.css'), 'utf8'),
    readFile(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'),
    readFile(join(root, 'package.json'), 'utf8'),
    readFile(join(root, 'web', 'frxe-icon.svg'), 'utf8'),
  ]);

  assert.match(index, /<link rel="icon" href="\.\/frxe-icon\.svg"/);
  assert.match(index, /<img class="brand-mark" src="\.\/frxe-icon\.svg"/);
  assert.match(styles, /\.brand-mark[^}]*url\('\.\/frxe-icon\.svg'\)/s);
  assert.match(config, /"productName"\s*:\s*"Frxe Desktop"/);
  assert.match(config, /"identifier"\s*:\s*"app\.frxe\.desktop"/);
  assert.match(pkg, /tauri icon web\/frxe-icon\.svg/);
  assert.match(icon, /fill="#09090B"/);
  assert.match(icon, /fill="#FFFFFF"/);
  assert.match(icon, /fill="#B7FF59"/);
});
