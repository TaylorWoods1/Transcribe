/**
 * Runtime capability detection for on-device inference on iOS / browsers.
 */
import { CONFIG } from '../config.js';
import { escapeHtml } from './lib/utils.js';

export function isWebKitSafari(ua = navigator.userAgent || '') {
  return /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|EdgiOS|FxiOS/i.test(ua);
}

export function getExpectedCoepMode(ua = navigator.userAgent || '') {
  return isWebKitSafari(ua) ? 'require-corp' : 'credentialless';
}

export function isServiceWorkerControlling() {
  return typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
}

/** Live capture + Whisper chunk sizes — shorter slices when WASM is single-threaded. */
export function getLiveCaptureTiming(caps = getRuntimeCapabilities()) {
  if (caps.canMultiThreadWasm) {
    return {
      chunkIntervalMs: CONFIG.liveChunkIntervalMs,
      chunkMinMs: CONFIG.liveChunkMinMs,
      whisperChunkLengthS: CONFIG.whisperLiveChunkLengthS,
      whisperStrideS: CONFIG.whisperLiveStrideS,
    };
  }
  return {
    chunkIntervalMs: CONFIG.liveChunkIntervalMsSingleThread ?? 1800,
    chunkMinMs: CONFIG.liveChunkMinMsSingleThread ?? 900,
    whisperChunkLengthS: CONFIG.whisperLiveChunkLengthSingleThreadS ?? 6,
    whisperStrideS: CONFIG.whisperLiveStrideSingleThreadS ?? 1,
  };
}

export function getRuntimeCapabilities() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  const cores =
    typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null;
  const memoryGb =
    typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null;
  const hasWebGPU = typeof navigator.gpu !== 'undefined';
  const crossOriginIsolated = window.crossOriginIsolated === true;
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const canMultiThreadWasm = crossOriginIsolated && hasSharedArrayBuffer;

  let inferenceBackend = 'wasm-single-thread';
  if (canMultiThreadWasm) inferenceBackend = 'wasm-multi-thread';
  if (hasWebGPU && !isIOS) inferenceBackend = 'webgpu-or-wasm';
  if (hasWebGPU && isIOS) inferenceBackend = 'wasm-preferred'; // research: WASM often faster for Whisper on Apple mobile

  const tier = estimateDeviceTier({ cores, memoryGb, canMultiThreadWasm, hasWebGPU });

  return {
    isIOS,
    isStandalone,
    cores,
    memoryGb,
    hasWebGPU,
    crossOriginIsolated,
    hasSharedArrayBuffer,
    canMultiThreadWasm,
    inferenceBackend,
    tier,
    wasmThreads: canMultiThreadWasm
      ? Math.min(CONFIG.whisperWasmThreads || 4, Math.max(1, cores || 2))
      : 1,
    localLlmFeasible: tier !== 'low' && (memoryGb == null || memoryGb >= 4),
    speakerDiarizationLocal: false,
    streamingAsrCeiling: canMultiThreadWasm
      ? tier === 'high'
        ? '~1–3s behind speech'
        : '~2–5s behind speech'
      : tier === 'high'
        ? '~3–6s behind speech'
        : '~3–8s behind speech',
    notes: buildNotes({ isIOS, crossOriginIsolated, canMultiThreadWasm, hasWebGPU, tier }),
  };
}

function estimateDeviceTier({ cores, memoryGb, canMultiThreadWasm, hasWebGPU }) {
  const c = cores || 2;
  const m = memoryGb || 4;
  if (c >= 6 && m >= 6 && (canMultiThreadWasm || hasWebGPU)) return 'high';
  if (c >= 4 && m >= 4) return 'mid';
  return 'low';
}

function buildNotes({ isIOS, crossOriginIsolated, canMultiThreadWasm, hasWebGPU, tier }) {
  const notes = [];
  if (!crossOriginIsolated) {
    if (isIOS && isWebKitSafari()) {
      notes.push(
        'Safari uses require-corp isolation (credentialless is unsupported). Open Tiger from your home screen icon and reload once — multi-thread WASM should turn on.'
      );
    } else if (!isServiceWorkerControlling()) {
      notes.push(
        'Service worker is not controlling this page yet — reload once so COOP/COEP headers apply (~3–4× faster WASM).'
      );
    } else {
      notes.push(
        'Cross-origin isolation is off — WASM runs single-threaded (~3–4× slower). Reload after update to enable threading.'
      );
    }
  } else if (canMultiThreadWasm) {
    notes.push('Multi-thread WASM active — using all available CPU cores for Whisper.');
  }
  if (isIOS && hasWebGPU) {
    notes.push('WebGPU is available (iOS 26+) but Whisper often runs faster on WASM on Apple Silicon.');
  }
  if (isIOS) {
    notes.push(
      'Apple Neural Engine is not exposed to PWAs — native WhisperKit/Core ML would be ~5–10× faster than browser WASM.'
    );
  }
  if (tier === 'low') {
    notes.push('Limited RAM/CPU — keep Whisper Tiny and short live chunks.');
  }
  return notes;
}

export async function probeWebGPU() {
  if (!navigator.gpu) return { available: false, reason: 'navigator.gpu missing' };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { available: false, reason: 'No GPU adapter' };
    return { available: true, adapter: adapter.info || {} };
  } catch (err) {
    return { available: false, reason: err.message || 'requestAdapter failed' };
  }
}

export function getCoiBlockerReason(caps = getRuntimeCapabilities()) {
  if (caps.crossOriginIsolated) return null;
  if (!isServiceWorkerControlling()) {
    return 'Service worker is not controlling this page yet. Reload once so isolation headers can apply.';
  }
  if (caps.isIOS && !caps.isStandalone) {
    return 'Open Tiger from your home screen icon (not Safari) — browser tabs cannot enable multi-thread WASM on iPhone.';
  }
  return 'This page loaded without cross-origin isolation. Use the button below to fetch a fresh copy with threading enabled.';
}

export function renderRuntimeCapabilitiesHtml(caps = getRuntimeCapabilities()) {
  const swControlling = isServiceWorkerControlling();
  const coepMode = getExpectedCoepMode();
  const blocker = getCoiBlockerReason(caps);
  const rows = [
    ['Device tier', caps.tier],
    ['CPU cores', caps.cores ?? 'unknown'],
    ['Device memory', caps.memoryGb != null ? `${caps.memoryGb} GB (reported)` : 'unknown'],
    ['PWA installed', caps.isStandalone ? 'Yes' : 'No'],
    ['Service worker', swControlling ? 'Controlling' : 'Not controlling'],
    ['COEP mode (expected)', coepMode],
    ['Cross-origin isolated', caps.crossOriginIsolated ? 'Yes' : 'No'],
    ['SharedArrayBuffer', caps.hasSharedArrayBuffer ? 'Yes' : 'No'],
    ['Multi-thread WASM', caps.canMultiThreadWasm ? `Yes (${caps.wasmThreads} threads)` : 'No'],
    ['WebGPU', caps.hasWebGPU ? 'Available' : 'Not available'],
    ['Whisper backend', caps.inferenceBackend],
    ['Live caption lag (typical)', caps.streamingAsrCeiling],
    ['Local LLM assist (browser)', caps.localLlmFeasible ? 'Possible (Qwen/Llama 1–3B q4)' : 'Unlikely on this device'],
    ['Voice speaker ID (local)', 'Not in PWA — needs Core ML / Pyannote native'],
  ];

  const notes = (caps.notes || [])
    .map((n) => `<li class="copy-contained">${escapeHtml(n)}</li>`)
    .join('');

  const reloadBtn =
    blocker && typeof window !== 'undefined'
      ? `<p class="runtime-actions"><button type="button" class="btn btn-sm" id="btn-coi-reload">Reload to enable threading</button></p>`
      : '';

  return `
    <div class="runtime-caps card" id="runtime-caps-panel">
      <h3>On-device runtime</h3>
      <p class="muted">What this iPhone/browser can actually use for local AI. PWAs cannot access the Neural Engine directly.</p>
      ${blocker ? `<p class="runtime-coi-hint">${escapeHtml(blocker)}</p>` : ''}
      <dl class="runtime-caps-grid">
        ${rows
          .map(
            ([dt, dd]) =>
              `<div><dt>${escapeHtml(dt)}</dt><dd>${escapeHtml(String(dd))}</dd></div>`
          )
          .join('')}
      </dl>
      ${notes ? `<ul class="runtime-notes">${notes}</ul>` : ''}
      ${reloadBtn}
    </div>`;
}
