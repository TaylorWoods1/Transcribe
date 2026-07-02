import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAgentTask } from '../js/lib/ai/agent-harness.js';

describe('runAgentTask', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '{"summary":"Visit summary","sourceSegmentIds":["seg-1"]}' }],
              },
            },
          ],
        }),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes Gemini tasks through the harness', async () => {
    const encounter = {
      segments: [{ id: 'seg-1', speakerId: 'spk-1', startMs: 0, endMs: 1000, text: 'Hello' }],
      speakers: [{ id: 'spk-1', name: 'Clinician', color: '#000' }],
    };

    const result = await runAgentTask(
      'summary-concise',
      { encounter },
      {
        settings: {
          provider: 'gemini',
          apiKey: 'test-key',
          model: 'gemini-2.5-flash',
        },
      }
    );

    expect(result.summary).toBe('Visit summary');
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(init.headers['x-goog-api-key']).toBe('test-key');
  });

  it('returns null when AI is not configured and throwOnError is false', async () => {
    const result = await runAgentTask('summary-concise', { encounter: { segments: [], speakers: [] } }, {
      settings: { provider: 'gemini', apiKey: '' },
      throwOnError: false,
    });
    expect(result).toBeNull();
  });
});
