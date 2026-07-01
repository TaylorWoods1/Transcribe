import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearCoiReloadAttempts,
  getCoiReloadAttempts,
  getCoepCredentiallessForSw,
  getStoredCoepMode,
  recordCoiReloadAttempt,
  shouldAutoReloadForCoi,
  syncCrossOriginIsolation,
} from '../js/lib/coi-reload.js';
import { STORAGE_KEYS } from '../js/lib/storage-keys.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

describe('coi-reload', () => {
  let session;

  beforeEach(() => {
    session = createMemoryStorage();
  });

  it('tracks auto-reload attempts in session storage', () => {
    expect(getCoiReloadAttempts(session)).toBe(0);
    expect(recordCoiReloadAttempt(session)).toBe(1);
    expect(recordCoiReloadAttempt(session)).toBe(2);
    expect(session.getItem(STORAGE_KEYS.COI_RELOAD)).toBe('2');
  });

  it('stops auto reload after the limit', () => {
    recordCoiReloadAttempt(session);
    recordCoiReloadAttempt(session);
    recordCoiReloadAttempt(session);
    expect(shouldAutoReloadForCoi(session)).toBe(false);
  });

  it('clears attempts and COEP mode', () => {
    recordCoiReloadAttempt(session);
    session.setItem('tiger-coi-coep-mode', 'require-corp');
    clearCoiReloadAttempts(session);
    expect(getCoiReloadAttempts(session)).toBe(0);
    expect(getStoredCoepMode(session)).toBe('credentialless');
    expect(shouldAutoReloadForCoi(session)).toBe(true);
  });

  it('defaults to credentialless for the service worker', () => {
    const controller = { postMessage: vi.fn() };
    expect(getCoepCredentiallessForSw(controller, session)).toBe(true);
  });

  it('uses require-corp after degrade is stored', () => {
    const controller = { postMessage: vi.fn() };
    session.setItem('tiger-coi-coep-mode', 'require-corp');
    expect(getCoepCredentiallessForSw(controller, session)).toBe(false);
  });

  it('requests credentialless reload before require-corp degrade', () => {
    const controller = { postMessage: vi.fn() };
    vi.stubGlobal('window', {
      crossOriginIsolated: false,
      serviceWorker: { controller },
    });
    vi.stubGlobal('navigator', { serviceWorker: { controller } });

    expect(syncCrossOriginIsolation(session)).toBe('reload');
    expect(getStoredCoepMode(session)).toBe('credentialless');

    recordCoiReloadAttempt(session);
    expect(syncCrossOriginIsolation(session)).toBe('reload');
    expect(getStoredCoepMode(session)).toBe('require-corp');

    recordCoiReloadAttempt(session);
    expect(syncCrossOriginIsolation(session)).toBe('waiting');

    vi.unstubAllGlobals();
  });
});
