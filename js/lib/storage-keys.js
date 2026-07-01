/**
 * Centralized localStorage keys with one-time migration from legacy "lucy-*" names.
 */

export const STORAGE_KEYS = Object.freeze({
  APP_SETTINGS: 'tiger-app-settings',
  AI_SETTINGS: 'tiger-ai-settings',
  THEME: 'tiger-theme',
  WHISPER_STATUS: 'tiger-whisper-status',
  COI_RELOAD: 'tiger-coi-reload',
  DEPLOY_ID: 'tiger-deploy-id',
  INSTALL_PROMPT_DISMISSED: 'tiger-install-prompt-dismissed',
  DB_FLAGS: 'tiger-db-flags',
});

const LEGACY_MAP = Object.freeze({
  [STORAGE_KEYS.APP_SETTINGS]: 'lucy-app-settings',
  [STORAGE_KEYS.AI_SETTINGS]: 'lucy-ai-settings',
  [STORAGE_KEYS.THEME]: 'lucy-theme',
});

/**
 * Copy legacy localStorage values to tiger-* keys when missing.
 * Safe to call on every app init.
 */
export function migrateStorageKeys(storage = localStorage) {
  for (const [current, legacy] of Object.entries(LEGACY_MAP)) {
    if (!storage.getItem(current) && storage.getItem(legacy)) {
      storage.setItem(current, storage.getItem(legacy));
    }
  }
}

/**
 * @param {string} key
 * @param {Storage} [storage]
 * @returns {object}
 */
export function readJsonStorage(key, storage = localStorage) {
  try {
    return JSON.parse(storage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

/**
 * @param {string} key
 * @param {object} value
 * @param {Storage} [storage]
 */
export function writeJsonStorage(key, value, storage = localStorage) {
  storage.setItem(key, JSON.stringify(value));
}
