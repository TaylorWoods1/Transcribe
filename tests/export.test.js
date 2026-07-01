import { describe, it, expect } from 'vitest';
import { exportJson, exportSrt, exportMarkdown } from '../js/export.js';

const encounter = {
  title: 'Test Visit',
  createdAt: Date.UTC(2026, 0, 15, 10, 0),
  speakers: [{ id: 'spk-1', name: 'Clinician' }],
  segments: [{ id: 's1', speakerId: 'spk-1', text: 'Hello', startMs: 0, endMs: 1000 }],
  notes: { subjective: 'S', objective: 'O', assessment: 'A', plan: 'P' },
  actions: [{ id: 'a1', text: 'Follow up', done: false }],
  insights: { summary: 'Summary text' },
};

describe('exportJson', () => {
  it('serializes encounter without blob', () => {
    const json = JSON.parse(exportJson(encounter));
    expect(json.title).toBe('Test Visit');
    expect(json.segments).toHaveLength(1);
  });
});

describe('exportSrt', () => {
  it('produces valid SRT blocks', () => {
    const srt = exportSrt(encounter);
    expect(srt).toContain('1\n');
    expect(srt).toContain('-->');
    expect(srt).toContain('Clinician: Hello');
  });
});

describe('exportMarkdown', () => {
  it('includes transcript and SOAP sections', () => {
    const md = exportMarkdown(encounter);
    expect(md).toContain('# Test Visit');
    expect(md).toContain('### Subjective');
    expect(md).toContain('Hello');
  });
});
