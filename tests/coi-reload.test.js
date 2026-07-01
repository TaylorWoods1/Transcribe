import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearCoiReloadAttempts,
  getCoiReloadAttempts,
  recordCoiReloadAttempt,
  shouldAutoReloadForCoi,
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
    expect(shouldAutoReloadForCoi(session)).toBe(false);
  });

  it('clears attempts', () => {
    recordCoiReloadAttempt(session);
    clearCoiReloadAttempts(session);
    expect(getCoiReloadAttempts(session)).toBe(0);
    expect(shouldAutoReloadForCoi(session)).toBe(true);
  });
});
