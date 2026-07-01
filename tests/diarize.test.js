import { describe, it, expect } from 'vitest';
import { DiarizationTracker, createSegment } from '../js/diarize.js';

const speakers = [
  { id: 'spk-1', name: 'Clinician' },
  { id: 'spk-2', name: 'Patient' },
];

describe('DiarizationTracker', () => {
  it('assigns manual speaker', () => {
    const d = new DiarizationTracker({ speakers, activeSpeakerId: 'spk-1' });
    d.setActiveSpeaker('spk-2', { manual: true });
    expect(d.activeSpeakerId).toBe('spk-2');
  });

  it('merges overlapping chunk text into last segment', () => {
    const d = new DiarizationTracker({ speakers, activeSpeakerId: 'spk-1' });
    d.addChunkSegments([{ text: 'hello world', startMs: 0, endMs: 1000 }], 'spk-1');
    d.addChunkSegments([{ text: 'world again', startMs: 900, endMs: 2000 }], 'spk-1');
    const finals = d.getSegments();
    expect(finals).toHaveLength(1);
    expect(finals[0].text).toContain('hello world');
    expect(finals[0].text).toContain('again');
  });

  it('creates segments with defaults', () => {
    const seg = createSegment({ speakerId: 'spk-1', text: 'test' });
    expect(seg.isFinal).toBe(true);
    expect(seg.id).toMatch(/^seg-/);
  });
});
