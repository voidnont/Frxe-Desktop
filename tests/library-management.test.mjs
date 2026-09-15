import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../web/core.mjs');

const localTrack = { kind: 'local', id: '/music/song.mp3', path: '/music/song.mp3', title: 'Song' };
const otherTrack = { kind: 'youtube', id: 'video-1', title: 'Other' };

test('removing a downloaded track prunes every saved reference to that local track', () => {
  assert.equal(typeof core.removeTrackReferences, 'function');

  const result = core.removeTrackReferences({
    queue: [localTrack, otherTrack],
    favorites: [localTrack, otherTrack],
    history: [otherTrack, localTrack],
    playlists: [
      { id: 'mix', name: 'Mix', tracks: [localTrack, otherTrack] },
      { id: 'empty', name: 'Empty', tracks: [] },
    ],
  }, localTrack);

  assert.deepEqual(result.queue, [otherTrack]);
  assert.deepEqual(result.favorites, [otherTrack]);
  assert.deepEqual(result.history, [otherTrack]);
  assert.deepEqual(result.playlists, [
    { id: 'mix', name: 'Mix', tracks: [otherTrack] },
    { id: 'empty', name: 'Empty', tracks: [] },
  ]);
});
