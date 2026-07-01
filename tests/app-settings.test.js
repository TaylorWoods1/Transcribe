import { describe, it, expect, beforeEach } from 'vitest';
import { getAppSettings, saveAppSettings, getDefaultAppSettings } from '../js/lib/app-settings.js';
import { STORAGE_KEYS } from '../js/lib/storage-keys.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

describe('app-settings', () => {
  let storage;

  beforeEach(() => {
    storage = createMemoryStorage();
    globalThis.localStorage = storage;
  });

  it('returns defaults when nothing saved', () => {
    expect(getAppSettings().enhancedTranscription).toBe(false);
  });

  it('persists enhancedTranscription across reads', () => {
    saveAppSettings({ enhancedTranscription: true });
    expect(storage.getItem(STORAGE_KEYS.APP_SETTINGS)).toContain('"enhancedTranscription":true');
    expect(getAppSettings().enhancedTranscription).toBe(true);
  });

  it('merges partial saves without dropping other fields', () => {
    saveAppSettings({ enhancedTranscription: true, language: 'en-NZ' });
    saveAppSettings({ timezone: 'Pacific/Auckland' });
    const settings = getAppSettings();
    expect(settings.enhancedTranscription).toBe(true);
    expect(settings.language).toBe('en-NZ');
    expect(settings.timezone).toBe('Pacific/Auckland');
  });

  it('coerces legacy truthy string values', () => {
    storage.setItem(
      STORAGE_KEYS.APP_SETTINGS,
      JSON.stringify({ enhancedTranscription: 'true' })
    );
    expect(getAppSettings().enhancedTranscription).toBe(true);
  });

  it('keeps default speakers when partial save omits them', () => {
    saveAppSettings({ enhancedTranscription: true });
    expect(getAppSettings().speakers).toEqual(getDefaultAppSettings().speakers);
  });
});
