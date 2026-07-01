import { describe, it, expect, beforeEach } from 'vitest';
import { migrateStorageKeys, STORAGE_KEYS, readJsonStorage } from '../js/lib/storage-keys.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

describe('migrateStorageKeys', () => {
  let storage;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it('migrates legacy lucy keys to tiger keys', () => {
    storage.setItem('lucy-app-settings', JSON.stringify({ language: 'en-AU' }));
    migrateStorageKeys(storage);
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.APP_SETTINGS)).language).toBe('en-AU');
  });

  it('does not overwrite existing tiger keys', () => {
    storage.setItem('lucy-app-settings', JSON.stringify({ language: 'en-US' }));
    storage.setItem(STORAGE_KEYS.APP_SETTINGS, JSON.stringify({ language: 'en-AU' }));
    migrateStorageKeys(storage);
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.APP_SETTINGS)).language).toBe('en-AU');
  });
});

describe('readJsonStorage', () => {
  it('returns empty object for invalid JSON', () => {
    const storage = createMemoryStorage();
    storage.setItem('bad', '{not json');
    expect(readJsonStorage('bad', storage)).toEqual({});
  });
});
