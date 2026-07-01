/**
 * Simple energy-based voice activity detection from Web Audio analyser.
 */
export class VoiceActivityDetector {
  constructor({ threshold = 0.035, minSpeechMs = 180, minSilenceMs = 700 } = {}) {
    this.threshold = threshold;
    this.minSpeechMs = minSpeechMs;
    this.minSilenceMs = minSilenceMs;
    this.speaking = false;
    this._speechStartedAt = 0;
    this._silenceStartedAt = 0;
    this.onSpeechStart = null;
    this.onSpeechEnd = null;
  }

  /** @param level 0–1 RMS-ish energy from analyser */
  tick(level, now = Date.now()) {
    if (level >= this.threshold) {
      if (!this.speaking) {
        if (!this._speechStartedAt) this._speechStartedAt = now;
        if (now - this._speechStartedAt >= this.minSpeechMs) {
          this.speaking = true;
          this._silenceStartedAt = 0;
          this.onSpeechStart?.(now);
        }
      } else {
        this._speechStartedAt = 0;
        this._silenceStartedAt = 0;
      }
      return this.speaking;
    }

    this._speechStartedAt = 0;
    if (this.speaking) {
      if (!this._silenceStartedAt) this._silenceStartedAt = now;
      if (now - this._silenceStartedAt >= this.minSilenceMs) {
        this.speaking = false;
        this._silenceStartedAt = 0;
        this.onSpeechEnd?.(now);
      }
    }
    return this.speaking;
  }

  reset() {
    this.speaking = false;
    this._speechStartedAt = 0;
    this._silenceStartedAt = 0;
  }
}
