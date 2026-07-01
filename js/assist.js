/**
 * Real-time clinical assist: rule-based suggestions during live capture.
 * AI layer is optional (see ai.js).
 */
import { buildTranscriptText, detectRedFlags } from './lib/clinical.js';
import { normalizeText as normalize } from './lib/utils.js';

const QUESTION_RULES = [
  {
    triggers: ['chest pain', 'chest discomfort', 'chest tightness', 'angina'],
    questions: [
      'When did the pain start, and was onset sudden or gradual?',
      'Does the pain radiate to your arm, jaw, neck, or back?',
      'Any shortness of breath, sweating, nausea, or dizziness with it?',
      'What were you doing when it started?',
    ],
    differentials: [
      { text: 'Acute coronary syndrome', urgency: 'urgent' },
      { text: 'Pulmonary embolism', urgency: 'urgent' },
      { text: 'Aortic dissection', urgency: 'urgent' },
      { text: 'Musculoskeletal / GERD', urgency: 'routine' },
    ],
  },
  {
    triggers: ['shortness of breath', 'breathless', 'difficulty breathing', "can't breathe", 'dyspnoea', 'dyspnea'],
    questions: [
      'When did the breathlessness start and has it been getting worse?',
      'Any chest pain, cough, fever, or leg swelling?',
      'Worse on exertion or at rest? Any orthopnoea or waking at night?',
      'Any wheeze, known asthma, or COPD?',
    ],
    differentials: [
      { text: 'Asthma / COPD exacerbation', urgency: 'urgent' },
      { text: 'Pulmonary embolism', urgency: 'urgent' },
      { text: 'Heart failure', urgency: 'urgent' },
      { text: 'Pneumonia', urgency: 'urgent' },
    ],
  },
  {
    triggers: ['headache', 'head pain', 'migraine'],
    questions: [
      'Is this the worst headache you have ever had?',
      'Sudden thunderclap onset or gradual?',
      'Any neck stiffness, fever, rash, or visual changes?',
      'Any weakness, numbness, slurred speech, or confusion?',
    ],
    differentials: [
      { text: 'Subarachnoid haemorrhage', urgency: 'urgent' },
      { text: 'Meningitis', urgency: 'urgent' },
      { text: 'Migraine / tension headache', urgency: 'routine' },
    ],
  },
  {
    triggers: ['abdominal pain', 'stomach pain', 'tummy pain', 'belly pain'],
    questions: [
      'Where exactly is the pain and does it move anywhere?',
      'Sharp, cramping, or constant? Severity 0–10?',
      'Any fever, vomiting, diarrhoea, constipation, or blood in stool/vomit?',
      'Last menstrual period if relevant; any chance of pregnancy?',
    ],
    differentials: [
      { text: 'Appendicitis', urgency: 'urgent' },
      { text: 'Bowel obstruction / perforation', urgency: 'urgent' },
      { text: 'Ectopic pregnancy', urgency: 'urgent' },
      { text: 'Gastroenteritis / IBS', urgency: 'routine' },
    ],
  },
  {
    triggers: ['fever', 'temperature', 'feeling hot', 'chills', 'rigors'],
    questions: [
      'How high has the temperature been and for how long?',
      'Any cough, urinary symptoms, rash, or recent travel?',
      'Any immunosuppression or recent procedures?',
      'Any neck stiffness or confusion?',
    ],
    differentials: [
      { text: 'Sepsis', urgency: 'urgent' },
      { text: 'Respiratory / urinary source', urgency: 'routine' },
      { text: 'Meningitis', urgency: 'urgent' },
    ],
  },
  {
    triggers: ['dizziness', 'lightheaded', 'vertigo', 'feeling faint'],
    questions: [
      'Room spinning (vertigo) or feeling like you might pass out?',
      'Any chest pain, palpitations, or shortness of breath?',
      'Recent illness, dehydration, or new medications?',
      'Any weakness, numbness, or difficulty speaking?',
    ],
    differentials: [
      { text: 'Stroke / TIA', urgency: 'urgent' },
      { text: 'Arrhythmia', urgency: 'urgent' },
      { text: 'Benign positional vertigo', urgency: 'routine' },
    ],
  },
  {
    triggers: ['cough', 'coughing'],
    questions: [
      'How long have you had the cough? Any blood in sputum?',
      'Any fever, weight loss, night sweats, or shortness of breath?',
      'Smoking history or known lung disease?',
      'Any recent travel or sick contacts?',
    ],
    differentials: [
      { text: 'Pneumonia', urgency: 'routine' },
      { text: 'Pulmonary malignancy', urgency: 'routine' },
      { text: 'Post-viral cough / asthma', urgency: 'routine' },
    ],
  },
  {
    triggers: ['rash', 'skin rash', 'hives', 'itching', 'swelling'],
    questions: [
      'When did the rash start and is it spreading?',
      'Any lip, tongue, or throat swelling or difficulty breathing?',
      'Any new medications, foods, or insect bites?',
      'Any fever or joint pains?',
    ],
    differentials: [
      { text: 'Anaphylaxis', urgency: 'urgent' },
      { text: 'Allergic reaction', urgency: 'urgent' },
      { text: 'Viral exanthem / contact dermatitis', urgency: 'routine' },
    ],
  },
  {
    triggers: ['suicidal', 'self harm', 'self-harm', 'want to die', 'hurt myself'],
    questions: [
      'Are you having thoughts of harming yourself right now?',
      'Do you have a plan or means to act on these thoughts?',
      'Who is supporting you at home? Are you safe tonight?',
      'Have you felt this way before?',
    ],
    differentials: [
      { text: 'Acute mental health crisis', urgency: 'urgent' },
    ],
    responses: [
      'Thank you for telling me — that takes courage. I want to make sure you are safe.',
      'We will work together on a safety plan and arrange appropriate support today.',
    ],
  },
  {
    triggers: ['back pain', 'lower back'],
    questions: [
      'Any trauma or heavy lifting recently?',
      'Any leg weakness, numbness in the saddle area, or bladder/bowel changes?',
      'Any fever, weight loss, or history of cancer?',
      'Does the pain radiate down the leg?',
    ],
    differentials: [
      { text: 'Cauda equina syndrome', urgency: 'urgent' },
      { text: 'Sciatica / musculoskeletal strain', urgency: 'routine' },
    ],
  },
];

const RESPONSE_TEMPLATES = [
  {
    triggers: ['worried', 'anxious', 'scared', 'frightened', 'nervous'],
    responses: [
      { text: 'I can hear this is worrying for you — let us take it step by step.', type: 'empathy' },
      { text: 'It is understandable to feel anxious. I will explain what we are thinking and what happens next.', type: 'empathy' },
    ],
  },
  {
    triggers: ['pain', 'hurts', 'sore', 'aching'],
    responses: [
      { text: 'Can you describe the pain — sharp, dull, burning — and rate it out of 10?', type: 'clarify' },
      { text: 'Let me make sure I understand when it started and what makes it better or worse.', type: 'clarify' },
    ],
  },
  {
    triggers: ['not sure', "don't know", 'unclear', 'confused'],
    responses: [
      { text: 'That is okay — let me ask a few more specific questions to narrow this down.', type: 'clarify' },
      { text: 'Let me summarise what I have heard so far and you can tell me if I have it right.', type: 'clarify' },
    ],
  },
];

const GENERIC_QUESTIONS = [
  'What is the main concern you want addressed today?',
  'When did this start and has it changed since then?',
  'What makes it better or worse?',
  'Any other symptoms you have noticed?',
  'Any relevant past medical history or medications?',
];

const GENERIC_RESPONSES = [
  { text: 'Let me summarise what I have heard to make sure I understand correctly.', type: 'clarify' },
  { text: 'Is there anything else you think is important for me to know?', type: 'clarify' },
  { text: 'I will explain my thinking and the plan, then we can discuss any questions.', type: 'plan' },
];

function alreadyAsked(question, segments) {
  const q = normalize(question).replace(/\?/g, '');
  for (const seg of segments || []) {
    const t = normalize(seg.text).replace(/\?/g, '');
    if (t.includes(q) || q.includes(t)) return true;
  }
  return false;
}

function matchTriggers(text, triggers) {
  const lower = text.toLowerCase();
  return triggers.some((t) => lower.includes(t));
}

export function analyzeLiveAssist(segments, speakers) {
  const text = buildTranscriptText(segments, speakers, { finalsOnly: true });
  const lower = text.toLowerCase();
  const questions = [];
  const responses = [];
  const differentials = [];
  const seenQ = new Set();
  const seenR = new Set();
  const seenD = new Set();

  for (const rule of QUESTION_RULES) {
    if (!matchTriggers(lower, rule.triggers)) continue;

    for (const q of rule.questions || []) {
      const key = normalize(q);
      if (seenQ.has(key) || alreadyAsked(q, segments)) continue;
      seenQ.add(key);
      questions.push({ text: q, reason: rule.triggers[0], priority: 'high' });
    }

    for (const d of rule.differentials || []) {
      const key = normalize(d.text);
      if (seenD.has(key)) continue;
      seenD.add(key);
      differentials.push({ ...d, reason: rule.triggers[0] });
    }

    for (const r of rule.responses || []) {
      const key = normalize(r.text || r);
      if (seenR.has(key)) continue;
      seenR.add(key);
      responses.push(typeof r === 'string' ? { text: r, type: 'empathy' } : r);
    }
  }

  for (const rule of RESPONSE_TEMPLATES) {
    if (!matchTriggers(lower, rule.triggers)) continue;
    for (const r of rule.responses || []) {
      const key = normalize(r.text);
      if (seenR.has(key)) continue;
      seenR.add(key);
      responses.push(r);
    }
  }

  if (questions.length < 3) {
    for (const q of GENERIC_QUESTIONS) {
      if (questions.length >= 5) break;
      const key = normalize(q);
      if (seenQ.has(key) || alreadyAsked(q, segments)) continue;
      seenQ.add(key);
      questions.push({ text: q, reason: 'general', priority: 'routine' });
    }
  }

  if (responses.length < 2) {
    for (const r of GENERIC_RESPONSES) {
      if (responses.length >= 4) break;
      const key = normalize(r.text);
      if (seenR.has(key)) continue;
      seenR.add(key);
      responses.push(r);
    }
  }

  return {
    questions: questions.slice(0, 6),
    responses: responses.slice(0, 4),
    differentials: differentials.slice(0, 5),
    considerations: detectRedFlags(text),
    source: 'rules',
    updatedAt: Date.now(),
    segmentCount: (segments || []).filter((s) => s.text?.trim()).length,
  };
}

export function mergeAssistSuggestions(base, extra) {
  if (!extra) return base;
  if (!base) return extra;

  const dedupe = (items, keyFn) => {
    const seen = new Set();
    const out = [];
    for (const item of items) {
      const key = keyFn(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };

  return {
    questions: dedupe([...(extra.questions || []), ...(base.questions || [])], (q) => normalize(q.text)).slice(0, 8),
    responses: dedupe([...(extra.responses || []), ...(base.responses || [])], (r) => normalize(r.text)).slice(0, 6),
    differentials: dedupe([...(extra.differentials || []), ...(base.differentials || [])], (d) => normalize(d.text)).slice(0, 6),
    considerations: dedupe(
      [...(extra.considerations || []), ...(base.considerations || [])],
      (c) => normalize(c.message || c.keyword)
    ),
    source: base.source && extra.source ? 'mixed' : extra.source || base.source,
    updatedAt: Date.now(),
    segmentCount: Math.max(base.segmentCount || 0, extra.segmentCount || 0),
  };
}

export function createEmptyAssist() {
  return {
    questions: [],
    responses: [],
    differentials: [],
    considerations: [],
    source: null,
    updatedAt: null,
    segmentCount: 0,
  };
}
