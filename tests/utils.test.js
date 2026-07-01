import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  sanitizeColor,
  formatDuration,
  formatTimestamp,
  toSrtTime,
  nextSpeaker,
  clampPercent,
  safeFilename,
} from '../js/lib/utils.js';
import { mergeOverlappingText } from '../js/lib/clinical.js';

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>"\'&</script>')).toBe(
      '&lt;script&gt;&quot;&#39;&amp;&lt;/script&gt;'
    );
  });
});

describe('sanitizeColor', () => {
  it('accepts valid hex colors', () => {
    expect(sanitizeColor('#2563eb')).toBe('#2563eb');
  });

  it('rejects invalid values', () => {
    expect(sanitizeColor('red')).toBe('#666666');
    expect(sanitizeColor('javascript:alert(1)')).toBe('#666666');
  });
});

describe('formatDuration', () => {
  it('formats mm:ss', () => {
    expect(formatDuration(125000)).toBe('2:05');
  });

  it('formats h:mm:ss', () => {
    expect(formatDuration(3661000)).toBe('1:01:01');
  });
});

describe('formatTimestamp', () => {
  it('formats without hours', () => {
    expect(formatTimestamp(125000)).toBe('02:05');
  });
});

describe('toSrtTime', () => {
  it('formats SRT timestamps', () => {
    expect(toSrtTime(125000)).toBe('00:02:05,000');
  });
});

describe('nextSpeaker', () => {
  const speakers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('cycles to next speaker', () => {
    expect(nextSpeaker(speakers, 'a').id).toBe('b');
    expect(nextSpeaker(speakers, 'c').id).toBe('a');
  });
});

describe('clampPercent', () => {
  it('clamps values to 0-100', () => {
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(42.7)).toBe(43);
  });
});

describe('safeFilename', () => {
  it('sanitizes unsafe characters', () => {
    expect(safeFilename('Hello / World!')).toBe('Hello_World_');
  });
});

describe('mergeOverlappingText', () => {
  it('merges duplicate boundary words', () => {
    const merged = mergeOverlappingText('the quick brown fox', 'brown fox jumps');
    expect(merged).toBe('the quick brown fox jumps');
  });
});
