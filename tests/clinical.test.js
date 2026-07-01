import { describe, it, expect } from 'vitest';
import {
  buildTranscriptText,
  detectRedFlags,
  mergeOverlappingText,
  getDisclaimer,
} from '../js/lib/clinical.js';

const speakers = [
  { id: 'spk-1', name: 'Clinician' },
  { id: 'spk-2', name: 'Patient' },
];

describe('buildTranscriptText', () => {
  it('builds speaker-labelled lines', () => {
    const text = buildTranscriptText(
      [{ speakerId: 'spk-2', text: 'I have chest pain' }],
      speakers
    );
    expect(text).toBe('Patient: I have chest pain');
  });

  it('filters partial segments when finalsOnly', () => {
    const text = buildTranscriptText(
      [
        { speakerId: 'spk-2', text: 'partial', isFinal: false },
        { speakerId: 'spk-2', text: 'final', isFinal: true },
      ],
      speakers,
      { finalsOnly: true }
    );
    expect(text).toBe('Patient: final');
  });
});

describe('detectRedFlags', () => {
  it('detects configured keywords', () => {
    const flags = detectRedFlags('Patient reports chest pain and shortness of breath');
    expect(flags.length).toBeGreaterThanOrEqual(2);
    expect(flags.some((f) => f.keyword === 'chest pain')).toBe(true);
  });

  it('returns empty for clean text', () => {
    expect(detectRedFlags('routine follow up visit')).toEqual([]);
  });
});

describe('mergeOverlappingText', () => {
  it('concatenates non-overlapping text', () => {
    expect(mergeOverlappingText('hello', 'world')).toBe('hello world');
  });
});

describe('getDisclaimer', () => {
  it('returns non-empty disclaimer', () => {
    expect(getDisclaimer()).toMatch(/not medical advice/i);
  });
});
