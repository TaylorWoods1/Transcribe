import { describe, it, expect } from 'vitest';
import { generateNotesFromSegments } from '../js/notes.js';

const speakers = [
  { id: 'spk-1', name: 'Clinician' },
  { id: 'spk-2', name: 'Patient' },
];

describe('generateNotesFromSegments', () => {
  it('populates subjective from patient lines', () => {
    const notes = generateNotesFromSegments(
      [{ speakerId: 'spk-2', text: 'I have had a cough for three days.' }],
      speakers
    );
    expect(notes.subjective).toMatch(/cough/i);
    expect(notes.assessment).toBeTruthy();
  });
});
