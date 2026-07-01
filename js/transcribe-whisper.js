/**
 * Optional enhanced transcription via @xenova/transformers (CDN).
 */
import { CONFIG } from '../config.js';

let pipelinePromise = null;
let loadProgress = null;

export function getWhisperLoadProgress() {
  return loadProgress;
}

export async function loadWhisperPipeline(onProgress) {
  if (pipelinePromise) return pipelinePromise;
  loadProgress = { status: 'loading', progress: 0 };
  pipelinePromise = (async () => {
    const { pipeline, env } = await import(CONFIG.whisperCdn);
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    const pipe = await pipeline('automatic-speech-recognition', CONFIG.whisperModel, {
      progress_callback: (p) => {
        loadProgress = p;
        onProgress?.(p);
      },
    });
    loadProgress = { status: 'ready', progress: 100 };
    return pipe;
  })();
  return pipelinePromise;
}

export async function transcribeBlob(blob, { language, onProgress } = {}) {
  const pipe = await loadWhisperPipeline(onProgress);
  const url = URL.createObjectURL(blob);
  try {
    const result = await pipe(url, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: language?.split('-')[0] || 'en',
      return_timestamps: true,
    });
    return normalizeWhisperResult(result);
  } finally {
    URL.revokeObjectURL(url);
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
