/**
 * Optional enhanced transcription via @xenova/transformers (CDN).
 * Includes explicit download + status tracking for Settings UI.
 */
import { CONFIG } from '../config.js';

const STATUS_KEY = 'tiger-whisper-status';
const MODEL_LABEL = 'Whisper Tiny (English)';
const MODEL_SIZE_LABEL = '~40 MB';

let pipelinePromise = null;
let pipelineInstance = null;
let loadProgress = null;
let isTranscribing = false;
const statusListeners = new Set();

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
      const { pipeline, env } = await import(CONFIG.whisperCdn);
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      const pipe = await pipeline('automatic-speech-recognition', CONFIG.whisperModel, {
        progress_callback: (p) => {
          loadProgress = p;
          onProgress?.(p);
          notifyStatusListeners();
        },
      });
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

/** Download / warm-load the model without transcribing audio. */
export async function downloadWhisperModel(onProgress) {
  writeStoredStatus({ state: 'downloading', error: null });
  notifyStatusListeners();
  try {
    await loadWhisperPipeline(onProgress);
    const status = getWhisperStatus();
    return status;
  } catch (err) {
    throw err;
  }
}

export function isWhisperReady() {
  return !!pipelineInstance;
}

export async function transcribeBlob(blob, { language, onProgress } = {}) {
  isTranscribing = true;
  notifyStatusListeners();
  try {
    const pipe = await loadWhisperPipeline(onProgress);
    const url = URL.createObjectURL(blob);
    try {
      const result = await pipe(url, {
        chunk_length_s: 30,
        stride_length_s: 5,
        language: language?.split('-')[0] || 'en',
        return_timestamps: true,
      });
      writeStoredStatus({ lastUsedAt: Date.now() });
      return normalizeWhisperResult(result);
    } finally {
      URL.revokeObjectURL(url);
    }
  } finally {
    isTranscribing = false;
    notifyStatusListeners();
  }
}

function normalizeWhisperResult(result) {
  const segments = [];
  if (result.chunks?.length) {
    for (const chunk of result.chunks) {
      const startMs = Math.round((chunk.timestamp?.[0] || 0) * 1000);
      const endMs = Math.round((chunk.timestamp?.[1] || startMs / 1000 + 1) * 1000);
      segments.push({
        text: (chunk.text || '').trim(),
        startMs,
        endMs,
        confidence: 0.85,
      });
    }
  } else if (result.text) {
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
