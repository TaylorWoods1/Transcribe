import { describe, it, expect } from 'vitest';
import {
  getDefaultAiSettings,
  inferLegacyProvider,
  isAiConfigured,
  normalizeAiSettings,
} from '../js/lib/ai/ai-settings.js';

describe('normalizeAiSettings', () => {
  it('defaults to Gemini', () => {
    const settings = normalizeAiSettings({});
    expect(settings.provider).toBe('gemini');
    expect(settings.model).toBe('gemini-2.0-flash');
  });

  it('migrates legacy OpenAI settings', () => {
    const settings = normalizeAiSettings({
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    });
    expect(settings.provider).toBe('openai-compatible');
    expect(settings.baseUrl).toBe('https://api.openai.com/v1');
  });

  it('keeps explicit provider', () => {
    expect(normalizeAiSettings({ provider: 'openai-compatible', apiKey: 'x', baseUrl: 'https://api.example.com/v1' }).provider).toBe(
      'openai-compatible'
    );
  });
});

describe('inferLegacyProvider', () => {
  it('prefers openai-compatible when base URL looks OpenAI', () => {
    expect(inferLegacyProvider({ baseUrl: 'https://api.openai.com/v1' })).toBe('openai-compatible');
  });

  it('defaults to gemini for key-only legacy settings', () => {
    expect(inferLegacyProvider({ apiKey: 'abc' })).toBe('gemini');
  });
});

describe('isAiConfigured', () => {
  it('requires api key for Gemini', () => {
    expect(isAiConfigured(getDefaultAiSettings())).toBe(false);
    expect(isAiConfigured({ provider: 'gemini', apiKey: 'abc' })).toBe(true);
  });

  it('requires api key for OpenAI-compatible', () => {
    expect(
      isAiConfigured({
        provider: 'openai-compatible',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
      })
    ).toBe(false);
    expect(
      isAiConfigured({
        provider: 'openai-compatible',
        apiKey: 'abc',
        baseUrl: 'https://api.openai.com/v1',
      })
    ).toBe(true);
  });
});
