import { describe, it, expect } from 'vitest';
import { isAiConfigured, normalizeBaseUrl, parseJsonMessageContent } from '../js/lib/ai-client.js';

describe('isAiConfigured', () => {
  it('requires api key and base url', () => {
    expect(isAiConfigured({})).toBe(false);
    expect(isAiConfigured({ apiKey: 'x', baseUrl: 'https://api.example.com/v1' })).toBe(true);
  });
});

describe('normalizeBaseUrl', () => {
  it('strips trailing slash', () => {
    expect(normalizeBaseUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1');
  });

  it('rejects credentials in URL', () => {
    expect(() => normalizeBaseUrl('https://user:pass@api.example.com/v1')).toThrow(/credentials/i);
  });
});

describe('parseJsonMessageContent', () => {
  it('parses JSON content', () => {
    const parsed = parseJsonMessageContent({
      choices: [{ message: { content: '{"summary":"ok"}' } }],
    });
    expect(parsed.summary).toBe('ok');
  });

  it('falls back for non-JSON', () => {
    const parsed = parseJsonMessageContent({
      choices: [{ message: { content: 'plain text' } }],
    });
    expect(parsed.summary).toBe('plain text');
  });
});
