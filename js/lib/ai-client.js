/**
 * Centralized OpenAI-compatible chat/completions client.
 */

const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_ERROR_CHARS = 200;

/**
 * @typedef {object} AiSettings
 * @property {string} [baseUrl]
 * @property {string} [apiKey]
 * @property {string} [model]
 */

/**
 * @param {AiSettings} settings
 * @returns {boolean}
 */
export function isAiConfigured(settings) {
  return !!(settings?.apiKey?.trim() && settings?.baseUrl?.trim());
}

/**
 * Validate user-supplied API base URL (HTTPS only, no credentials in URL).
 * @param {string} baseUrl
 * @returns {string}
 */
export function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim();
  if (!trimmed) throw new Error('API base URL is required.');
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('API base URL is not valid.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:' && !url.hostname.endsWith('localhost')) {
    throw new Error('API base URL must use HTTPS.');
  }
  if (url.username || url.password) {
    throw new Error('API base URL must not contain credentials.');
  }
  return trimmed.replace(/\/$/, '');
}

/**
 * @param {AiSettings} settings
 * @param {object} body - chat completion request body (without model if omitted)
 * @param {{ throwOnError?: boolean }} [options]
 * @returns {Promise<object|null>}
 */
export async function chatCompletion(settings, body, { throwOnError = true } = {}) {
  if (!isAiConfigured(settings)) {
    if (throwOnError) throw new Error('AI is not configured.');
    return null;
  }

  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const url = `${baseUrl}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_MODEL,
      ...body,
    }),
  });

  if (!res.ok) {
    const errText = (await res.text()).slice(0, MAX_ERROR_CHARS);
    if (throwOnError) {
      throw new Error(`AI request failed (${res.status}): ${errText}`);
    }
    return null;
  }

  return res.json();
}

/**
 * @param {object} data - chat completion response
 * @returns {object}
 */
export function parseJsonMessageContent(data) {
  const content = data?.choices?.[0]?.message?.content || '{}';
  try {
    return JSON.parse(content);
  } catch {
    return { summary: content, sourceSegmentIds: [] };
  }
}
