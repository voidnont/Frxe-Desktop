import {
  DEFAULT_PREFERENCES,
  createTrackSourceCache,
  currentLyricIndex,
  formatClock,
  nextQueueIndex,
  normalizePreferences,
  parseLrc,
  queuePrefetchTracks,
  safeJsonParse,
  trackKey,
} from './core.mjs';
import { createBackend } from './backend.mjs';
import { createView } from './ui.mjs';

const KEYS = {
  prefs: 'frxe.desktop.preferences.v1',
  favorites: 'frxe.desktop.favorites.v1',
  history: 'frxe.desktop.history.v1',
  playlists: 'frxe.desktop.playlists.v1',
  session: 'frxe.desktop.session.v1',
};

const app = document.querySelector('#app');
const audio = document.querySelector('#audio');
const ambient = document.querySelector('#ambient');
const toastHost = document.querySelector('#toast-host');

const tauri = window.__TAURI__ || null;
const invoke = tauri?.core?.invoke
  ? tauri.core.invoke
  : async (command) => { throw new Error(`Native backend unavailable: ${command}`); };
const listen = tauri?.event?.listen ? tauri.event.listen : null;
const convertFileSrc = tauri?.core?.convertFileSrc || ((path) => path);
const backend = createBackend({ invoke, listen, convertFileSrc });
const sourceCache = createTrackSourceCache((track) => backend.resolveTrack(track));

const state = {
  tab: 'home',
  playerOpen: false,
  current: null,
  queue: [],
  queueIndex: -1,
  playing: false,
  resolving: false,
  searchQuery: '',
  searchResults: [],
  searchLoading: false,
  searchError: '',
  offline: [],
  downloads: [],
  favorites: loadArray(KEYS.favorites),
  history: loadArray(KEYS.history),
  playlists: loadArray(KEYS.playlists),
  prefs: normalizePreferences(safeJsonParse(localStorage.getItem(KEYS.prefs) || '{}', {})),
  lyrics: [],
  plainLyrics: '',
  lyricsLoading: false,
  lyricsTrackKey: '',
  runtimeStatus: null,
  runtimeLoading: false,
  updateStatus: '',
  updateInfo: null,
  updateProgress: null,
  updateError: '',
  updateChecking: false,
  updateInstalling: false,
};

const trackRegistry = new Map();
let downloadUnlisten = null;
let updateUnlisten = null;
let playbackRequestId = 0;

function loadArray(key) {
  const value = safeJsonParse(localStorage.getItem(key) || '[]', []);
  return Array.isArray(value) ? value : [];
}

function savePrefs() {
  localStorage.setItem(KEYS.prefs, JSON.stringify(state.prefs));
}

function persistLists() {
  localStorage.setItem(KEYS.favorites, JSON.stringify(state.favorites.slice(0, 300)));
  localStorage.setItem(KEYS.history, JSON.stringify(state.history.slice(0, 120)));
  localStorage.setItem(KEYS.playlists, JSON.stringify(state.playlists.slice(0, 80)));
}

const { render, toast, updateAmbient, isFavorite } = createView({
  state, app, audio, ambient, toastHost, backend, convertFileSrc, trackRegistry, savePrefs, persistLists,
  actions: { performSearch, refreshOffline, syncPlayerUi },
});

async function performSearch(query) {
  const clean = String(query || '').trim();
  state.searchQuery = clean;
  if (!clean) { state.searchResults = []; state.searchError = ''; render(); return; }
  state.searchLoading = true;
  state.searchError = '';
  render();
  try {
    state.searchResults = await backend.search(clean);
  } catch (error) {
    state.searchResults = [];
    state.searchError = readableError(error);
  } finally {
    state.searchLoading = false;
    render();
  }
}

function readableError(error) {
  const value = String(error?.message || error || 'Something went wrong.');
  return value.length > 220 ? `${value.slice(0, 217)}…` : value;
}

function updateMediaSession(track) {
  if (!('mediaSession' in navigator) || !track) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Unknown track',
      artist: track.artist || 'Unknown artist',
      album: track.album || 'Frxe Desktop',
      artwork: track.cover ? [{ src: track.kind === 'local' && !/^https?:|^data:|^asset:/.test(track.cover) ? convertFileSrc(track.cover) : track.cover }] : [],
    });
  } catch {}
}

function prefetchQueueSources() {
  for (const track of queuePrefetchTracks(state.queue, state.queueIndex, 2)) {
    sourceCache.prefetch(track);
  }
}

async function playTrack(track, queue = null, index = null) {
  if (!track) return;
  const same = trackKey(track) === trackKey(state.current);
  if (same && audio.src) {
    if (audio.paused) await audio.play().catch((error) => toast(readableError(error), 'error'));
    else audio.pause();
    return;
  }

  const requestId = ++playbackRequestId;
  if (queue) {
    state.queue = [...queue];
    state.queueIndex = index ?? Math.max(0, state.queue.findIndex((item) => trackKey(item) === trackKey(track)));
  } else if (!state.queue.some((item) => trackKey(item) === trackKey(track))) {
    state.queue = [track];
    state.queueIndex = 0;
  } else {
    state.queueIndex = state.queue.findIndex((item) => trackKey(item) === trackKey(track));
  }

  state.current = track;
  state.resolving = true;
  state.playing = false;
  updateAmbient(track);
  updateMediaSession(track);
  pushHistory(track);
  prefetchQueueSources();
  render();

  try {
    const source = await sourceCache.get(track);
    if (requestId !== playbackRequestId || trackKey(state.current) !== trackKey(track)) return;
    audio.src = source;
    audio.volume = state.prefs.volume;
    audio.muted = state.prefs.muted;
    await audio.play();
    if (requestId !== playbackRequestId) return;
    state.playing = true;
    if (state.playerOpen) void loadLyrics(track);
  } catch (error) {
    if (requestId !== playbackRequestId) return;
    sourceCache.clear(track);
    toast(`Could not play ${track.title}: ${readableError(error)}`, 'error');
    state.playing = false;
  } finally {
    if (requestId === playbackRequestId) {
      state.resolving = false;
      saveSession();
      render();
    }
  }
}

function pushHistory(track) {
  const key = trackKey(track);
  state.history = [track, ...state.history.filter((item) => trackKey(item) !== key)].slice(0, 120);
  persistLists();
}

async function togglePlay() {
  if (!state.current) return;
  if (audio.paused) {
    try { await audio.play(); } catch (error) { toast(readableError(error), 'error'); }
  } else audio.pause();
}

async function goNext() {
  const nextIndex = nextQueueIndex({ index: state.queueIndex, length: state.queue.length, repeat: state.prefs.repeat, shuffle: state.prefs.shuffle });
  if (nextIndex < 0) { audio.pause(); audio.currentTime = 0; return; }
  if (nextIndex === state.queueIndex) {
    audio.currentTime = 0;
    if (audio.paused) await audio.play().catch(() => {});
    return;
  }
  await playTrack(state.queue[nextIndex], state.queue, nextIndex);
}

async function goPrevious() {
  if (audio.currentTime > 4) { audio.currentTime = 0; return; }
  if (!state.queue.length) return;
  let index = state.queueIndex - 1;
  if (index < 0) index = state.prefs.repeat === 'queue' ? state.queue.length - 1 : 0;
  if (index === state.queueIndex) {
    audio.currentTime = 0;
    if (audio.paused) await audio.play().catch(() => {});
    return;
  }
  await playTrack(state.queue[index], state.queue, index);
}

function toggleFavorite(track) {
  if (!track) return;
  const key = trackKey(track);
  if (isFavorite(track)) state.favorites = state.favorites.filter((item) => trackKey(item) !== key);
  else state.favorites = [track, ...state.favorites.filter((item) => trackKey(item) !== key)];
  persistLists();
  render();
}

async function queueDownload(track, retryTask = null) {
  if (!track || track.kind !== 'youtube') return;
  if (!state.prefs.downloadDir.trim()) {
    state.tab = 'settings';
    render();
    toast('Choose a Music folder before downloading.', 'error');
    return;
  }
  try {
    if (!retryTask) {
      const exists = await backend.downloadAlreadyExists(track.id, state.prefs.downloadDir).catch(() => false);
      if (exists) { toast('That track is already downloaded.'); return; }
    }
    const task = retryTask || { id: crypto.randomUUID(), track, status: 'queued', progress: 0 };
    task.status = 'downloading';
    task.error = '';
    if (!state.downloads.some((item) => item.id === task.id)) state.downloads.push(task);
    state.tab = 'save';
    render();
    await backend.startDownload({ taskId: task.id, track, outputDir: state.prefs.downloadDir, format: state.prefs.format, quality: state.prefs.quality, allowPlaylist: false });
    state.downloads = state.downloads.filter((item) => item.id !== task.id);
    toast(`Saved ${track.title}`);
    await refreshOffline();
  } catch (error) {
    taskError(retryTask?.id || state.downloads.find((item) => trackKey(item.track) === trackKey(track))?.id, error);
  }
  render();
}

function taskError(id, error) {
  const task = state.downloads.find((item) => item.id === id);
  if (task) { task.status = 'failed'; task.error = readableError(error); }
  toast(`Download failed: ${readableError(error)}`, 'error');
}

async function refreshOffline() {
  if (!state.prefs.downloadDir.trim()) return;
  try {
    await backend.clearRemovedDownloads(state.prefs.downloadDir).catch(() => 0);
    const tracks = await backend.scanDownloads(state.prefs.downloadDir);
    state.offline = Array.isArray(tracks) ? tracks : [];
    if (state.tab === 'save' || state.tab === 'library' || state.tab === 'home') render();
  } catch (error) {
    console.warn('Frxe offline scan failed', error);
  }
}

async function loadLyrics(track) {
  const key = trackKey(track);
  if (!track || state.lyricsTrackKey === key || state.lyricsLoading) return;
  state.lyricsTrackKey = key;
  state.lyricsLoading = true;
  state.lyrics = [];
  state.plainLyrics = '';
  if (state.playerOpen) render();
  try {
    const result = await backend.lyrics(track);
    if (result?.syncedLyrics) state.lyrics = parseLrc(result.syncedLyrics);
    state.plainLyrics = result?.plainLyrics || '';
  } catch {
    state.plainLyrics = '';
  } finally {
    state.lyricsLoading = false;
    if (state.playerOpen && trackKey(state.current) === key) render();
  }
}

async function updateRuntime() {
  state.runtimeLoading = true;
  render();
  try {
    state.runtimeStatus = await backend.updateRuntimeDependencies();
    toast(state.runtimeStatus?.warnings?.length ? 'Runtime updated with warnings.' : 'Runtime dependencies updated.');
  } catch (error) {
    toast(`Runtime update failed: ${readableError(error)}`, 'error');
  } finally {
    state.runtimeLoading = false;
    render();
  }
}

async function checkForAppUpdate() {
  if (state.updateChecking || state.updateInstalling) return;
  state.updateChecking = true;
  state.updateError = '';
  state.updateStatus = 'Checking for the newest Frxe Desktop release…';
  render();
  try {
    state.updateInfo = await backend.checkAppUpdate();
    state.updateStatus = state.updateInfo
      ? `Frxe Desktop ${state.updateInfo.version} is available.`
      : "You're up to date.";
  } catch (error) {
    state.updateInfo = null;
    state.updateStatus = '';
    state.updateError = readableError(error);
    toast(`Update check failed: ${state.updateError}`, 'error');
  } finally {
    state.updateChecking = false;
    render();
  }
}

async function installAppUpdate() {
  if (!state.updateInfo || state.updateInstalling) return;
  state.updateInstalling = true;
  state.updateError = '';
  state.updateProgress = { state: 'starting', downloaded: 0, total: null };
  state.updateStatus = `Installing Frxe Desktop ${state.updateInfo.version}…`;
  render();
  try {
    await backend.installAppUpdate();
    state.updateStatus = 'Update installed. Restarting Frxe Desktop…';
  } catch (error) {
    state.updateError = readableError(error);
    state.updateStatus = '';
    state.updateInstalling = false;
    toast(`Update failed: ${state.updateError}`, 'error');
  }
  render();
}

function saveSession() {
  try {
    localStorage.setItem(KEYS.session, JSON.stringify({ track: state.current, queue: state.queue, queueIndex: state.queueIndex, position: audio.currentTime || 0 }));
  } catch {}
}

async function restoreSession() {
  const session = safeJsonParse(localStorage.getItem(KEYS.session) || 'null', null);
  if (!session?.track) return;
  state.current = session.track;
  state.queue = Array.isArray(session.queue) && session.queue.length ? session.queue : [session.track];
  state.queueIndex = Number.isInteger(session.queueIndex) ? session.queueIndex : 0;
  updateAmbient(state.current);
  prefetchQueueSources();
  try {
    audio.src = await sourceCache.get(state.current);
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(session.position)) audio.currentTime = Math.min(session.position, audio.duration || session.position);
    }, { once: true });
  } catch {}
}

function ensureUiEnhancements() {
  const miniActions = document.querySelector('.mini-actions');
  if (miniActions && !document.querySelector('#mini-volume')) {
    const volumeControl = document.createElement('label');
    volumeControl.className = 'mini-volume';
    volumeControl.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"></path><path d="M15 9a4 4 0 0 1 0 6"></path><path d="M17.8 6.5a8 8 0 0 1 0 11"></path></svg><input id="mini-volume" type="range" min="0" max="1" step="0.01" value="${state.prefs.muted ? 0 : state.prefs.volume}" aria-label="Volume"/>`;
    miniActions.prepend(volumeControl);
  }

  const miniVolume = document.querySelector('#mini-volume');
  if (miniVolume && miniVolume.dataset.bound !== '1') {
    miniVolume.dataset.bound = '1';
    miniVolume.addEventListener('input', (event) => {
      const value = Number(event.target.value);
      state.prefs.volume = value;
      state.prefs.muted = value === 0;
      audio.volume = value;
      audio.muted = state.prefs.muted;
      savePrefs();
    });
  }
  if (miniVolume && !miniVolume.matches(':active')) {
    miniVolume.value = String(state.prefs.muted ? 0 : state.prefs.volume);
  }
}

function syncPlayerUi() {
  ensureUiEnhancements();
  const progress = audio.duration ? Math.max(0, Math.min(100, (audio.currentTime / audio.duration) * 100)) : 0;
  document.querySelector('.mini-progress i')?.style.setProperty('width', `${progress}%`);
  const seek = document.querySelector('#seek');
  if (seek && !seek.matches(':active')) { seek.max = String(Math.max(1, audio.duration || state.current?.durationSeconds || 1)); seek.value = String(audio.currentTime || 0); }
  const pos = document.querySelector('#position-label');
  const duration = document.querySelector('#duration-label');
  if (pos) pos.textContent = formatClock(audio.currentTime || 0);
  if (duration) duration.textContent = formatClock(audio.duration || state.current?.durationSeconds || 0);
  const activeLine = state.playerOpen ? currentLyricIndex(state.lyrics, audio.currentTime || 0) : -1;
  document.querySelectorAll('.lyric-line').forEach((line, index) => line.classList.toggle('active', index === activeLine));
  document.querySelector('.lyric-line.active')?.scrollIntoView({ block: 'center', behavior: state.prefs.reducedMotion ? 'auto' : 'smooth' });
}

app.addEventListener('click', async (event) => {
  const externalLink = event.target.closest('[data-external]');
  if (externalLink) {
    event.preventDefault();
    const url = externalLink.dataset.external;
    try {
      if (tauri?.opener?.openUrl) await tauri.opener.openUrl(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return;
  }

  const tabButton = event.target.closest('[data-tab]');
  if (tabButton) {
    state.tab = tabButton.dataset.tab;
    state.playerOpen = false;
    render();
    if (state.tab === 'save' || state.tab === 'library') void refreshOffline();
    if (state.tab === 'search') setTimeout(() => document.querySelector('#search-input')?.focus(), 40);
    return;
  }
  const searchChip = event.target.closest('[data-search]');
  if (searchChip) { state.tab = 'search'; await performSearch(searchChip.dataset.search); return; }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const track = button.dataset.track ? trackRegistry.get(button.dataset.track) : null;
  switch (button.dataset.action) {
    case 'play-track': {
      const sourceList = state.tab === 'search' ? state.searchResults : state.tab === 'library' ? [...state.favorites, ...state.offline] : state.tab === 'save' ? state.offline : state.history.length ? state.history : [track];
      const idx = Math.max(0, sourceList.findIndex((item) => trackKey(item) === trackKey(track)));
      await playTrack(track, sourceList, idx);
      break;
    }
    case 'toggle-play': await togglePlay(); break;
    case 'open-player': state.playerOpen = true; await loadLyrics(state.current); render(); break;
    case 'close-player': state.playerOpen = false; render(); break;
    case 'next': await goNext(); break;
    case 'previous': await goPrevious(); break;
    case 'favorite': toggleFavorite(track || state.current); break;
    case 'download': await queueDownload(track || state.current); break;
    case 'clear-search': state.searchQuery = ''; state.searchResults = []; state.searchError = ''; render(); setTimeout(() => document.querySelector('#search-input')?.focus(), 0); break;
    case 'retry-search': await performSearch(state.searchQuery); break;
    case 'shuffle': state.prefs.shuffle = !state.prefs.shuffle; savePrefs(); render(); break;
    case 'repeat': state.prefs.repeat = state.prefs.repeat === 'off' ? 'queue' : state.prefs.repeat === 'queue' ? 'track' : 'off'; savePrefs(); render(); break;
    case 'queue-play': { const index = Number(button.dataset.index); if (state.queue[index]) await playTrack(state.queue[index], state.queue, index); break; }
    case 'cancel-download': { const task = state.downloads.find((item) => item.id === button.dataset.task); if (task) { await backend.cancelDownload(task.id).catch(() => {}); state.downloads = state.downloads.filter((item) => item.id !== task.id); render(); } break; }
    case 'retry-download': { const task = state.downloads.find((item) => item.id === button.dataset.task); if (task) await queueDownload(task.track, task); break; }
    case 'update-runtime': await updateRuntime(); break;
    case 'check-update': await checkForAppUpdate(); break;
    case 'install-update': await installAppUpdate(); break;
  }
});

document.querySelectorAll('[data-window]').forEach((button) => button.addEventListener('click', async () => {
  const currentWindow = tauri?.window?.getCurrentWindow?.();
  if (!currentWindow) return;
  const action = button.dataset.window;
  if (action === 'minimize') await currentWindow.minimize();
  if (action === 'maximize') await currentWindow.toggleMaximize();
  if (action === 'close') await currentWindow.close();
}));

audio.addEventListener('play', () => { state.playing = true; document.body.classList.add('is-playing'); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; render(); });
audio.addEventListener('pause', () => { state.playing = false; document.body.classList.remove('is-playing'); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; render(); saveSession(); });
audio.addEventListener('timeupdate', syncPlayerUi);
audio.addEventListener('durationchange', syncPlayerUi);
audio.addEventListener('ended', goNext);
audio.addEventListener('error', () => {
  if (state.current) {
    sourceCache.clear(state.current);
    toast(`Playback error: ${state.current.title}`, 'error');
  }
});

window.addEventListener('keydown', (event) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (event.ctrlKey && event.key.toLowerCase() === 'f') {
    event.preventDefault(); state.tab = 'search'; state.playerOpen = false; render(); setTimeout(() => document.querySelector('#search-input')?.focus(), 30); return;
  }
  if (typing) return;
  if (event.code === 'Space') { event.preventDefault(); void togglePlay(); }
  if (event.key === 'Escape' && state.playerOpen) { state.playerOpen = false; render(); }
  if (event.altKey && event.key === 'ArrowRight') void goNext();
  if (event.altKey && event.key === 'ArrowLeft') void goPrevious();
});

async function initialize() {
  if ('mediaSession' in navigator) {
    const handlers = {
      play: () => void audio.play(),
      pause: () => audio.pause(),
      previoustrack: () => void goPrevious(),
      nexttrack: () => void goNext(),
      seekto: (details) => { if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime; },
      seekbackward: (details) => { audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10)); },
      seekforward: (details) => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (details.seekOffset || 10)); },
    };
    for (const [action, handler] of Object.entries(handlers)) { try { navigator.mediaSession.setActionHandler(action, handler); } catch {} }
  }
  if (listen) {
    try {
      await listen('player-command', ({ payload }) => {
        const action = payload?.action;
        if (action === 'toggle-play') void togglePlay();
        if (action === 'next') void goNext();
        if (action === 'previous') void goPrevious();
      });
    } catch {}
  }
  document.documentElement.classList.toggle('reduce-motion', state.prefs.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches);
  try {
    if (!state.prefs.downloadDir && tauri?.path?.audioDir) {
      const dir = await tauri.path.audioDir();
      state.prefs = normalizePreferences(state.prefs, dir || '');
      savePrefs();
    }
  } catch {}
  try {
    downloadUnlisten = await backend.onDownloadProgress((payload) => {
      const task = state.downloads.find((item) => item.id === payload.task_id);
      if (!task) return;
      task.progress = Number(payload.percent || 0);
      task.speed = payload.speed || '';
      task.eta = payload.eta || '';
      task.itemTitle = payload.item_title || '';
      if (state.tab === 'save') render();
    });
  } catch {}
  try {
    updateUnlisten = await backend.onAppUpdateProgress((payload) => {
      state.updateProgress = payload || null;
      if (state.tab === 'settings') render();
    });
  } catch {}
  await restoreSession();
  await refreshOffline();
  render();
}

window.addEventListener('beforeunload', () => {
  saveSession();
  if (typeof downloadUnlisten === 'function') downloadUnlisten();
  if (typeof updateUnlisten === 'function') updateUnlisten();
});
void initialize();
