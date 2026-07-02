/**
 * Provider registry for the agent harness.
 */

import { geminiProvider } from './gemini.js';
import { openAiCompatibleProvider } from './openai-compatible.js';

/** @type {Record<string, typeof geminiProvider>} */
const PROVIDERS = Object.freeze({
  gemini: geminiProvider,
  'openai-compatible': openAiCompatibleProvider,
});

/**
 * @param {import('../ai-settings.js').AiProviderId} providerId
 * @returns {typeof geminiProvider}
 */
export function getProvider(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    throw new Error(`Unknown AI provider: ${providerId}`);
  }
  return provider;
}

export { geminiProvider, openAiCompatibleProvider };
