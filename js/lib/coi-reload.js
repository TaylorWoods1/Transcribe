import { STORAGE_KEYS } from './storage-keys.js';

const COI_KEY = STORAGE_KEYS.COI_RELOAD;
const COEP_MODE_KEY = 'tiger-coi-coep-mode';
const RELOAD_REASON_KEY = 'tiger-coi-reload-reason';
const MAX_AUTO_RELOADS = 3;

export function getCoiReloadAttempts(session = sessionStorage) {
  return parseInt(session.getItem(COI_KEY) || '0', 10);
}

export function clearCoiReloadAttempts(session = sessionStorage) {
  session.removeItem(COI_KEY);
  session.removeItem(RELOAD_REASON_KEY);
  session.removeItem(COEP_MODE_KEY);
}

export function recordCoiReloadAttempt(session = sessionStorage) {
  const next = getCoiReloadAttempts(session) + 1;
  session.setItem(COI_KEY, String(next));
  return next;
}

export function shouldAutoReloadForCoi(session = sessionStorage) {
  return getCoiReloadAttempts(session) < MAX_AUTO_RELOADS;
}

export function isCoepDegradeReload(session = sessionStorage) {
  return session.getItem(RELOAD_REASON_KEY) === 'coepdegrade';
}

export function getStoredCoepMode(session = sessionStorage) {
  return session.getItem(COEP_MODE_KEY) || 'credentialless';
}

/** @param {ServiceWorker | null | undefined} controller */
export function getCoepCredentiallessForSw(controller, session = sessionStorage) {
  if (!controller) return true;
  return getStoredCoepMode(session) !== 'require-corp';
}

/** @param {ServiceWorker | null | undefined} controller */
export function notifyServiceWorkerCoepMode(controller, session = sessionStorage) {
  controller?.postMessage({
    type: 'coepCredentialless',
    value: getCoepCredentiallessForSw(controller, session),
  });
}

/**
 * Negotiate cross-origin isolation: credentialless first, then require-corp.
 * @returns {'reload' | 'ready' | 'waiting'}
 */
export function syncCrossOriginIsolation(session = sessionStorage) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return 'ready';
  }

  if (window.crossOriginIsolated) {
    clearCoiReloadAttempts(session);
    return 'ready';
  }

  const controller = navigator.serviceWorker.controller;
  if (!controller) return 'waiting';

  notifyServiceWorkerCoepMode(controller, session);

  if (!shouldAutoReloadForCoi(session)) return 'waiting';

  const attempts = getCoiReloadAttempts(session);
  const mode = getStoredCoepMode(session);

  // First reload: SW may not have served this document yet — try credentialless.
  if (attempts === 0) {
    session.setItem(COEP_MODE_KEY, 'credentialless');
    session.removeItem(RELOAD_REASON_KEY);
    notifyServiceWorkerCoepMode(controller, session);
    return 'reload';
  }

  // Second reload: credentialless did not isolate — degrade to require-corp.
  if (attempts === 1 && mode !== 'require-corp') {
    session.setItem(COEP_MODE_KEY, 'require-corp');
    session.setItem(RELOAD_REASON_KEY, 'coepdegrade');
    notifyServiceWorkerCoepMode(controller, session);
    return 'reload';
  }

  return 'waiting';
}

export function getActiveCoepModeLabel(session = sessionStorage) {
  return getStoredCoepMode(session);
}

/**
 * @param {{ clearCaches?: boolean, cacheBust?: boolean, resetAttempts?: boolean, degradeCoep?: boolean }} [options]
 */
export async function reloadForCrossOriginIsolation(options = {}) {
  const {
    clearCaches = true,
    cacheBust = true,
    resetAttempts = false,
    degradeCoep = false,
  } = options;
  if (resetAttempts) clearCoiReloadAttempts();

  if (degradeCoep) {
    sessionStorage.setItem(COEP_MODE_KEY, 'require-corp');
    sessionStorage.setItem(RELOAD_REASON_KEY, 'coepdegrade');
  } else if (resetAttempts) {
    sessionStorage.setItem(COEP_MODE_KEY, 'credentialless');
    sessionStorage.removeItem(RELOAD_REASON_KEY);
  }

  notifyServiceWorkerCoepMode(navigator.serviceWorker?.controller);

  if (clearCaches && 'caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.waiting?.postMessage({ type: 'skipWaiting' });
      await reg.update();
      notifyServiceWorkerCoepMode(reg.active);
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
