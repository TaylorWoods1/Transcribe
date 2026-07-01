import { describe, it, expect } from 'vitest';
import { analyzeLiveAssist, mergeAssistSuggestions, createEmptyAssist } from '../js/assist.js';

const speakers = [
  { id: 'spk-1', name: 'Clinician' },
  { id: 'spk-2', name: 'Patient' },
];

describe('analyzeLiveAssist', () => {
  it('suggests chest pain questions', () => {
    const result = analyzeLiveAssist(
      [{ speakerId: 'spk-2', text: 'I have chest pain', isFinal: true }],
      speakers
    );
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.differentials.some((d) => /coronary/i.test(d.text))).toBe(true);
    expect(result.considerations.some((c) => c.keyword === 'chest pain')).toBe(true);
  });

  it('skips questions already in transcript', () => {
    const q = 'When did the pain start, and was onset sudden or gradual?';
    const result = analyzeLiveAssist(
      [{ speakerId: 'spk-1', text: q, isFinal: true }],
      speakers
    );
    expect(result.questions.some((item) => item.text === q)).toBe(false);
  });
});

describe('mergeAssistSuggestions', () => {
  it('merges AI and rule suggestions without duplicates', () => {
    const base = analyzeLiveAssist(
      [{ speakerId: 'spk-2', text: 'chest pain', isFinal: true }],
      speakers
    );
    const extra = {
      questions: [{ text: 'Unique AI question?' }],
      responses: [],
      differentials: [],
      considerations: [],
      source: 'ai',
    };
    const merged = mergeAssistSuggestions(base, extra);
    expect(merged.questions.some((q) => q.text === 'Unique AI question?')).toBe(true);
    expect(merged.source).toBe('mixed');
  });
});

describe('createEmptyAssist', () => {
  it('returns empty structure', () => {
    const empty = createEmptyAssist();
    expect(empty.questions).toEqual([]);
    expect(empty.segmentCount).toBe(0);
  });
});
