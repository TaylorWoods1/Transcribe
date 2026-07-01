/** App configuration — edit to personalize */
export const CONFIG = {
  appName: 'Tiger',
  appShortName: 'Tiger',
  version: '1.0.1',
  /** Bumped on every deploy by scripts/stamp-deploy-version.mjs */
  deployId: 'db859f5',

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

  /** Live capture — tuned for near-real-time on mobile */
  liveChunkIntervalMs: 2500,
  liveChunkMinMs: 1200,
  liveChunkMaxQueue: 3,
  liveUiThrottleMs: 80,
  speechEnergyThreshold: 0.03,
  manualSpeakerLockMs: 4000,

  /** Whisper live-chunk inference (shorter = faster per slice) */
  whisperLiveChunkLengthS: 12,
  whisperLiveStrideS: 2,
  /** Tighter live slices when multi-thread WASM is unavailable (single-thread fallback) */
  whisperLiveChunkLengthSingleThreadS: 6,
  whisperLiveStrideSingleThreadS: 1,
  liveChunkIntervalMsSingleThread: 1800,
  liveChunkMinMsSingleThread: 900,
  whisperWasmThreads: 4,

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

  whisperModel: 'onnx-community/whisper-tiny.en',
  whisperCdn: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/+esm',
  whisperDtype: {
    encoder_model: 'fp32',
    decoder_model_merged: 'q4',
  },

  /** Live clinical assist */
  liveAssistAiDebounceMs: 6000,
  liveAssistMinSegments: 1,
};
