/**
 * Optional enhanced transcription via @xenova/transformers (CDN).
 * Includes explicit download + status tracking for Settings UI.
 */
import { CONFIG } from '../config.js';
import { getRuntimeCapabilities, probeWebGPU } from './runtime.js';

const STATUS_KEY = 'tiger-whisper-status';
const MODEL_LABEL = 'Whisper Tiny (English)';
const MODEL_SIZE_LABEL = '~40 MB';

let pipelinePromise = null;
let pipelineInstance = null;
let loadProgress = null;
let isTranscribing = false;
let liveTranscribeCount = 0;
const statusListeners = new Set();
let envConfigured = false;

function readStoredStatus() {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStoredStatus(patch) {
  const next = {
    ...readStoredStatus(),
    ...patch,
    model: CONFIG.whisperModel,
    modelLabel: MODEL_LABEL,
    updatedAt: Date.now(),
  };
  localStorage.setItem(STATUS_KEY, JSON.stringify(next));
  notifyStatusListeners();
  return next;
}

function notifyStatusListeners() {
  const status = getWhisperStatus();
  statusListeners.forEach((fn) => {
    try {
      fn(status);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeWhisperStatus(listener) {
  statusListeners.add(listener);
  listener(getWhisperStatus());
  return () => statusListeners.delete(listener);
}

export function getWhisperLoadProgress() {
  return loadProgress;
}

export function getWhisperStatus() {
  const stored = readStoredStatus();
  const progress = loadProgress?.progress;

  if (isTranscribing) {
    return {
      state: 'transcribing',
      label: 'Transcribing…',
      detail: 'Processing audio on this device. Keep the app open.',
      progress: null,
      ...stored,
    };
  }

  if (loadProgress?.status === 'loading' || loadProgress?.status === 'progress') {
    return {
      state: 'downloading',
      label: 'Downloading…',
      detail: `Loading ${MODEL_LABEL} (${MODEL_SIZE_LABEL}). Use Wi‑Fi and keep the app open.`,
      progress: progress != null ? Math.round(progress) : null,
      ...stored,
    };
  }

  if (pipelineInstance) {
    return {
      state: 'active',
      label: 'Active',
      detail: 'Model is loaded and ready to transcribe.',
      progress: 100,
      downloadedAt: stored.downloadedAt,
      ...stored,
    };
  }

  if (stored.downloadedAt && stored.state !== 'error') {
    return {
      state: 'cached',
      label: 'Downloaded',
      detail: 'Model is saved on this device. It loads into memory when you transcribe.',
      progress: 100,
      downloadedAt: stored.downloadedAt,
      ...stored,
    };
  }

  if (stored.state === 'error') {
    return {
      state: 'error',
      label: 'Error',
      detail: stored.error || 'Download failed. Try again on Wi‑Fi.',
      progress: null,
      ...stored,
    };
  }

  return {
    state: 'not_downloaded',
    label: 'Not downloaded',
    detail: `Download ${MODEL_LABEL} (${MODEL_SIZE_LABEL}) for offline-quality transcription.`,
    progress: null,
    ...stored,
  };
}

export function formatWhisperDownloadedAt(ts) {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function configureTransformersEnv(env) {
  if (envConfigured) return;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const caps = getRuntimeCapabilities();
  const wasm = env.backends?.onnx?.wasm;
  if (wasm) {
    wasm.numThreads = caps.wasmThreads;
    if ('simd' in wasm) wasm.simd = true;
  }
  envConfigured = true;
}

async function pickInferenceDevice() {
  const caps = getRuntimeCapabilities();
  // Research (transformers.js #894, SitePoint benchmarks): Whisper on Apple Silicon
  // often runs faster on multi-thread WASM than WebGPU in browser runtimes.
  if (caps.isIOS) return 'wasm';
  if (!caps.hasWebGPU) return 'wasm';
  const probe = await probeWebGPU();
  return probe.available ? 'webgpu' : 'wasm';
}

async function createPipeline(onProgress) {
  const { pipeline, env } = await import(CONFIG.whisperCdn);
  configureTransformersEnv(env);

  const progress_callback = (p) => {
    loadProgress = p;
    onProgress?.(p);
    notifyStatusListeners();
  };

  const device = await pickInferenceDevice();
  const baseOpts = {
    progress_callback,
    dtype: CONFIG.whisperDtype,
    device,
  };

  try {
    return await pipeline('automatic-speech-recognition', CONFIG.whisperModel, baseOpts);
  } catch (err) {
    if (device === 'webgpu') {
      return pipeline('automatic-speech-recognition', CONFIG.whisperModel, {
        progress_callback,
        dtype: CONFIG.whisperDtype,
        device: 'wasm',
      });
    }
    throw err;
  }
}

export async function loadWhisperPipeline(onProgress) {
  if (pipelineInstance) {
    onProgress?.({ status: 'ready', progress: 100 });
    return pipelineInstance;
  }
  if (pipelinePromise) return pipelinePromise;

  loadProgress = { status: 'loading', progress: 0 };
  notifyStatusListeners();

  pipelinePromise = (async () => {
    try {
      const pipe = await createPipeline(onProgress);
      pipelineInstance = pipe;
      loadProgress = { status: 'ready', progress: 100 };
      writeStoredStatus({ state: 'cached', downloadedAt: Date.now(), error: null });
      notifyStatusListeners();
      return pipe;
    } catch (err) {
      pipelinePromise = null;
      pipelineInstance = null;
      loadProgress = { status: 'error', progress: 0 };
      writeStoredStatus({ state: 'error', error: err.message || 'Download failed' });
      notifyStatusListeners();
      throw err;
    }
  })();

  return pipelinePromise;
}

/** Warm-load model into memory without transcribing. */
export async function warmWhisperPipeline(onProgress) {
  return loadWhisperPipeline(onProgress);
}

/** Download / warm-load the model without transcribing audio. */
export async function downloadWhisperModel(onProgress) {
  writeStoredStatus({ state: 'downloading', error: null });
  notifyStatusListeners();
  try {
    await loadWhisperPipeline(onProgress);
    return getWhisperStatus();
  } catch (err) {
    throw err;
  }
}

export function isWhisperReady() {
  return !!pipelineInstance;
}

export function isWhisperCached() {
  const stored = readStoredStatus();
  return !!stored.downloadedAt && stored.state !== 'error';
}

async function runPipeline(pipe, blob, { language, live = false } = {}) {
  const url = URL.createObjectURL(blob);
  try {
    const opts = {
      chunk_length_s: live ? CONFIG.whisperLiveChunkLengthS : 30,
      stride_length_s: live ? CONFIG.whisperLiveStrideS : 5,
      language: language?.split('-')[0] || 'en',
      return_timestamps: true,
    };
    const result = await pipe(url, opts);
    writeStoredStatus({ lastUsedAt: Date.now() });
    return normalizeWhisperResult(result);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function transcribeBlob(blob, { language, onProgress } = {}) {
  isTranscribing = true;
  notifyStatusListeners();
  try {
    const pipe = await loadWhisperPipeline(onProgress);
    return runPipeline(pipe, blob, { language, live: false });
  } finally {
    isTranscribing = false;
    notifyStatusListeners();
  }
}

/** Faster path for live chunks — does not flip global "transcribing" status. */
export async function transcribeLiveChunk(blob, { language } = {}) {
  liveTranscribeCount += 1;
  try {
    const pipe = await loadWhisperPipeline();
    return runPipeline(pipe, blob, { language, live: true });
  } finally {
    liveTranscribeCount -= 1;
  }
}

function normalizeWhisperResult(result) {
  const segments = [];
  if (result.chunks?.length) {
    for (const chunk of result.chunks) {
      const startMs = Math.round((chunk.timestamp?.[0] || 0) * 1000);
      const endMs = Math.round((chunk.timestamp?.[1] || startMs / 1000 + 1) * 1000);
      const text = (chunk.text || '').trim();
      if (!text) continue;
      segments.push({
        text,
        startMs,
        endMs,
        confidence: 0.85,
      });
    }
  } else if (result.text?.trim()) {
    segments.push({ text: result.text.trim(), startMs: 0, endMs: 0, confidence: 0.8 });
  }
  return segments;
}

export async function transcribeFile(file, options) {
  return transcribeBlob(file, options);
}

export function renderWhisperStatusHtml(status = getWhisperStatus()) {
  const progress =
    status.progress != null
      ? `<div class="whisper-progress" role="progressbar" aria-valuenow="${status.progress}" aria-valuemin="0" aria-valuemax="100">
          <div class="whisper-progress-bar" style="width:${status.progress}%"></div>
        </div>
        <p class="whisper-progress-label">${status.progress}%</p>`
      : '';

  return `
    <div class="whisper-status whisper-status-${status.state}" id="whisper-status-panel" role="status" aria-live="polite">
      <div class="whisper-status-row">
        <span class="whisper-status-badge">${status.label}</span>
        <span class="whisper-status-model">${MODEL_LABEL} · ${MODEL_SIZE_LABEL}</span>
      </div>
      <p class="whisper-status-detail">${status.detail}</p>
      ${progress}
      <dl class="whisper-status-meta">
        <div><dt>Last downloaded</dt><dd id="whisper-downloaded-at">${formatWhisperDownloadedAt(status.downloadedAt)}</dd></div>
        <div><dt>Last used</dt><dd id="whisper-last-used-at">${formatWhisperDownloadedAt(status.lastUsedAt)}</dd></div>
      </dl>
    </div>`;
}

export function updateWhisperStatusPanel(root = document.getElementById('whisper-status-panel')) {
  if (!root) return;
  const parent = root.parentElement;
  if (!parent) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderWhisperStatusHtml();
  const next = wrapper.firstElementChild;
  parent.replaceChild(next, root);

  const btn = document.getElementById('btn-whisper-download');
  const busy = getWhisperStatus().state === 'downloading' || getWhisperStatus().state === 'transcribing';
  if (btn) {
    btn.disabled = busy;
    btn.textContent =
      getWhisperStatus().state === 'active' || getWhisperStatus().state === 'cached'
        ? 'Re-download model'
        : 'Download Whisper model';
  }
}
