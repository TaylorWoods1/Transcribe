/**
 * Shared pure utilities — formatting, text, speakers, sanitization.
 */

/**
 * Escape HTML for safe insertion into innerHTML templates.
 * @param {unknown} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitize CSS color values from user settings (hex only).
 * @param {string} color
 * @param {string} [fallback]
 * @returns {string}
 */
export function sanitizeColor(color, fallback = '#666666') {
  const c = String(color || '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fallback;
}

/**
 * @param {number} ts
 * @returns {string}
 */
export function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * @param {number} ms
 * @returns {string}
 */
export function formatTimestamp(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * @param {number} ms
 * @returns {string}
 */
export function toSrtTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msRem = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(msRem).padStart(3, '0')}`;
}

/**
 * @param {number} ms
 * @returns {string}
 */
export function toVttTime(ms) {
  return toSrtTime(ms).replace(',', '.');
}

/**
 * @param {Array<{id: string, name?: string}>} speakers
 * @returns {Record<string, {id: string, name?: string}>}
 */
export function speakerMap(speakers) {
  return Object.fromEntries((speakers || []).map((s) => [s.id, s]));
}

/**
 * @param {Array<{id: string, name?: string}>} speakers
 * @param {string} id
 * @param {string} [fallback]
 * @returns {string}
 */
export function speakerName(speakers, id, fallback = 'Speaker') {
  return speakers?.find((s) => s.id === id)?.name || fallback;
}

/**
 * @param {Array<{id: string}>} speakers
 * @param {string} currentId
 * @returns {{id: string}|null}
 */
export function nextSpeaker(speakers, currentId) {
  if (!speakers?.length) return null;
  const idx = speakers.findIndex((s) => s.id === currentId);
  return speakers[(idx + 1) % speakers.length] || speakers[0];
}

/**
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} title
 * @param {number} [maxLen]
 * @returns {string}
 */
export function safeFilename(title, maxLen = 60) {
  return (title || 'encounter').replace(/[^\w-]+/g, '_').slice(0, maxLen);
}

/**
 * Clamp numeric progress for style attributes.
 * @param {number|null|undefined} value
 * @returns {number}
 */
export function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}
