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

    this.recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (!text) continue;
        if (result.isFinal) {
          const endMs = Date.now() - this.startedAt;
          this.onFinal({ text, endMs, confidence: result[0].confidence });
        } else {
          interim += text + ' ';
        }
      }
      if (interim.trim()) {
        this.onPartial({ text: interim.trim(), endMs: Date.now() - this.startedAt });
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

  setLanguage(lang) {
    this.recognition.lang = lang;
  }
}
