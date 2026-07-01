/**
 * Near-live transcription by processing short audio chunks with Whisper.
 * Used on iOS / browsers without Web Speech API.
 */
import { transcribeBlob, isWhisperReady, loadWhisperPipeline } from './transcribe-whisper.js';

export class ChunkedLiveTranscriber {
  constructor({ language, onSegments, onStatus, onError } = {}) {
    this.language = language;
    this.onSegments = onSegments || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onError = onError || (() => {});
    this.queue = [];
    this.processing = false;
    this.active = false;
    this.paused = false;
  }

  start() {
    this.active = true;
    this.paused = false;
    this.onStatus('Listening for speech chunks…');
  }

  stop() {
    this.active = false;
    this.paused = false;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this._pump();
  }

  async enqueueChunk(blob, startMs) {
    if (!this.active || !blob?.size) return;
    this.queue.push({ blob, startMs });
    this.onStatus(`Queued chunk · ${this.queue.length} waiting`);
    this._pump();
  }

  async _pump() {
    if (this.processing || this.paused || !this.queue.length || !this.active) return;
    if (!isWhisperReady()) {
      this.onStatus('Loading Whisper model…');
      try {
        await loadWhisperPipeline((p) => {
          if (p.progress != null) this.onStatus(`Loading model ${Math.round(p.progress)}%`);
        });
      } catch (err) {
        this.onError(err);
        this.processing = false;
        return;
      }
    }

    this.processing = true;
    const { blob, startMs } = this.queue.shift();
    this.onStatus('Transcribing live chunk…');

    try {
      const segments = await transcribeBlob(blob, {
        language: this.language,
        onProgress: (p) => {
          if (p.progress != null) this.onStatus(`Loading model ${Math.round(p.progress)}%`);
        },
      });
      const offset = segments.map((s) => ({
        ...s,
        startMs: (s.startMs || 0) + startMs,
        endMs: (s.endMs || 0) + startMs,
      }));
      if (offset.length) this.onSegments(offset);
      this.onStatus(this.queue.length ? `Processing · ${this.queue.length} queued` : 'Listening…');
    } catch (err) {
      this.onError(err);
      this.onStatus('Chunk failed — still listening');
    } finally {
      this.processing = false;
      if (this.active && !this.paused) this._pump();
    }
  }
}
