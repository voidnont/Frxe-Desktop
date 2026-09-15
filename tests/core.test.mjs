import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../web/core.mjs';
import {
  DEFAULT_PREFERENCES,
  createTrackSourceCache,
  dedupeTracks,
  formatClock,
  nextQueueIndex,
  normalizePreferences,
  parseLrc,
  queuePrefetchTracks,
  trackKey,
} from '../web/core.mjs';

const a = { id: 'abc12345', kind: 'youtube', title: 'A', artist: 'Artist' };
const b = { id: 'def67890', kind: 'youtube', title: 'B', artist: 'Artist' };
const c = { id: 'ghi24680', kind: 'youtube', title: 'C', artist: 'Artist' };
const d = { id: 'jkl13579', kind: 'youtube', title: 'D', artist: 'Artist' };

test('trackKey separates local and youtube items', () => {
  assert.equal(trackKey(a), 'youtube:abc12345');
  assert.equal(trackKey({ ...a, kind: 'local' }), 'local:abc12345');
});

test('dedupeTracks preserves provider order and removes duplicate ids per kind', () => {
  assert.deepEqual(
    dedupeTracks([[a, b], [{ ...a, title: 'duplicate' }]]).map((track) => track.title),
    ['A', 'B'],
  );
});

test('formatClock formats finite media positions', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(65.2), '1:05');
  assert.equal(formatClock(3661), '1:01:01');
  assert.equal(formatClock(Number.NaN), '0:00');
});

test('nextQueueIndex handles sequential, repeat-track and repeat-queue playback', () => {
  assert.equal(nextQueueIndex({ index: 0, length: 3, repeat: 'off', shuffle: false }), 1);
  assert.equal(nextQueueIndex({ index: 2, length: 3, repeat: 'off', shuffle: false }), -1);
  assert.equal(nextQueueIndex({ index: 1, length: 3, repeat: 'track', shuffle: false }), 1);
  assert.equal(nextQueueIndex({ index: 2, length: 3, repeat: 'queue', shuffle: false }), 0);
});

test('queue selection falls back to the clicked track when candidates omit it', () => {
  assert.equal(typeof core.selectPlaybackQueue, 'function', 'selectPlaybackQueue must exist');
  assert.deepEqual(core.selectPlaybackQueue(c, [a, b]), { queue: [c], index: 0 });
});

test('queuePrefetchTracks warms nearby previous and next tracks', () => {
  assert.deepEqual(queuePrefetchTracks([a, b, c, d], 1, 2), [a, c, d]);
  assert.deepEqual(queuePrefetchTracks([a, b], 0, 2), [b]);
});

test('track source cache reuses prefetched resolver work', async () => {
  let calls = 0;
  const cache = createTrackSourceCache(async (track) => {
    calls += 1;
    return `stream:${track.id}`;
  });
  cache.prefetch(b);
  assert.equal(await cache.get(b), 'stream:def67890');
  assert.equal(await cache.get(b), 'stream:def67890');
  assert.equal(calls, 1);
});

test('normalizePreferences merges persisted values and fills a missing download directory', () => {
  const prefs = normalizePreferences({ volume: 2, format: 'flac' }, 'C:\\Users\\void\\Music');
  assert.equal(prefs.format, 'flac');
  assert.equal(prefs.downloadDir, 'C:\\Users\\void\\Music');
  assert.equal(prefs.volume, 1);
  assert.equal(prefs.repeat, DEFAULT_PREFERENCES.repeat);
});

test('parseLrc returns timed lyric lines in order', () => {
  const lines = parseLrc('[00:10.50]Second\n[00:02.00]First\nplain');
  assert.deepEqual(lines, [
    { time: 2, text: 'First' },
    { time: 10.5, text: 'Second' },
  ]);
});
