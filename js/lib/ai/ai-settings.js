/**
 * Vendor-agnostic AI settings — defaults, normalization, and configuration checks.
 */

/** @typedef {'gemini' | 'openai-compatible'} AiProviderId */

/**
 * @typedef {object} AiSettings
 * @property {AiProviderId} [provider]
 * @property {string} [apiKey]
 * @property {string} [model]
 * @property {string} [baseUrl] - OpenAI-compatible base URL only
 */

export const AI_PROVIDER_IDS = Object.freeze(['gemini', 'openai-compatible']);

/** Gemini 2.0 models were shut down 2026-06-01 — remap saved settings automatically. */
const DEPRECATED_GEMINI_MODELS = Object.freeze({
  'gemini-2.0-flash': 'gemini-2.5-flash',
  'gemini-2.0-flash-001': 'gemini-2.5-flash',
  'gemini-2.0-flash-exp': 'gemini-2.5-flash',
  'gemini-2.0-flash-lite': 'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite-001': 'gemini-2.5-flash-lite',
  'gemini-1.5-flash': 'gemini-2.5-flash',
  'gemini-1.5-pro': 'gemini-2.5-flash',
});

const PROVIDER_DEFAULTS = Object.freeze({
  gemini: {
    model: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  'openai-compatible': {
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
  },
});

/**
 * @returns {AiSettings}
 */
export function getDefaultAiSettings() {
  return {
    provider: 'gemini',
    apiKey: '',
    model: PROVIDER_DEFAULTS.gemini.model,
    baseUrl: PROVIDER_DEFAULTS.gemini.baseUrl,
  };
}

/**
 * Infer provider from legacy settings saved before provider field existed.
 * @param {Partial<AiSettings>} raw
 * @returns {AiProviderId}
 */
export function inferLegacyProvider(raw) {
  if (raw.provider && AI_PROVIDER_IDS.includes(raw.provider)) return raw.provider;
  const baseUrl = String(raw.baseUrl || '').toLowerCase();
  if (baseUrl.includes('openai.com') || baseUrl.includes('/v1')) return 'openai-compatible';
  if (raw.apiKey?.trim() && !raw.baseUrl?.trim()) return 'gemini';
  return 'gemini';
}

/**
 * @param {Partial<AiSettings>} [raw]
 * @returns {AiSettings}
 */
function migrateGeminiModel(model, fallback) {
  const trimmed = String(model || '').trim();
  if (!trimmed) return fallback;
  return DEPRECATED_GEMINI_MODELS[trimmed] || trimmed;
}

export function normalizeAiSettings(raw = {}) {
  const provider = inferLegacyProvider(raw);
  const defaults = PROVIDER_DEFAULTS[provider];
  const rawModel = String(raw.model || defaults.model).trim() || defaults.model;
  const model =
    provider === 'gemini' ? migrateGeminiModel(rawModel, defaults.model) : rawModel;
  return {
    provider,
    apiKey: String(raw.apiKey || '').trim(),
    model,
    baseUrl: String(raw.baseUrl || defaults.baseUrl).trim() || defaults.baseUrl,
  };
}

/**
 * @param {Partial<AiSettings>} settings
 * @returns {boolean}
 */
export function isAiConfigured(settings) {
  const normalized = normalizeAiSettings(settings);
  if (!normalized.apiKey) return false;
  if (normalized.provider === 'openai-compatible') {
    return !!normalized.baseUrl?.trim();
  }
  return true;
}

/**
 * @param {AiProviderId} providerId
 * @returns {{ label: string, hint: string }}
 */
export function getProviderMeta(providerId) {
  if (providerId === 'openai-compatible') {
    return {
      label: 'OpenAI-compatible',
      hint: 'Any HTTPS endpoint with /chat/completions (OpenAI, local proxies, etc.).',
    };
  }
  return {
    label: 'Google Gemini',
    hint: 'Uses the Gemini generateContent API with your Google AI API key.',
  };
}
