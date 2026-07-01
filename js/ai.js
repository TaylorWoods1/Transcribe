/**
 * AI summarization (optional OpenAI-compatible API) + extractive fallback.
 */
import { generateNotesFromSegments } from './notes.js';
import { buildTranscriptText } from './lib/clinical.js';
import { createId } from './db.js';
import {
  STORAGE_KEYS,
  readJsonStorage,
  writeJsonStorage,
} from './lib/storage-keys.js';
import {
  chatCompletion,
  isAiConfigured,
  parseJsonMessageContent,
} from './lib/ai-client.js';

/**
 * @returns {import('./lib/ai-client.js').AiSettings}
 */
export function getAiSettings() {
  return readJsonStorage(STORAGE_KEYS.AI_SETTINGS);
}

/** @param {import('./lib/ai-client.js').AiSettings} settings */
export function saveAiSettings(settings) {
  writeJsonStorage(STORAGE_KEYS.AI_SETTINGS, settings);
}

export function hasAiConfigured() {
  return isAiConfigured(getAiSettings());
}

export async function generateSoapNote(encounter) {
  const { segments, speakers } = encounter;
  if (hasAiConfigured()) {
    return callAi(encounter, 'soap');
  }
  return generateNotesFromSegments(segments, speakers);
}

export async function generateSummary(encounter, type = 'concise') {
  if (hasAiConfigured()) {
    return callAi(encounter, type);
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

async function callAi(encounter, mode) {
  const settings = getAiSettings();
  const transcript = buildTranscriptText(encounter.segments, encounter.speakers);
  const system = `You are a clinical documentation assistant. Output valid JSON only. Link content to transcript segment IDs when possible. Never provide medical advice — documentation support only.`;
  const prompts = {
    soap: `Generate a SOAP note from this transcript. Return JSON: {"subjective":"","objective":"","assessment":"","plan":"","sourceSegmentIds":[]}\n\n${transcript}`,
    concise: `Summarize this encounter in 2-4 sentences. Return JSON: {"summary":"","sourceSegmentIds":[]}\n\n${transcript}`,
    patient: `Write a patient-friendly summary (plain language, no jargon). Return JSON: {"summary":"","sourceSegmentIds":[]}\n\n${transcript}`,
  };

  const data = await chatCompletion(settings, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompts[mode] || prompts.concise },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  return parseJsonMessageContent(data);
}

export async function extractActionsWithAi(encounter, ruleBasedActions) {
  if (!hasAiConfigured()) return ruleBasedActions;
  const settings = getAiSettings();
  const transcript = buildTranscriptText(encounter.segments, encounter.speakers);

  const data = await chatCompletion(
    settings,
    {
      messages: [
        {
          role: 'system',
          content:
            'Extract action items from clinical transcripts. Return JSON: {"actions":[{"text":"","sourceSegmentId":""}]}',
        },
        { role: 'user', content: transcript },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    },
    { throwOnError: false }
  );

  if (!data) return ruleBasedActions;

  try {
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    const aiActions = (parsed.actions || []).map((a) => ({
      id: createId('act'),
      text: a.text,
      done: false,
      sourceSegmentId: a.sourceSegmentId || null,
      createdAt: Date.now(),
    }));
    const seen = new Set(ruleBasedActions.map((a) => a.text.toLowerCase()));
    const merged = [...ruleBasedActions];
    for (const a of aiActions) {
      if (!seen.has(a.text.toLowerCase())) {
        seen.add(a.text.toLowerCase());
        merged.push(a);
      }
    }
    return merged;
  } catch {
    return ruleBasedActions;
  }
}

/** Real-time assist suggestions from live transcript (optional API). */
export async function generateLiveAssistWithAi({ segments, speakers }) {
  if (!hasAiConfigured()) return null;
  const settings = getAiSettings();
  const transcript = buildTranscriptText(segments, speakers, { finalsOnly: true });
  if (!transcript.trim()) return null;

  const data = await chatCompletion(
    settings,
    {
      messages: [
        {
          role: 'system',
          content:
            'You are a clinical documentation and consultation-support assistant. Suggest follow-up questions, empathic response phrasing, and differential diagnoses to CONSIDER — not definitive diagnoses. Output valid JSON only. Never state medical advice as fact. Documentation support only.',
        },
        {
          role: 'user',
          content: `Based on this partial live encounter transcript, suggest up to 4 follow-up questions, 3 response phrases the clinician could use, and up to 4 differential diagnoses to consider (with urgency: routine or urgent). Return JSON:
{"questions":[{"text":"","reason":""}],"responses":[{"text":"","type":"empathy|clarify|plan|safety"}],"differentials":[{"text":"","urgency":"routine|urgent","reason":""}]}

Transcript:
${transcript}`,
        },
      ],
      temperature: 0.35,
      response_format: { type: 'json_object' },
    },
    { throwOnError: false }
  );

  if (!data) return null;

  try {
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    return {
      questions: (parsed.questions || []).filter((q) => q.text?.trim()),
      responses: (parsed.responses || []).filter((r) => r.text?.trim()),
      differentials: (parsed.differentials || []).filter((d) => d.text?.trim()),
      considerations: [],
      source: 'ai',
      updatedAt: Date.now(),
      segmentCount: (segments || []).length,
    };
  } catch {
    return null;
  }
}
