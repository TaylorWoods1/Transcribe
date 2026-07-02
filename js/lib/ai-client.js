/**
 * Backward-compatible re-exports for the OpenAI-compatible provider.
 * New code should use `js/lib/ai/agent-harness.js` and `js/lib/ai/ai-settings.js`.
 */
import { isAiConfigured, normalizeAiSettings } from './ai/ai-settings.js';
import {
  complete as openAiComplete,
  normalizeBaseUrl,
  parseJsonMessageContent,
  extractText,
} from './ai/providers/openai-compatible.js';

export { isAiConfigured, normalizeBaseUrl, parseJsonMessageContent };

/**
 * @typedef {import('./ai/ai-settings.js').AiSettings} AiSettings
 */

/**
 * OpenAI-compatible chat completion — legacy entry point.
 * @param {AiSettings} settings
 * @param {object} body
 * @param {{ throwOnError?: boolean }} [options]
 * @returns {Promise<object|null>}
 */
export async function chatCompletion(settings, body, options = {}) {
  const normalized = normalizeAiSettings({ ...settings, provider: 'openai-compatible' });
  const messages = body.messages || [];
  const system = messages.find((m) => m.role === 'system')?.content || '';
  const user = messages.find((m) => m.role === 'user')?.content || '';
  return openAiComplete(
    normalized,
    {
      system,
      user,
      temperature: body.temperature,
      jsonMode: body.response_format?.type === 'json_object',
    },
    options
  );
}

export { extractText };
