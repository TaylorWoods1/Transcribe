/**
 * Clinical AI facade — uses vendor-agnostic agent harness with extractive fallbacks.
 */
import { generateNotesFromSegments } from './notes.js';
import { buildTranscriptText } from './lib/clinical.js';
import {
  STORAGE_KEYS,
  readJsonStorage,
  writeJsonStorage,
} from './lib/storage-keys.js';
import {
  getDefaultAiSettings,
  isAiConfigured,
  normalizeAiSettings,
} from './lib/ai/ai-settings.js';
import { runAgentTask } from './lib/ai/agent-harness.js';

/**
 * @returns {import('./lib/ai/ai-settings.js').AiSettings}
 */
export function getAiSettings() {
  return normalizeAiSettings(readJsonStorage(STORAGE_KEYS.AI_SETTINGS));
}

/** @param {Partial<import('./lib/ai/ai-settings.js').AiSettings>} settings */
export function saveAiSettings(settings) {
  writeJsonStorage(STORAGE_KEYS.AI_SETTINGS, normalizeAiSettings({
    ...getAiSettings(),
    ...settings,
  }));
}

export function hasAiConfigured() {
  return isAiConfigured(getAiSettings());
}

export { getDefaultAiSettings };

export async function generateSoapNote(encounter) {
  if (hasAiConfigured()) {
    return runAgentTask('soap', { encounter }, { settings: getAiSettings() });
  }
  return generateNotesFromSegments(encounter.segments, encounter.speakers);
}

export async function generateSummary(encounter, type = 'concise') {
  if (hasAiConfigured()) {
    const taskId = type === 'patient' ? 'summary-patient' : 'summary-concise';
    return runAgentTask(taskId, { encounter }, { settings: getAiSettings() });
  }
  const notes = generateNotesFromSegments(encounter.segments, encounter.speakers);
  if (type === 'patient') {
    return {
      summary: `During your visit we discussed: ${notes.subjective || 'your concerns'}. The plan is: ${notes.plan || 'to follow up as discussed.'}`,
      sourceSegmentIds: encounter.segments.map((s) => s.id),
    };
  }
  return {
    summary: [notes.subjective, notes.assessment, notes.plan].filter(Boolean).join(' '),
    sourceSegmentIds: encounter.segments.map((s) => s.id),
  };
}

export async function extractActionsWithAi(encounter, ruleBasedActions) {
  if (!hasAiConfigured()) return ruleBasedActions;
  const result = await runAgentTask(
    'extract-actions',
    { encounter, ruleBasedActions },
    { settings: getAiSettings(), throwOnError: false }
  );
  return result || ruleBasedActions;
}

/** Real-time assist suggestions from live transcript (optional API). */
export async function generateLiveAssistWithAi({ segments, speakers }) {
  if (!hasAiConfigured()) return null;
  if (!buildTranscriptText(segments, speakers, { finalsOnly: true }).trim()) return null;

  return runAgentTask(
    'live-assist',
    { segments, speakers },
    { settings: getAiSettings(), throwOnError: false }
  );
}
