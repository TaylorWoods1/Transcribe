/**
 * Near-live transcription by processing short audio chunks with Whisper.
 * Used on iOS / browsers without Web Speech API.
 */
import { CONFIG } from '../config.js';
import { transcribeLiveChunk, isWhisperReady, loadWhisperPipeline } from './transcribe-whisper.js';

export function createLiveStatus(overrides = {}) {
  return {
    phase: 'idle',
    detail: '',
    queueLength: 0,
    chunksProcessed: 0,
    chunksSkipped: 0,
    processingMs: null,
    ...overrides,
  };
}

export class ChunkedLiveTranscriber {
  constructor({ language, onSegments, onStatus, onError, maxQueue = CONFIG.liveChunkMaxQueue } = {}) {
    this.language = language;
    this.onSegments = onSegments || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onError = onError || (() => {});
    this.maxQueue = maxQueue;
    this.queue = [];
    this.processing = false;
    this.active = false;
    this.paused = false;
    this.chunksProcessed = 0;
    this.chunksSkipped = 0;
    this.status = createLiveStatus();
  }

  _emitStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.onStatus(this.status);
  }

  start() {
    this.active = true;
    this.paused = false;
    this._emitStatus({
      phase: 'listening',
      detail: 'Listening for speech…',
      queueLength: 0,
    });
  }

  stop() {
    this.active = false;
    this.paused = false;
    this.queue = [];
    this._emitStatus({ phase: 'idle', detail: '', queueLength: 0 });
  }

  pause() {
    this.paused = true;
    this._emitStatus({ phase: 'paused', detail: 'Paused' });
  }

  resume() {
    this.paused = false;
    this._emitStatus({ phase: 'listening', detail: 'Listening…' });
    this._pump();
  }

  async enqueueChunk(blob, startMs, { hadSpeech = true } = {}) {
    if (!this.active || !blob?.size || !hadSpeech) return;

    if (this.queue.length >= this.maxQueue) {
      this.queue.shift();
      this.chunksSkipped += 1;
      this._emitStatus({
        phase: 'queued',
        detail: 'Catching up — skipped an older segment',
        queueLength: this.queue.length,
        chunksSkipped: this.chunksSkipped,
      });
    }

    this.queue.push({ blob, startMs });
    this._emitStatus({
      phase: this.processing ? 'queued' : 'listening',
      detail: this.processing
        ? `Processing · ${this.queue.length} queued`
        : 'Listening…',
      queueLength: this.queue.length,
      chunksSkipped: this.chunksSkipped,
    });
    this._pump();
  }

  async _pump() {
    if (this.processing || this.paused || !this.queue.length || !this.active) return;

    if (!isWhisperReady()) {
      this._emitStatus({ phase: 'loading', detail: 'Loading Whisper model…' });
      try {
        await loadWhisperPipeline((p) => {
          if (p.progress != null) {
            this._emitStatus({
              phase: 'loading',
              detail: `Loading model ${Math.round(p.progress)}%`,
            });
          }
        });
      } catch (err) {
        this.onError(err);
        this.processing = false;
        return;
      }
    }

    this.processing = true;
    const { blob, startMs } = this.queue.shift();
    const started = performance.now();
    this._emitStatus({
      phase: 'processing',
      detail: 'Transcribing speech…',
      queueLength: this.queue.length,
      processingMs: null,
    });

    try {
      const segments = await transcribeLiveChunk(blob, { language: this.language });
      const elapsed = Math.round(performance.now() - started);
      this.chunksProcessed += 1;

      const offset = segments.map((s) => ({
        ...s,
        startMs: (s.startMs || 0) + startMs,
        endMs: (s.endMs || 0) + startMs,
      }));

      if (offset.length) this.onSegments(offset);

      this._emitStatus({
        phase: this.queue.length ? 'queued' : 'listening',
        detail: this.queue.length
          ? `Listening · ${this.queue.length} queued`
          : `Listening · ${this.chunksProcessed} segment${this.chunksProcessed === 1 ? '' : 's'} transcribed`,
        queueLength: this.queue.length,
        chunksProcessed: this.chunksProcessed,
        processingMs: elapsed,
      });
    } catch (err) {
      this.onError(err);
      this._emitStatus({
        phase: 'listening',
        detail: 'Chunk failed — still listening',
        queueLength: this.queue.length,
      });
    } finally {
      this.processing = false;
      if (this.active && !this.paused) this._pump();
    }
  }
}
