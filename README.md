# Lucy Scribe

A local-first, vanilla Progressive Web App for clinical encounter transcription, speaker diarization, SOAP note generation, and action-item extraction. No build step, no framework, no backend required for core functionality.

## Features

### Tier 1 (core)
- **Encounters** — create, list, search, open, and delete sessions
- **Audio recording** — pause/resume, waveform visualization via MediaRecorder + Web Audio API
- **Live transcription** — Web Speech API (Chrome recommended)
- **Enhanced transcription** — opt-in Whisper via `@xenova/transformers` (CDN, ~40MB first download)
- **Diarization** — speaker switching, silence-gap turn detection, manual segment editing
- **Transcript UI** — timestamps, speaker labels, inline edit, in-session search
- **SOAP notes** — Subjective, Objective, Assessment, Plan + freeform (extractive generation)
- **Action items** — rule-based extraction with optional AI enhancement
- **Export** — JSON, Markdown, plain text, SRT, VTT, and audio
- **Settings** — timezone (default Australia/Sydney GMT+10), language, speakers, API key, enhanced mode
- **IndexedDB** — audio blobs, transcripts, and notes stored locally

### Tier 2
- Optional AI summarization (OpenAI-compatible API, user-supplied key)
- Live assist panel during recording
- Full-text search across encounters
- Keyboard shortcuts (`R` record/stop, `S` switch speaker)
- Dark mode
- Audio playback with click-to-seek on transcript segments

### Tier 3 (included where feasible)
- Red-flag keyword detection in Insights
- Confidence scores on Whisper segments
- Offline transcription via imported audio files

## Local development

No install or build step required. Serve the repository root as static files:

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

> **Note:** ES modules and service workers require an HTTP server — `file://` will not work.

## Install as PWA

1. Open the app in Chrome (Android/desktop) or Safari (iOS).
2. Use **Add to Home Screen** / **Install app**.
3. The service worker caches the app shell for offline use.

## Privacy model

- All encounter data, audio, and transcripts stay in **IndexedDB** on your device.
- Optional AI settings (API URL + key) are stored in **localStorage** only.
- Whisper models are downloaded from jsDelivr CDN when you enable enhanced transcription — they are cached by the browser, not by our service worker.
- Export is explicit — nothing leaves your device unless you export or call an AI API you configure.

## Browser support

| Feature | Chrome | Safari | Firefox |
|---------|--------|--------|---------|
| Recording | ✅ | ✅ | ✅ |
| Live STT | ✅ | ❌ | ❌ |
| Enhanced (Whisper) | ✅ | ✅* | ✅* |
| PWA install | ✅ | ✅ | Limited |

\*Whisper in-browser is CPU-intensive; desktop Chrome recommended for enhanced mode.

## Optional AI setup

1. Open **Settings**.
2. Enter your OpenAI-compatible **API base URL** and **API key**.
3. Use **Generate SOAP notes**, **AI summary**, or **Extract actions** for cloud-assisted results.

Without an API key, the app uses **extractive fallback** summarization so core workflows are never blocked.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `R` | Start / stop recording |
| `S` | Cycle active speaker |

## Project structure

```
index.html          Entry point
manifest.json       PWA manifest
sw.js               Service worker (app shell only)
config.js           App configuration
css/styles.css      Styles
js/
  app.js            Orchestration & routing
  db.js             IndexedDB
  audio.js          Recording & playback
  transcribe-live.js
  transcribe-whisper.js
  diarize.js
  notes.js
  actions.js
  ai.js
  insights.js
  export.js
  ui.js
icons/icon.svg
.github/workflows/deploy.yml
```

## Deployment

Pushes to `main` deploy to GitHub Pages via `peaceiris/actions-gh-pages@v4`. A `.nojekyll` file is included for correct static serving.

## Disclaimer

**Documentation support only — not medical advice.** Always verify AI-generated or transcribed content with qualified clinicians before clinical decisions.

## License

MIT
