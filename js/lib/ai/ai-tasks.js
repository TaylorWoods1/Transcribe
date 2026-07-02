/**
 * Clinical AI task definitions for the agent harness.
 * Each task declares prompts, temperature, and result normalization.
 */
import { buildTranscriptText } from '../clinical.js';
import { createId } from '../../db.js';

const DOCUMENTATION_SYSTEM =
  'You are a clinical documentation assistant. Output valid JSON only. Link content to transcript segment IDs when possible. Never provide medical advice — documentation support only.';

const LIVE_ASSIST_SYSTEM =
  'You are a clinical documentation and consultation-support assistant. Suggest follow-up questions, empathic response phrasing, and differential diagnoses to CONSIDER — not definitive diagnoses. Output valid JSON only. Never state medical advice as fact. Documentation support only.';

/**
 * @typedef {object} AgentTaskContext
 * @property {import('../types.js').Encounter} [encounter]
 * @property {import('../types.js').Segment[]} [segments]
 * @property {import('../types.js').Speaker[]} [speakers]
 * @property {import('../types.js').ActionItem[]} [ruleBasedActions]
 * @property {string} [summaryType]
 */

/**
 * @typedef {object} AgentTaskDefinition
 * @property {string} id
 * @property {(context: AgentTaskContext) => string} system
 * @property {(context: AgentTaskContext) => string} buildUser
 * @property {number} temperature
 * @property {(parsed: object, context: AgentTaskContext) => object} normalize
 */

/** @type {Record<string, AgentTaskDefinition>} */
export const AI_TASKS = Object.freeze({
  soap: {
    id: 'soap',
    system: () => DOCUMENTATION_SYSTEM,
    buildUser: ({ encounter }) => {
      const transcript = buildTranscriptText(encounter.segments, encounter.speakers);
      return `Generate a SOAP note from this transcript. Return JSON: {"subjective":"","objective":"","assessment":"","plan":"","sourceSegmentIds":[]}\n\n${transcript}`;
    },
    temperature: 0.3,
    normalize: (parsed) => ({
      subjective: parsed.subjective || '',
      objective: parsed.objective || '',
      assessment: parsed.assessment || '',
      plan: parsed.plan || '',
      freeform: parsed.freeform || '',
      sourceSegmentIds: parsed.sourceSegmentIds || [],
    }),
  },

  'summary-concise': {
    id: 'summary-concise',
    system: () => DOCUMENTATION_SYSTEM,
    buildUser: ({ encounter }) => {
      const transcript = buildTranscriptText(encounter.segments, encounter.speakers);
      return `Summarize this encounter in 2-4 sentences. Return JSON: {"summary":"","sourceSegmentIds":[]}\n\n${transcript}`;
    },
    temperature: 0.3,
    normalize: (parsed) => ({
      summary: parsed.summary || '',
      sourceSegmentIds: parsed.sourceSegmentIds || [],
    }),
  },

  'summary-patient': {
    id: 'summary-patient',
    system: () => DOCUMENTATION_SYSTEM,
    buildUser: ({ encounter }) => {
      const transcript = buildTranscriptText(encounter.segments, encounter.speakers);
      return `Write a patient-friendly summary (plain language, no jargon). Return JSON: {"summary":"","sourceSegmentIds":[]}\n\n${transcript}`;
    },
    temperature: 0.3,
    normalize: (parsed) => ({
      summary: parsed.summary || '',
      sourceSegmentIds: parsed.sourceSegmentIds || [],
    }),
  },

  'extract-actions': {
    id: 'extract-actions',
    system: () =>
      'Extract action items from clinical transcripts. Return JSON: {"actions":[{"text":"","sourceSegmentId":""}]}',
    buildUser: ({ encounter }) => buildTranscriptText(encounter.segments, encounter.speakers),
    temperature: 0.2,
    normalize: (parsed, { ruleBasedActions = [] }) => {
      const aiActions = (parsed.actions || []).map((a) => ({
        id: createId('act'),
        text: a.text,
        done: false,
        sourceSegmentId: a.sourceSegmentId || null,
        createdAt: Date.now(),
      }));
      const seen = new Set(ruleBasedActions.map((a) => a.text.toLowerCase()));
      const merged = [...ruleBasedActions];
      for (const action of aiActions) {
        if (!action.text?.trim()) continue;
        const key = action.text.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(action);
        }
      }
      return merged;
    },
  },

  'live-assist': {
    id: 'live-assist',
    system: () => LIVE_ASSIST_SYSTEM,
    buildUser: ({ segments, speakers }) => {
      const transcript = buildTranscriptText(segments, speakers, { finalsOnly: true });
      return `Based on this partial live encounter transcript, suggest up to 4 follow-up questions, 3 response phrases the clinician could use, and up to 4 differential diagnoses to consider (with urgency: routine or urgent). Return JSON:
{"questions":[{"text":"","reason":""}],"responses":[{"text":"","type":"empathy|clarify|plan|safety"}],"differentials":[{"text":"","urgency":"routine|urgent","reason":""}]}

Transcript:
${transcript}`;
    },
    temperature: 0.35,
    normalize: (parsed, { segments = [] }) => ({
      questions: (parsed.questions || []).filter((q) => q.text?.trim()),
      responses: (parsed.responses || []).filter((r) => r.text?.trim()),
      differentials: (parsed.differentials || []).filter((d) => d.text?.trim()),
      considerations: [],
      source: 'ai',
      updatedAt: Date.now(),
      segmentCount: segments.length,
    }),
  },
});

/**
 * @param {string} taskId
 * @returns {AgentTaskDefinition}
 */
export function getAgentTask(taskId) {
  const task = AI_TASKS[taskId];
  if (!task) throw new Error(`Unknown AI task: ${taskId}`);
  return task;
}
