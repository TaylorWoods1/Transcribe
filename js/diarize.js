/**
 * Speaker turn detection via VAD/silence gaps + manual assignment.
 */
import { CONFIG } from '../config.js';
import { createId } from './db.js';
import { mergeOverlappingText } from './lib/clinical.js';
import { formatTimestamp } from './lib/utils.js';

export { formatTimestamp };

export function createSegment({ speakerId, startMs, endMs, text, confidence, isFinal = true }) {
  return {
    id: createId('seg'),
    speakerId,
    startMs: startMs ?? 0,
    endMs: endMs ?? startMs ?? 0,
    text: text || '',
    confidence: confidence ?? null,
    isFinal: isFinal !== false,
    createdAt: Date.now(),
  };
}

export class DiarizationTracker {
  constructor({ speakers, silenceGapMs = CONFIG.silenceGapMs, activeSpeakerId } = {}) {
    this.speakers = speakers || [];
    this.silenceGapMs = silenceGapMs;
    this.activeSpeakerId = activeSpeakerId || speakers?.[0]?.id || 'spk-1';
    this.lastSpeechEndMs = 0;
    this.lastSpeechStartMs = 0;
    this.manualSpeakerLockUntil = 0;
    this.segments = [];
    this._partialId = null;
  }

  setActiveSpeaker(speakerId, { manual = true } = {}) {
    this.activeSpeakerId = speakerId;
    if (manual) {
      this.manualSpeakerLockUntil = Date.now() + CONFIG.manualSpeakerLockMs;
    }
  }

  onSpeechStart(ms) {
    this.lastSpeechStartMs = ms;
  }

  onSpeechEnd(ms) {
    this.lastSpeechEndMs = ms;
    if (Date.now() < this.manualSpeakerLockUntil) return;
    if (this.speakers.length <= 1) return;
    const gap = this.lastSpeechEndMs && this.lastSpeechStartMs
      ? this.lastSpeechEndMs - this.lastSpeechStartMs
      : 0;
    if (gap > this.silenceGapMs) {
      const idx = this.speakers.findIndex((s) => s.id === this.activeSpeakerId);
      const next = this.speakers[(idx + 1) % this.speakers.length];
      if (next) this.activeSpeakerId = next.id;
    }
  }

  addSpeakers(speakers) {
    this.speakers = speakers;
    if (!this.activeSpeakerId && speakers[0]) {
      this.activeSpeakerId = speakers[0].id;
    }
  }

  onPartial({ text, endMs }) {
    if (!text) return;
    const startMs = Math.max(0, endMs - 2000);
    if (this._partialId) {
      const idx = this.segments.findIndex((s) => s.id === this._partialId);
      if (idx >= 0) {
        this.segments[idx] = { ...this.segments[idx], text, endMs, isFinal: false };
        return this.segments[idx];
      }
    }
    const seg = createSegment({
      speakerId: this.activeSpeakerId,
      startMs,
      endMs,
      text,
      isFinal: false,
    });
    this._partialId = seg.id;
    this.segments.push(seg);
    return seg;
  }

  onFinal({ text, endMs, confidence }) {
    if (!text) return null;
    const gap = this.lastSpeechEndMs ? endMs - this.lastSpeechEndMs : 0;
    if (
      gap > this.silenceGapMs &&
      this.speakers.length > 1 &&
      Date.now() >= this.manualSpeakerLockUntil
    ) {
      const idx = this.speakers.findIndex((s) => s.id === this.activeSpeakerId);
      const next = this.speakers[(idx + 1) % this.speakers.length];
      if (next) this.activeSpeakerId = next.id;
    }

    const startMs = Math.max(0, endMs - Math.max(500, text.split(/\s+/).length * 350));

    if (this._partialId) {
      const idx = this.segments.findIndex((s) => s.id === this._partialId);
      if (idx >= 0) {
        this.segments[idx] = {
          ...this.segments[idx],
          speakerId: this.activeSpeakerId,
          startMs,
          endMs,
          text,
          confidence: confidence ?? null,
          isFinal: true,
        };
        this._partialId = null;
        this.lastSpeechEndMs = endMs;
        return this.segments[idx];
      }
    }

    const seg = createSegment({
      speakerId: this.activeSpeakerId,
      startMs,
      endMs,
      text,
      confidence: confidence ?? null,
    });
    this.segments.push(seg);
    this.lastSpeechEndMs = endMs;
    return seg;
  }

  mergeWhisperSegments(whisperSegments, speakerId) {
    for (const w of whisperSegments) {
      this.segments.push(
        createSegment({
          speakerId: speakerId || this.activeSpeakerId,
          startMs: w.startMs,
          endMs: w.endMs,
          text: w.text,
          confidence: w.confidence,
        })
      );
    }
    return this.segments;
  }

  reassignSpeaker(segmentId, speakerId) {
    const seg = this.segments.find((s) => s.id === segmentId);
    if (seg) seg.speakerId = speakerId;
    return seg;
  }

  updateSegmentText(segmentId, text) {
    const seg = this.segments.find((s) => s.id === segmentId);
    if (seg) seg.text = text;
    return seg;
  }

  getSegments() {
    return this.segments.filter((s) => s.isFinal !== false && s.text?.trim());
  }

  /** Includes in-progress partial for live UI */
  getLiveSegments() {
    return this.segments.filter((s) => s.text?.trim());
  }

  getActiveSpeaker() {
    return this.speakers.find((s) => s.id === this.activeSpeakerId) || null;
  }

  addChunkSegments(chunkSegments, defaultSpeakerId) {
    for (const w of chunkSegments) {
      if (!w.text?.trim()) continue;
      const speakerId = defaultSpeakerId || this.activeSpeakerId;
      const last = this.segments[this.segments.length - 1];

      if (last?.isFinal !== false && last?.speakerId === speakerId && last?.text) {
        const merged = mergeOverlappingText(last.text, w.text);
        if (merged !== w.text && merged.length >= last.text.length) {
          last.text = merged;
          last.endMs = Math.max(last.endMs || 0, w.endMs || 0);
          last.confidence = w.confidence ?? last.confidence;
          continue;
        }
      }

      this.segments.push(
        createSegment({
          speakerId,
          startMs: w.startMs,
          endMs: w.endMs,
          text: w.text,
          confidence: w.confidence,
        })
      );
    }
    this._partialId = null;
    return this.segments;
  }

  setProcessing({ active, message } = {}) {
    if (!active) {
      if (this._partialId) {
        const idx = this.segments.findIndex((s) => s.id === this._partialId);
        if (idx >= 0) this.segments.splice(idx, 1);
        this._partialId = null;
      }
      return;
    }
    const text = message || 'Transcribing…';
    if (this._partialId) {
      const idx = this.segments.findIndex((s) => s.id === this._partialId);
      if (idx >= 0) {
        this.segments[idx] = { ...this.segments[idx], text, isFinal: false };
        return this.segments[idx];
      }
    }
    const seg = createSegment({
      speakerId: this.activeSpeakerId,
      startMs: this.lastSpeechStartMs || 0,
      endMs: this.lastSpeechEndMs || 0,
      text,
      isFinal: false,
    });
    this._partialId = seg.id;
    this.segments.push(seg);
    return seg;
  }
}
