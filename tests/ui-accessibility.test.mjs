import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

async function source(path) {
  return readFile(join(root, path), 'utf8');
}

async function uiSource() {
  return [await source('web/ui.mjs'), await source('web/app.mjs')].join('\n');
}

test('mini player exposes an always-accessible volume slider', async () => {
  const ui = await uiSource();
  assert.match(ui, /(?:class="mini-volume"|className\s*=\s*['"]mini-volume['"])/);
  assert.match(ui, /id="mini-volume"/);
  assert.match(ui, /aria-label="Volume"/);
});

test('About card includes Ko-fi and GitHub pill links', async () => {
  const ui = await uiSource();
  assert.match(ui, /https:\/\/ko-fi\.com\/voidnont/);
  assert.match(ui, /https:\/\/github\.com\/voidnont\/frxe-windows/);
  assert.match(ui, /support-links/);
});

test('select menus use dark readable option styling', async () => {
  const styles = [
    await source('web/styles-1.css'),
    await source('web/styles-2.css'),
    await source('web/styles-3.css'),
    await source('web/styles-4.css'),
  ].join('\n');
  assert.match(styles, /select\s+option\s*\{/);
  assert.match(styles, /select\s+option\s*\{[^}]*background\s*:\s*#(?:0[0-9a-f]{5}|1[0-9a-f]{5}|2[0-9a-f]{5})/is);
  assert.match(styles, /select\s+option\s*\{[^}]*color\s*:\s*(?:#f|white)/is);
});
