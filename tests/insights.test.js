import { describe, it, expect } from 'vitest';
import { analyzeEncounter } from '../js/insights.js';

describe('analyzeEncounter', () => {
  it('extracts questions from segments', () => {
    const result = analyzeEncounter({
      segments: [{ id: 's1', speakerId: 'spk-1', text: 'How long has this been going on?' }],
      speakers: [{ id: 'spk-1', name: 'Clinician' }],
    });
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].text).toContain('?');
  });

  it('returns default summary for empty transcript', () => {
    const result = analyzeEncounter({ segments: [], speakers: [] });
    expect(result.summary).toMatch(/No transcript/i);
  });
});
