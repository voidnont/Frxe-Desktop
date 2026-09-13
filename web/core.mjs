export const DEFAULT_PREFERENCES = Object.freeze({
  downloadDir: '',
  format: 'm4a',
  quality: 'best',
  volume: 0.82,
  muted: false,
  shuffle: false,
  repeat: 'off',
  reducedMotion: false,
});

export function trackKey(track) {
  if (!track) return '';
  return `${track.kind || 'unknown'}:${track.id || ''}`;
}

export function dedupeTracks(groups) {
  const output = [];
  const seen = new Set();
  for (const track of groups.flat()) {
    if (!track?.id) continue;
    const key = trackKey(track);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(track);
  }
  return output;
}

export function formatClock(value) {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export function nextQueueIndex({ index, length, repeat = 'off', shuffle = false, random = Math.random }) {
  if (!Number.isInteger(length) || length <= 0) return -1;
  if (repeat === 'track' && index >= 0 && index < length) return index;
  if (shuffle && length > 1) {
    const candidate = Math.floor(Math.max(0, Math.min(0.999999, random())) * length);
    return candidate === index ? (candidate + 1) % length : candidate;
  }
  const next = index + 1;
  if (next < length) return next;
  return repeat === 'queue' ? 0 : -1;
}

export function normalizePreferences(raw = {}, detectedDownloadDir = '') {
  const next = { ...DEFAULT_PREFERENCES, ...(raw && typeof raw === 'object' ? raw : {}) };
  if (!String(next.downloadDir || '').trim() && detectedDownloadDir) next.downloadDir = detectedDownloadDir;
  next.volume = Math.max(0, Math.min(1, Number(next.volume) || 0));
  if (!['mp3', 'm4a', 'flac', 'wav'].includes(next.format)) next.format = DEFAULT_PREFERENCES.format;
  if (!['best', 'high', 'balanced'].includes(next.quality)) next.quality = DEFAULT_PREFERENCES.quality;
  if (!['off', 'queue', 'track'].includes(next.repeat)) next.repeat = DEFAULT_PREFERENCES.repeat;
  next.muted = Boolean(next.muted);
  next.shuffle = Boolean(next.shuffle);
  return next;
}

export function parseLrc(value = '') {
  const lines = [];
  const re = /\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]\s*(.*)$/;
  for (const raw of String(value).split(/\r?\n/)) {
    const match = raw.match(re);
    if (!match) continue;
    const time = Number(match[1]) * 60 + Number(match[2]);
    if (!Number.isFinite(time)) continue;
    lines.push({ time, text: match[3].trim() });
  }
  return lines.sort((left, right) => left.time - right.time);
}

export function currentLyricIndex(lines, position) {
  let found = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].time <= position) found = index;
    else break;
  }
  return found;
}

export function safeJsonParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}
