/**
 * Live transcription via Web Speech API.
 */
export function isLiveTranscriptionSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export class LiveTranscriber {
  constructor({ language = 'en-AU', onPartial, onFinal, onError } = {}) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) throw new Error('Web Speech API is not supported. Try Chrome for live transcription.');
    this.recognition = new SR();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = language;
    this.onPartial = onPartial || (() => {});
    this.onFinal = onFinal || (() => {});
    this.onError = onError || (() => {});
    this.active = false;
    this.startedAt = 0;
    this.totalPausedMs = 0;
    this._pausedAt = 0;

    this.recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (!text) continue;
        if (result.isFinal) {
          const endMs = this.getElapsedMs();
          this.onFinal({ text, endMs, confidence: result[0].confidence });
        } else {
          interim += text + ' ';
        }
      }
      if (interim.trim()) {
        this.onPartial({ text: interim.trim(), endMs: this.getElapsedMs() });
      }
    };

    this.recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      this.onError(new Error(e.error || 'Speech recognition error'));
    };

    this.recognition.onend = () => {
      if (this.active) {
        try {
          this.recognition.start();
        } catch {
          /* ignore restart race */
        }
      }
    };
  }

  start() {
    this.active = true;
    this.startedAt = Date.now();
    this.totalPausedMs = 0;
    this._pausedAt = 0;
    this.recognition.start();
  }

  stop() {
    this.active = false;
    try {
      this.recognition.stop();
    } catch {
      /* ignore */
    }
  }

  pause() {
    this.active = false;
    this._pausedAt = Date.now();
    try {
      this.recognition.stop();
    } catch {
      /* ignore */
    }
  }

  resume() {
    if (this._pausedAt) {
      this.totalPausedMs += Date.now() - this._pausedAt;
      this._pausedAt = 0;
    }
    this.active = true;
    try {
      this.recognition.start();
    } catch {
      /* ignore */
    }
  }

  getElapsedMs() {
    if (!this.startedAt) return 0;
    const pauseExtra = this._pausedAt ? Date.now() - this._pausedAt : 0;
    return Math.max(0, Date.now() - this.startedAt - this.totalPausedMs - pauseExtra);
  }

  setLanguage(lang) {
    this.recognition.lang = lang;
  }
}
