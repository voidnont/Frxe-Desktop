import { dedupeTracks } from './core.mjs';

export function createBackend({ invoke, listen = null, convertFileSrc = (path) => path }) {
  if (typeof invoke !== 'function') throw new TypeError('Frxe Desktop backend requires an invoke function');

  const trySearch = async (command, payload) => {
    try {
      const result = await invoke(command, payload);
      return { ok: true, results: Array.isArray(result) ? result : [] };
    } catch (error) {
      return { ok: false, error };
    }
  };

  return {
    async search(query) {
      const clean = String(query || '').trim();
      if (!clean) return [];
      const providerQuery = /\b(song|music|audio|lyrics?|official|album|artist|playlist|remix|instrumental|soundtrack|single)\b/i.test(clean)
        ? clean
        : `${clean} song`;
      const attempts = await Promise.all([
        trySearch('innertube_search', { query: providerQuery, client: 'music' }),
        trySearch('innertube_search', { query: providerQuery, client: 'web' }),
        trySearch('ytdlp_search', { query: providerQuery }),
      ]);
      const successful = attempts.filter((attempt) => attempt.ok);
      if (!successful.length) {
        throw new Error('Search providers are temporarily unavailable. Try again.');
      }
      return dedupeTracks(successful.map((attempt) => attempt.results));
    },

    async resolveTrack(track) {
      if (track?.kind === 'local' && track.path) return convertFileSrc(track.path);
      if (!track?.id) throw new Error('This track has no playable source.');
      return invoke('resolve_stream_url', { videoId: track.id });
    },

    scanDownloads(dir) {
      return invoke('scan_downloads', { dir });
    },

    clearRemovedDownloads(downloadDir) {
      return invoke('clear_removed_downloads', { downloadDir });
    },

    downloadAlreadyExists(videoId, outputDir) {
      return invoke('download_already_exists', { videoId, outputDir });
    },

    startDownload({ taskId, track, outputDir, format, quality, allowPlaylist = false }) {
      if (!track?.id) throw new Error('This track cannot be downloaded.');
      return invoke('download_track', {
        taskId,
        url: `https://www.youtube.com/watch?v=${track.id}`,
        outputDir,
        format,
        quality,
        allowPlaylist,
      });
    },

    cancelDownload(taskId) {
      return invoke('cancel_download', { taskId });
    },

    removeDownload(path, downloadDir) {
      return invoke('remove_download', { path, downloadDir });
    },

    lyrics(track) {
      return invoke('fetch_metadata_lyrics', {
        title: track?.title || '',
        artist: track?.artist || '',
        album: track?.album || '',
        durationSeconds: Number(track?.durationSeconds || 0),
      });
    },

    updateRuntimeDependencies() {
      return invoke('update_runtime_dependencies');
    },

    setTrayEnabled(enabled) {
      return invoke('set_tray_enabled', { enabled });
    },

    onDownloadProgress(handler) {
      if (typeof listen !== 'function') return Promise.resolve(() => {});
      return listen('download-progress', (event) => handler(event.payload));
    },
  };
}
