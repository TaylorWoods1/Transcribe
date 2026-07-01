/**
 * Insights: entities, questions, red-flag detection, extractive summary.
 */
import { buildTranscriptText, detectRedFlags, getDisclaimer } from './lib/clinical.js';

export { getDisclaimer };

/**
 * @param {{ segments?: Array, speakers?: Array }} encounter
 * @returns {{ summary: string, entities: Array, questions: Array, considerations: Array }}
 */
export function analyzeEncounter(encounter) {
  const text = buildTranscriptText(encounter.segments, encounter.speakers);
  return {
    summary: extractiveSummary(text),
    entities: extractEntities(text),
    questions: extractQuestions(encounter.segments),
    considerations: detectRedFlags(text),
  };
}

function extractiveSummary(text) {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  if (!sentences.length) return 'No transcript content yet.';
  return sentences.slice(0, 4).join('. ') + (sentences.length > 4 ? '.' : '');
}

function extractEntities(text) {
  const entities = [];
  const patterns = [
    {
      type: 'medication',
      regex:
        /\b(?:mg|mcg|ml|tablet|capsule|inhaler|insulin|paracetamol|ibuprofen|aspirin|metformin|amoxicillin)\b[^.!?]{0,40}/gi,
    },
    {
      type: 'condition',
      regex: /\b(?:diabetes|hypertension|asthma|depression|anxiety|copd|arthritis|migraine|infection|fracture)\b/gi,
    },
    {
      type: 'procedure',
      regex: /\b(?:x-ray|xray|mri|ct scan|ultrasound|blood test|ecg|ekg|biopsy)\b/gi,
    },
  ];
  for (const { type, regex } of patterns) {
    regex.lastIndex = 0;
    const matches = text.match(regex);
    if (matches) {
      for (const m of [...new Set(matches)].slice(0, 5)) {
        entities.push({ type, value: m.trim() });
      }
    }
  }
  return entities;
}

function extractQuestions(segments) {
  const questions = [];
  for (const seg of segments || []) {
    const matches = (seg.text || '').match(/[^.!?]*\?+/g);
    if (matches) {
      for (const q of matches) {
        const trimmed = q.trim();
        if (trimmed.length > 5) {
          questions.push({ text: trimmed, segmentId: seg.id });
        }
      }
    }
  }
  return questions.slice(0, 10);
}
