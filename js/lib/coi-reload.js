import { STORAGE_KEYS } from './storage-keys.js';

const COI_KEY = STORAGE_KEYS.COI_RELOAD;
const MAX_AUTO_RELOADS = 2;

export function getCoiReloadAttempts(session = sessionStorage) {
  return parseInt(session.getItem(COI_KEY) || '0', 10);
}

export function clearCoiReloadAttempts(session = sessionStorage) {
  session.removeItem(COI_KEY);
}

export function recordCoiReloadAttempt(session = sessionStorage) {
  const next = getCoiReloadAttempts(session) + 1;
  session.setItem(COI_KEY, String(next));
  return next;
}

export function shouldAutoReloadForCoi(session = sessionStorage) {
  return getCoiReloadAttempts(session) < MAX_AUTO_RELOADS;
}

/**
 * @param {{ clearCaches?: boolean, cacheBust?: boolean, resetAttempts?: boolean }} [options]
 */
export async function reloadForCrossOriginIsolation(options = {}) {
  const { clearCaches = true, cacheBust = true, resetAttempts = false } = options;
  if (resetAttempts) clearCoiReloadAttempts();

  if (clearCaches && 'caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.waiting?.postMessage({ type: 'skipWaiting' });
      await reg.update();
    } catch {
      /* ignore */
    }
  }

  if (!cacheBust) {
    window.location.reload();
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('coi');
  url.searchParams.set('coi', Date.now().toString(36));
  window.location.replace(`${url.pathname}${url.search}${url.hash}`);
}
