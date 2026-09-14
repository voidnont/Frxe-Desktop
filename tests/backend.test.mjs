import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackend } from '../web/backend.mjs';

const online = { id: 'abcdefghijk', kind: 'youtube', title: 'Song', artist: 'Artist' };
const local = { id: 'C:/Music/song.m4a', kind: 'local', path: 'C:/Music/song.m4a', title: 'Song', artist: 'Artist' };

test('search prioritizes YouTube Music before YouTube fallbacks and deduplicates results', async () => {
  const calls = [];
  const invoke = async (command, payload) => {
    calls.push([command, payload]);
    if (command === 'innertube_search' && payload.client === 'web') return [{ ...online, source: 'YouTube' }];
    if (command === 'innertube_search' && payload.client === 'music') return [{ ...online, source: 'YouTube Music' }, { ...online, id: 'zzzzzzzzzzz', title: 'Other', source: 'YouTube Music' }];
    if (command === 'ytdlp_search') return [{ ...online }];
    throw new Error(`unexpected ${command}`);
  };
  const backend = createBackend({ invoke, convertFileSrc: (path) => `asset:${path}` });
  const results = await backend.search('test');
  assert.equal(results.length, 2);
  assert.deepEqual(calls.map(([name, payload]) => [name, payload.client || null]), [
    ['innertube_search', 'music'],
    ['innertube_search', 'web'],
    ['ytdlp_search', null],
  ]);
  assert.equal(results[0].source, 'YouTube Music');
});

test('resolveTrack uses local asset URLs and the Frxe online resolver', async () => {
  const calls = [];
  const backend = createBackend({
    invoke: async (command, payload) => { calls.push([command, payload]); return 'https://stream.test/audio'; },
    convertFileSrc: (path) => `asset://${path}`,
  });
  assert.equal(await backend.resolveTrack(local), 'asset://C:/Music/song.m4a');
  assert.equal(await backend.resolveTrack(online), 'https://stream.test/audio');
  assert.deepEqual(calls[0], ['resolve_stream_url', { videoId: online.id }]);
});

test('startDownload maps Frxe settings to the native download command', async () => {
  let call;
  const backend = createBackend({
    invoke: async (command, payload) => { call = [command, payload]; return null; },
    convertFileSrc: String,
  });
  await backend.startDownload({
    taskId: 'job-1', track: online, outputDir: 'C:/Music', format: 'm4a', quality: 'best', allowPlaylist: false,
  });
  assert.deepEqual(call, ['download_track', {
    taskId: 'job-1',
    url: `https://www.youtube.com/watch?v=${online.id}`,
    outputDir: 'C:/Music',
    format: 'm4a',
    quality: 'best',
    allowPlaylist: false,
  }]);
});

test('scanDownloads and lyrics use the native payload names', async () => {
  const calls = [];
  const backend = createBackend({
    invoke: async (command, payload) => { calls.push([command, payload]); return command === 'scan_downloads' ? [local] : { plainLyrics: 'hello' }; },
    convertFileSrc: String,
  });
  assert.deepEqual(await backend.scanDownloads('C:/Music'), [local]);
  await backend.lyrics({ ...online, album: 'Album', durationSeconds: 201 });
  assert.deepEqual(calls, [
    ['scan_downloads', { dir: 'C:/Music' }],
    ['fetch_metadata_lyrics', { title: 'Song', artist: 'Artist', album: 'Album', durationSeconds: 201 }],
  ]);
});
