/** App configuration — edit to personalize */
export const CONFIG = {
  appName: 'Tiger',
  appShortName: 'Tiger',
  version: '1.0.0',

  /** Default timezone offset label (GMT+10) */
  defaultTimezone: 'Australia/Sydney',
  defaultTimezoneOffset: '+10:00',

  /** Web Speech API language */
  defaultLanguage: 'en-AU',

  /** Speaker palette for diarization */
  speakerColors: ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'],

  defaultSpeakers: [
    { id: 'spk-1', name: 'Clinician', color: '#2563eb' },
    { id: 'spk-2', name: 'Patient', color: '#059669' },
  ],

  /** VAD: silence gap (ms) before auto speaker turn */
  silenceGapMs: 1200,

  /** Live capture */
  liveChunkIntervalMs: 5000,
  liveUiThrottleMs: 120,
  speechEnergyThreshold: 0.035,
  manualSpeakerLockMs: 4000,

  /** Red-flag keywords (Tier 3 stretch, included) */
  redFlagKeywords: [
    'chest pain',
    'shortness of breath',
    'difficulty breathing',
    'suicidal',
    'self harm',
    'severe bleeding',
    'loss of consciousness',
    'anaphylaxis',
    'stroke',
  ],

  /** Action extraction patterns */
  actionPatterns: [
    /\b(?:need to|needs to|should|must|will|going to|plan to|arrange|book|schedule|follow up|refer|order|prescribe|start|stop|continue|monitor|check|review|call|contact)\b[^.!?]{5,80}/gi,
    /\b(?:action|todo|task):\s*([^.!?\n]+)/gi,
  ],

  disclaimer:
    'Documentation support only — not medical advice. Always verify with qualified clinicians before clinical decisions.',

  whisperModel: 'Xenova/whisper-tiny.en',
  whisperCdn: 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2',
};
