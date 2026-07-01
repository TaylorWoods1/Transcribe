/**
 * SOAP note templates and generation helpers.
 */
import { buildTranscriptText, getDisclaimer } from './lib/clinical.js';

export { buildTranscriptText, getDisclaimer };

export function emptyNotes() {
  return { subjective: '', objective: '', assessment: '', plan: '', freeform: '' };
}

/** Extractive note generation from transcript segments */
export function generateNotesFromSegments(segments, speakers) {
  const transcript = buildTranscriptText(segments, speakers);
  const lines = transcript.split('\n').filter(Boolean);
  const patientLines = lines.filter((l) => /patient/i.test(l.split(':')[0]));

  const subjective = patientLines.map((l) => l.replace(/^[^:]+:\s*/, '')).join(' ').trim();
  const objective = extractObjective(transcript);
  const assessment = extractAssessment(transcript);
  const plan = extractPlan(transcript);

  return {
    subjective: subjective || summarizeLines(patientLines.length ? patientLines : lines.slice(0, Math.ceil(lines.length / 2))),
    objective: objective || 'See transcript for observed findings.',
    assessment: assessment || 'Clinical assessment to be confirmed by treating clinician.',
    plan: plan || extractPlanFromActions(transcript),
    freeform: '',
  };
}

function summarizeLines(lines) {
  return lines
    .map((l) => l.replace(/^[^:]+:\s*/, ''))
    .join(' ')
    .slice(0, 800);
}

function extractObjective(text) {
  const patterns = [
    /\b(?:vitals?|bp|blood pressure|heart rate|temp|temperature|spo2|oxygen|weight|bmi)[^.!?]{0,120}/gi,
    /\b(?:exam(?:ination)?|appears|observed|noted|auscultation|palpation)[^.!?]{0,120}/gi,
  ];
  const hits = [];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) hits.push(...m);
  }
  return [...new Set(hits)].join('. ').trim();
}

function extractAssessment(text) {
  const patterns = [/\b(?:diagnosis|impression|assessment|likely|consistent with|suspected)[^.!?]{0,150}/gi];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.length) return m.slice(0, 3).join('. ');
  }
  return '';
}

function extractPlan(text) {
  const patterns = [/\b(?:plan|will|follow[- ]?up|prescribe|refer|order|arrange|advise|recommend)[^.!?]{0,150}/gi];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.length) return m.slice(0, 5).join('. ');
  }
  return '';
}

function extractPlanFromActions(text) {
  const actions = text.match(/\b(?:will|should|need to|follow up|refer|prescribe|book|schedule)[^.!?]{10,100}/gi);
  return actions ? actions.slice(0, 4).join('. ') : '';
}

export const NOTE_SECTIONS = [
  { key: 'subjective', label: 'Subjective', hint: 'Patient-reported symptoms and history' },
  { key: 'objective', label: 'Objective', hint: 'Observable findings and measurements' },
  { key: 'assessment', label: 'Assessment', hint: 'Clinical impression' },
  { key: 'plan', label: 'Plan', hint: 'Treatment and follow-up plan' },
  { key: 'freeform', label: 'Freeform', hint: 'Additional notes' },
];
