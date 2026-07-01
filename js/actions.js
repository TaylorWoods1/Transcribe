/**
 * Rule-based action item extraction.
 */
import { CONFIG } from '../config.js';
import { createId } from './db.js';

const IMPERATIVE_START =
  /^(?:book|schedule|order|refer|prescribe|follow up|call|contact|arrange|review|check|monitor|start|stop|continue|send|complete|obtain)\b/i;

export function extractActions(segments, existing = []) {
  const existingTexts = new Set(existing.map((a) => a.text.toLowerCase()));
  const actions = [...existing];
  const seen = new Set(existingTexts);

  for (const seg of segments || []) {
    const text = (seg.text || '').trim();
    if (!text) continue;

    for (const pattern of CONFIG.actionPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const raw = (match[1] || match[0]).trim().replace(/\s+/g, ' ');
        const cleaned = cleanActionText(raw);
        if (cleaned.length < 8 || cleaned.length > 200) continue;
        const key = cleaned.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        actions.push({
          id: createId('act'),
          text: capitalize(cleaned),
          done: false,
          sourceSegmentId: seg.id,
          createdAt: Date.now(),
        });
      }
    }

    const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    for (const sentence of sentences) {
      if (!IMPERATIVE_START.test(sentence) && !/\b(?:need to|needs to|action item)\b/i.test(sentence)) continue;
      const cleaned = cleanActionText(sentence);
      if (cleaned.length < 8 || cleaned.length > 200) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push({
        id: createId('act'),
        text: capitalize(cleaned),
        done: false,
        sourceSegmentId: seg.id,
        createdAt: Date.now(),
      });
    }
  }

  return actions;
}

function cleanActionText(text) {
  return text
    .replace(/^(?:action|todo|task):\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function toggleAction(actions, id) {
  return actions.map((a) => (a.id === id ? { ...a, done: !a.done } : a));
}

export function updateActionText(actions, id, text) {
  return actions.map((a) => (a.id === id ? { ...a, text } : a));
}

export function deleteAction(actions, id) {
  return actions.filter((a) => a.id !== id);
}

export function addAction(actions, text, sourceSegmentId = null) {
  return [
    ...actions,
    {
      id: createId('act'),
      text: text.trim(),
      done: false,
      sourceSegmentId,
      createdAt: Date.now(),
    },
  ];
}
