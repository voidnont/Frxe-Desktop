import { dedupeTracks } from './core.mjs';

export function createBackend({ invoke, listen = null, convertFileSrc = (path) => path }) {
  if (typeof invoke !== 'function') throw new TypeError('Frxe Desktop backend requires an invoke function');

  const safeSearch = async (command, payload) => {
    try {
      const result = await invoke(command, payload);
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    }
  };

  return {
    async search(query) {
      const clean = String(query || '').trim();
      if (!clean) return [];
      const providerQuery = /\b(song|music|audio|lyrics?|official|album|artist|playlist|remix|instrumental|soundtrack|single)\b/i.test(clean)
        ? clean
        : `${clean} song`;
      const groups = await Promise.all([
        safeSearch('innertube_search', { query: providerQuery, client: 'music' }),
        safeSearch('innertube_search', { query: providerQuery, client: 'web' }),
        safeSearch('ytdlp_search', { query: providerQuery }),
      ]);
      return dedupeTracks(groups);
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
