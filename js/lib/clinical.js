/**
 * Shared clinical text analysis (red flags, transcript building).
 */
import { CONFIG } from '../../config.js';
import { speakerName } from './utils.js';

/**
 * Build a speaker-labelled transcript string.
 * @param {Array<{speakerId: string, text?: string, isFinal?: boolean}>} segments
 * @param {Array<{id: string, name?: string}>} speakers
 * @param {{ finalsOnly?: boolean }} [options]
 * @returns {string}
 */
export function buildTranscriptText(segments, speakers, { finalsOnly = false } = {}) {
  const list = (segments || []).filter((seg) => {
    if (!seg.text?.trim()) return false;
    if (finalsOnly && seg.isFinal === false) return false;
    return true;
  });
  return list
    .map((seg) => `${speakerName(speakers, seg.speakerId)}: ${seg.text}`)
    .join('\n');
}

/**
 * Detect configured red-flag keywords in transcript text.
 * @param {string} text
 * @returns {Array<{keyword: string, severity: string, message: string}>}
 */
export function detectRedFlags(text) {
  const lower = (text || '').toLowerCase();
  const flags = [];
  for (const keyword of CONFIG.redFlagKeywords) {
    if (lower.includes(keyword)) {
      flags.push({
        keyword,
        severity: 'high',
        message: `Red-flag term detected: "${keyword}". Consider urgent clinical review.`,
      });
    }
  }
  return flags;
}

/**
 * @returns {string}
 */
export function getDisclaimer() {
  return CONFIG.disclaimer;
}

/**
 * Merge overlapping words between consecutive chunk transcriptions.
 * @param {string} prevText
 * @param {string} nextText
 * @returns {string}
 */
export function mergeOverlappingText(prevText, nextText) {
  const a = (prevText || '').trim();
  const b = (nextText || '').trim();
  if (!a) return b;
  if (!b) return a;

  const wordsA = a.split(/\s+/);
  const wordsB = b.split(/\s+/);
  const maxOverlap = Math.min(wordsA.length, wordsB.length, 10);

  for (let len = maxOverlap; len >= 2; len--) {
    const suffix = wordsA
      .slice(-len)
      .join(' ')
      .toLowerCase()
      .replace(/[^\w\s']/g, '');
    const prefix = wordsB
      .slice(0, len)
      .join(' ')
      .toLowerCase()
      .replace(/[^\w\s']/g, '');
    if (suffix && suffix === prefix) {
      return `${wordsA.join(' ')} ${wordsB.slice(len).join(' ')}`.trim();
    }
  }

  return `${a} ${b}`.trim();
}
