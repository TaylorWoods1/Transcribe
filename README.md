# Tiger

> **Live app:** https://taylorwoods1.github.io/Transcribe/  
> (Must include `/Transcribe/` — the root `taylorwoods1.github.io` URL will show “site not found”.)

A local-first, vanilla Progressive Web App for clinical encounter transcription, speaker diarization, SOAP note generation, and action-item extraction. No build step for production; optional dev tooling for tests and lint.

## Features

### Core
- **Encounters** — create, list, search, open, and delete sessions
- **Audio recording** — pause/resume, waveform visualization via MediaRecorder + Web Audio API
- **Live transcription** — Web Speech API (Chrome) or chunked Whisper (iOS)
- **Enhanced transcription** — on-device Whisper via `@huggingface/transformers` (CDN, ~40MB first download)
- **Live clinical assist** — rule-based questions, response ideas, differentials; optional AI enhancement
- **Diarization** — speaker switching, silence-gap turn detection, manual segment editing
- **SOAP notes** — extractive generation + optional AI
- **Export** — JSON, Markdown, plain text, SRT, VTT, and audio
- **IndexedDB** — all encounter data stays on device

### Quality & security
- **Vitest** unit + IndexedDB integration tests (`npm test`)
- **Playwright** E2E smoke tests (`npm run test:e2e`)
- **ESLint** static analysis (`npm run lint`)
- **CI** runs lint + tests + E2E before every deploy
- **CSP**, HTML escaping, color sanitization, AI URL validation
- See [SECURITY.md](SECURITY.md) and [ARCHITECTURE.md](ARCHITECTURE.md)

## Development

```bash
# Serve the app (required for ES modules + service worker)
python3 -m http.server 8080

# Install dev tooling
npm ci
npm run generate:icons

# Lint + unit + E2E
npm run check
```

## Live app (GitHub Pages)

**URL:** https://taylorwoods1.github.io/Transcribe/

### Install on iPhone
1. Open Safari → URL above
2. Share → **Add to Home Screen** → name **Tiger**

### Whisper on iPhone
1. Settings → download Whisper model
2. Enable **Auto-transcribe after recording**
3. Check **On-device runtime** shows multi-thread WASM after one reload

## Privacy model

| Data | Storage | Leaves device? |
|------|---------|----------------|
| Encounters, audio, transcripts | IndexedDB | Only via export |
| Settings | localStorage (`tiger-*`) | No |
| AI API key | localStorage | User-configured HTTPS API only |
| Whisper model | Browser cache (jsDelivr) | Downloaded on demand |

## Browser support

| Feature | Chrome | Safari | Firefox |
|---------|--------|--------|---------|
| Recording | ✅ | ✅ | ✅ |
| Live STT | ✅ | ❌ | ❌ |
| Whisper live chunks | ✅ | ✅ | ✅ |
| PWA install | ✅ | ✅ | Limited |

## Project structure

```
index.html              Entry point + CSP
config.js               App configuration
sw.js                   Service worker (v14) + COI/CSP headers
js/
  app.js                Orchestration
  lib/                  Shared utilities (tested)
    utils.js            Formatting, escaping, sanitization
    clinical.js         Transcript text, red flags
    storage-keys.js     localStorage keys + migration
    types.js            JSDoc typedefs
    ai-client.js        OpenAI-compatible HTTP client
  db.js                 IndexedDB
  audio.js              Recording & playback
  transcribe-*.js       Speech-to-text pipelines
  diarize.js            Speaker turns
  assist.js             Live clinical suggestions
  ai.js                 Optional cloud AI
  ui.js                 DOM rendering
tests/                  Vitest unit + db integration tests
e2e/                    Playwright smoke tests
scripts/                Dev scripts (icon generation)
.github/workflows/      CI + deploy
```

## Deployment

Pushes to `main` run **CI** (lint + unit + E2E) then deploy to **`gh-pages`** via GitHub Actions.

## Disclaimer

**Documentation support only — not medical advice.** Always verify AI-generated or transcribed content with qualified clinicians before clinical decisions.

## License

MIT — see [LICENSE](LICENSE)
