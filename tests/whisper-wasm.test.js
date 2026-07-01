import { describe, it, expect } from 'vitest';
import { getOnnxWasmThreads } from '../js/runtime.js';
import { CONFIG } from '../config.js';

describe('getOnnxWasmThreads', () => {
  it('caps threads to 1 on iOS when cross-origin isolated', () => {
    expect(
      getOnnxWasmThreads({ isIOS: true, crossOriginIsolated: true, wasmThreads: 4 })
    ).toBe(1);
  });

  it('allows multiple threads on desktop when isolated', () => {
    expect(
      getOnnxWasmThreads({ isIOS: false, crossOriginIsolated: true, wasmThreads: 4 })
    ).toBe(4);
  });

  it('uses wasmThreads on iOS without isolation', () => {
    expect(
      getOnnxWasmThreads({ isIOS: true, crossOriginIsolated: false, wasmThreads: 1 })
    ).toBe(1);
  });
});

describe('Whisper CDN config', () => {
  it('pins transformers.js to a stable CDN version', () => {
    expect(CONFIG.whisperCdn).toMatch(/@huggingface\/transformers@\d+\.\d+\.\d+/);
  });
});
