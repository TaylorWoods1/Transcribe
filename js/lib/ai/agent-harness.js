/**
 * Vendor-agnostic agent harness for background clinical AI tasks.
 *
 * Architecture:
 * - Tasks (`ai-tasks.js`) define prompts + result normalization
 * - Providers (`providers/`) translate requests to vendor HTTP APIs
 * - Harness orchestrates a single-step agent run today; structured for
 *   future multi-step tool loops without changing call sites in `ai.js`
 */
import { normalizeAiSettings, isAiConfigured } from './ai-settings.js';
import { getAgentTask } from './ai-tasks.js';
import { getProvider } from './providers/index.js';
import { parseJsonText } from './parse.js';

/**
 * @typedef {object} AgentRunOptions
 * @property {import('./ai-settings.js').AiSettings} [settings]
 * @property {boolean} [throwOnError]
 */

/**
 * @typedef {object} AgentStep
 * @property {string} taskId
 * @property {import('./ai-tasks.js').AgentTaskContext} context
 */

/**
 * Run one harness task through the configured provider.
 * @param {string} taskId
 * @param {import('./ai-tasks.js').AgentTaskContext} context
 * @param {AgentRunOptions} [options]
 * @returns {Promise<object|null>}
 */
export async function runAgentTask(taskId, context, { settings, throwOnError = true } = {}) {
  const normalizedSettings = normalizeAiSettings(settings);
  if (!isAiConfigured(normalizedSettings)) {
    if (throwOnError) throw new Error('AI is not configured.');
    return null;
  }

  const task = getAgentTask(taskId);
  const provider = getProvider(normalizedSettings.provider);
  const request = {
    system: task.system(context),
    user: task.buildUser(context),
    temperature: task.temperature,
    jsonMode: true,
  };

  const raw = await provider.complete(normalizedSettings, request, { throwOnError });
  if (!raw) return null;

  const text = provider.extractText(raw);
  const parsed = parseJsonText(text, taskId.startsWith('summary') ? { summary: text, sourceSegmentIds: [] } : {});
  try {
    return task.normalize(parsed, context);
  } catch (err) {
    if (throwOnError) throw err;
    return null;
  }
}

/**
 * Execute an ordered list of agent steps (single provider session).
 * Extension point for future tool-calling / reflection loops.
 * @param {AgentStep[]} steps
 * @param {AgentRunOptions} [options]
 * @returns {Promise<object[]>}
 */
export async function runAgentPlan(steps, options = {}) {
  const results = [];
  for (const step of steps) {
    const result = await runAgentTask(step.taskId, step.context, options);
    results.push(result);
  }
  return results;
}
