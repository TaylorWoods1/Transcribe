import { CONFIG } from '../../config.js';
import { readJsonStorage, writeJsonStorage, STORAGE_KEYS } from './storage-keys.js';

const APP_SETTINGS_KEY = STORAGE_KEYS.APP_SETTINGS;

function asBool(value, fallback = false) {
  if (value === true || value === 'true' || value === 'on' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 'off' || value === 0 || value === '0') return false;
  return fallback;
}

export function getDefaultAppSettings() {
  return {
    timezone: CONFIG.defaultTimezone,
    language: CONFIG.defaultLanguage,
    enhancedTranscription: false,
    liveAssistEnabled: true,
    liveAssistAi: true,
    speakers: [...CONFIG.defaultSpeakers],
    darkMode: null,
  };
}

export function getAppSettings() {
  try {
    const saved = readJsonStorage(APP_SETTINGS_KEY);
    const defaults = getDefaultAppSettings();
    return {
      ...defaults,
      ...saved,
      enhancedTranscription: asBool(saved.enhancedTranscription, defaults.enhancedTranscription),
      liveAssistEnabled: asBool(saved.liveAssistEnabled, defaults.liveAssistEnabled),
      liveAssistAi: asBool(saved.liveAssistAi, defaults.liveAssistAi),
      speakers: saved.speakers?.length ? saved.speakers : defaults.speakers,
    };
  } catch {
    return getDefaultAppSettings();
  }
}

/** @param {Partial<ReturnType<typeof getDefaultAppSettings>>} partial */
export function saveAppSettings(partial) {
  const current = getAppSettings();
  const next = {
    ...current,
    ...partial,
    speakers: partial.speakers ?? current.speakers,
  };
  writeJsonStorage(APP_SETTINGS_KEY, next);
  return next;
}
