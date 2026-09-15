import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as core from '../web/core.mjs';

const [app, ui] = await Promise.all([
  readFile(new URL('../web/app.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../web/ui.mjs', import.meta.url), 'utf8'),
]);

test('removing a downloaded track prunes its saved references and keeps queue index valid', () => {
  assert.equal(typeof core.pruneTrackReferences, 'function');
  const removed = { kind: 'local', id: '/music/removed.m4a', title: 'Removed' };
  const kept = { kind: 'local', id: '/music/kept.m4a', title: 'Kept' };
  const next = core.pruneTrackReferences({
    favorites: [removed, kept],
    history: [removed, kept],
    playlists: [{ id: 'mix', name: 'Mix', tracks: [removed, kept] }],
    queue: [kept, removed],
    queueIndex: 1,
  }, removed);

  assert.deepEqual(next.favorites, [kept]);
  assert.deepEqual(next.history, [kept]);
  assert.deepEqual(next.playlists[0].tracks, [kept]);
  assert.deepEqual(next.queue, [kept]);
  assert.equal(next.queueIndex, 0);
});

test('Save and Library expose download and history management actions', () => {
  for (const action of ['remove-download', 'remove-history', 'clear-history']) {
    assert.match(ui, new RegExp(`data-action="${action}"`));
    assert.match(app, new RegExp(`case '${action}'`));
  }
  assert.match(ui, /Recently played/);
  assert.match(app, /backend\.removeDownload\(/);
  assert.match(app, /persistLists\(\)/);
});
