/**
 * OpenAI-compatible chat/completions provider adapter.
 */

import { normalizeAiSettings } from '../ai-settings.js';

const MAX_ERROR_CHARS = 200;

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
 * @typedef {object} ProviderCompletionRequest
 * @property {string} system
 * @property {string} user
 * @property {number} [temperature]
 * @property {boolean} [jsonMode]
 */

/**
 * @param {import('../ai-settings.js').AiSettings} settings
 * @param {ProviderCompletionRequest} request
 * @param {{ throwOnError?: boolean }} [options]
 * @returns {Promise<object|null>}
 */
export async function complete(settings, request, { throwOnError = true } = {}) {
  const normalized = normalizeAiSettings(settings);
  const baseUrl = normalizeBaseUrl(normalized.baseUrl);
  const url = `${baseUrl}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${normalized.apiKey}`,
    },
    body: JSON.stringify({
      model: normalized.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      temperature: request.temperature ?? 0.3,
      ...(request.jsonMode ? { response_format: { type: 'json_object' } } : {}),
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
 * @param {object} response
 * @returns {string}
 */
export function extractText(response) {
  return response?.choices?.[0]?.message?.content || '';
}

/**
 * @param {object} data - chat completion response
 * @returns {object}
 */
export function parseJsonMessageContent(data) {
  const content = extractText(data) || '{}';
  try {
    return JSON.parse(content);
  } catch {
    return { summary: content, sourceSegmentIds: [] };
  }
}

export const openAiCompatibleProvider = {
  id: 'openai-compatible',
  complete,
  extractText,
};
