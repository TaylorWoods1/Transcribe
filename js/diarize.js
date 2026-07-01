/**
 * Speaker turn detection via VAD/silence gaps + manual assignment.
 */
import { CONFIG } from '../config.js';
import { createId } from './db.js';

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
    this.segments = [];
    this._partialId = null;
  }

  setActiveSpeaker(speakerId) {
    this.activeSpeakerId = speakerId;
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
    if (gap > this.silenceGapMs && this.speakers.length > 1) {
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
}

export function formatTimestamp(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
