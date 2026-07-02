/**
 * Google Gemini generateContent provider adapter.
 */

import { normalizeAiSettings } from '../ai-settings.js';

const MAX_ERROR_CHARS = 200;

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
  const baseUrl = String(normalized.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(
    /\/$/,
    ''
  );
  const url = `${baseUrl}/models/${encodeURIComponent(normalized.model)}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': normalized.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: request.system }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: request.user }],
        },
      ],
      generationConfig: {
        temperature: request.temperature ?? 0.3,
        ...(request.jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });

  if (!res.ok) {
    const errText = (await res.text()).slice(0, MAX_ERROR_CHARS);
    if (throwOnError) {
      throw new Error(`Gemini request failed (${res.status}): ${errText}`);
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
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((part) => part.text || '').join('').trim();
}

export const geminiProvider = {
  id: 'gemini',
  complete,
  extractText,
};
