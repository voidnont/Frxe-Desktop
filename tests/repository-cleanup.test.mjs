import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');

test('maintained CI does not target temporary development branches', async () => {
  const ci = await read('.github/workflows/ci.yml');
  assert.doesNotMatch(ci, /cleanup\/|fix\/|feature\/|feat\//);
});
