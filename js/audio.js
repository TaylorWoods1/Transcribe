/**
 * Audio capture via MediaRecorder + Web Audio waveform.
 */
export class AudioRecorder {
  constructor({
    onWaveform,
    onChunk,
    onError,
    onEnergy,
    chunkIntervalMs = 1000,
    speechThreshold = 0.03,
  } = {}) {
    this.onWaveform = onWaveform || (() => {});
    this.onChunk = onChunk || (() => {});
    this.onError = onError || (() => {});
    this.onEnergy = onEnergy || (() => {});
    this.chunkIntervalMs = chunkIntervalMs;
    this.speechThreshold = speechThreshold;
    this.stream = null;
    this.mediaRecorder = null;
    this.audioContext = null;
    this.analyser = null;
    this.animationId = null;
    this.chunks = [];
    this.startedAt = 0;
    this.pausedAt = 0;
    this.totalPausedMs = 0;
    this.isPaused = false;
    this.mimeType = 'audio/webm';
    this.chunkMaxEnergy = 0;
    this.lastChunkAt = 0;
    this.lastFlushAt = 0;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported in this browser.');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.audioContext = new AudioContext();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);
    this._startWaveform();

    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    this.mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    this.mediaRecorder = new MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType } : {});
    this.chunks = [];
    this.chunkMaxEnergy = 0;
    this.lastChunkAt = Date.now();
    this.lastFlushAt = this.lastChunkAt;

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
        const hadSpeech = this.chunkMaxEnergy >= this.speechThreshold;
        this.onChunk(e.data, { hadSpeech, maxEnergy: this.chunkMaxEnergy });
        this.chunkMaxEnergy = 0;
        this.lastChunkAt = Date.now();
      }
    };
    this.mediaRecorder.onerror = (e) => this.onError(e.error || new Error('Recording failed'));
    this.mediaRecorder.start(this.chunkIntervalMs);
    this.startedAt = Date.now();
    this.totalPausedMs = 0;
    this.isPaused = false;
  }

  /** Force an early chunk boundary (e.g. on end of speech). */
  flushChunk() {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording' || this.isPaused) return false;
    const elapsed = Date.now() - this.lastFlushAt;
    if (elapsed < 800) return false;
    try {
      this.mediaRecorder.requestData();
      this.lastFlushAt = Date.now();
      return true;
    } catch {
      return false;
    }
  }

  pause() {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;
    this.mediaRecorder.pause();
    this.isPaused = true;
    this.pausedAt = Date.now();
    this._stopWaveform();
  }

  resume() {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'paused') return;
    this.mediaRecorder.resume();
    if (this.pausedAt) this.totalPausedMs += Date.now() - this.pausedAt;
    this.isPaused = false;
    this.pausedAt = 0;
    this._startWaveform();
  }

  async stop() {
    this._stopWaveform();
    const durationMs = this.getElapsedMs();
    const blob = await new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }
      this.mediaRecorder.onstop = () => {
        const type = this.mimeType || 'audio/webm';
        resolve(this.chunks.length ? new Blob(this.chunks, { type }) : null);
      };
      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      } else {
        const type = this.mimeType || 'audio/webm';
        resolve(this.chunks.length ? new Blob(this.chunks, { type }) : null);
      }
      this.mediaRecorder.onerror = () => reject(new Error('Stop failed'));
    });
    this._cleanup();
    return { blob, durationMs };
  }

  getElapsedMs() {
    if (!this.startedAt) return 0;
    const now = this.isPaused ? this.pausedAt : Date.now();
    return Math.max(0, now - this.startedAt - this.totalPausedMs);
  }

  getMimeType() {
    return this.mimeType || 'audio/webm';
  }

  _startWaveform() {
    if (!this.analyser) return;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const tick = () => {
      this.analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
      this.chunkMaxEnergy = Math.max(this.chunkMaxEnergy, avg);
      this.onWaveform(avg);
      this.onEnergy(avg);
      this.animationId = requestAnimationFrame(tick);
    };
    tick();
  }

  _stopWaveform() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animationId = null;
    this.onWaveform(0);
  }

  _cleanup() {
    this._stopWaveform();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close();
    this.stream = null;
    this.mediaRecorder = null;
    this.audioContext = null;
    this.analyser = null;
  }
}

export class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.onTimeUpdate = null;
    this.audio.addEventListener('timeupdate', () => {
      this.onTimeUpdate?.(this.audio.currentTime * 1000);
    });
  }

  load(blob) {
    if (this._url) URL.revokeObjectURL(this._url);
    this._url = URL.createObjectURL(blob);
    this.audio.src = this._url;
  }

  play() {
    return this.audio.play();
  }

  pause() {
    this.audio.pause();
  }

  seek(ms) {
    this.audio.currentTime = ms / 1000;
  }

  get currentTimeMs() {
    return this.audio.currentTime * 1000;
  }

  destroy() {
    this.audio.pause();
    if (this._url) URL.revokeObjectURL(this._url);
    this._url = null;
  }
}
