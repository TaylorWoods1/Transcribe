import { describe, it, expect } from 'vitest';
import { getOnnxWasmThreads } from '../js/runtime.js';
import { CONFIG } from '../config.js';

describe('getOnnxWasmThreads', () => {
  it('caps threads to 1 on iOS', () => {
    expect(getOnnxWasmThreads({ isIOS: true, wasmThreads: 4 })).toBe(1);
  });

  it('allows multiple threads on desktop', () => {
    expect(getOnnxWasmThreads({ isIOS: false, wasmThreads: 4 })).toBe(4);
  });
});

describe('Whisper CDN config', () => {
  it('pins transformers.js to a stable CDN version', () => {
    expect(CONFIG.whisperCdn).toMatch(/@huggingface\/transformers@\d+\.\d+\.\d+/);
  });
});
