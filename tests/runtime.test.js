import { describe, it, expect } from 'vitest';
import {
  isWebKitSafari,
  getExpectedCoepMode,
  getLiveCaptureTiming,
  getCoiBlockerReason,
} from '../js/runtime.js';

describe('runtime', () => {
  it('detects WebKit Safari user agents', () => {
    expect(
      isWebKitSafari(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
      )
    ).toBe(true);
    expect(
      isWebKitSafari(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1'
      )
    ).toBe(false);
  });

  it('reports active COEP mode from session storage', () => {
    const map = new Map();
    const session = {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    };
    expect(getExpectedCoepMode(session)).toBe('credentialless');
    session.setItem('tiger-coi-coep-mode', 'require-corp');
    expect(getExpectedCoepMode(session)).toBe('require-corp');
  });

  it('uses shorter live chunks when multi-thread WASM is unavailable', () => {
    const single = getLiveCaptureTiming({
      canMultiThreadWasm: false,
      tier: 'mid',
      cores: 4,
      memoryGb: null,
      hasWebGPU: true,
      isIOS: true,
      isStandalone: true,
      crossOriginIsolated: false,
      hasSharedArrayBuffer: false,
      inferenceBackend: 'wasm-single-thread',
      wasmThreads: 1,
      localLlmFeasible: true,
      speakerDiarizationLocal: false,
      streamingAsrCeiling: '~3–8s behind speech',
      notes: [],
    });
    expect(single.whisperChunkLengthS).toBeLessThanOrEqual(6);
    expect(single.chunkIntervalMs).toBeLessThanOrEqual(1800);

    const multi = getLiveCaptureTiming({
      canMultiThreadWasm: true,
      tier: 'mid',
      cores: 4,
      memoryGb: null,
      hasWebGPU: true,
      isIOS: true,
      isStandalone: true,
      crossOriginIsolated: true,
      hasSharedArrayBuffer: true,
      inferenceBackend: 'wasm-multi-thread',
      wasmThreads: 4,
      localLlmFeasible: true,
      speakerDiarizationLocal: false,
      streamingAsrCeiling: '~2–5s behind speech',
      notes: [],
    });
    expect(multi.whisperChunkLengthS).toBeGreaterThan(single.whisperChunkLengthS);
  });

  it('explains when service worker is not controlling', () => {
    const reason = getCoiBlockerReason({
      crossOriginIsolated: false,
      isStandalone: true,
      isIOS: true,
    });
    expect(reason).toMatch(/service worker/i);
  });
});
