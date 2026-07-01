# Architecture

Tiger is a **vanilla ES-module PWA** with no build step for production. Development tooling (Vitest, ESLint) runs in Node.js only.

## Layers

```
index.html / manifest.json / sw.js     Shell & offline cache
config.js                              Tunable constants
js/app.js                              Orchestration, routing, recording lifecycle
js/lib/                                Shared pure utilities (no DOM)
  utils.js                             Formatting, escaping, sanitization
  clinical.js                          Transcript text, red flags, overlap merge
  storage-keys.js                      localStorage keys + migration
  types.js                             JSDoc typedefs (Encounter, Segment, …)
  ai-client.js                         OpenAI-compatible HTTP client
js/db.js                               IndexedDB persistence
js/audio.js                            MediaRecorder + playback
js/transcribe-*.js                     Speech-to-text pipelines
js/diarize.js                          Speaker turns & segments
js/assist.js                           Live clinical suggestions (rules)
js/ai.js                               Optional cloud AI + fallbacks
js/ui.js                               DOM rendering
```

## Data model

### Encounter (IndexedDB `tiger-scribe` / `encounters`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | `enc-{uuid}` |
| `title` | string | User-editable |
| `createdAt` / `updatedAt` | number | Unix ms |
| `durationMs` | number | Recording length |
| `audioBlob` | Blob \| null | WebM/MP4 |
| `speakers` | `{id,name,color}[]` | Diarization labels |
| `segments` | Segment[] | Transcript |
| `notes` | SOAP object | subjective/objective/assessment/plan/freeform |
| `actions` | Action[] | Checkbox items |
| `insights` | object | Summary, entities, questions, considerations |
| `settings` | object | Per-encounter language, enhanced flag |

### Segment

| Field | Type |
|-------|------|
| `id` | string |
| `speakerId` | string |
| `startMs` / `endMs` | number |
| `text` | string |
| `confidence` | number \| null |
| `isFinal` | boolean |

## Transcription paths

1. **Web Speech API** (`transcribe-live.js`) — Chrome/desktop; partial + final events
2. **Whisper chunked** (`transcribe-chunked.js` + `transcribe-whisper.js`) — iOS/Safari; ~2.5s VAD-gated chunks
3. **Post-record Whisper** — full blob after stop

## Service worker

- Cache name: `tiger-scribe-{deployId}` — unique per deploy (git SHA stamped by CI)
- **Deploy cache bust** — `npm run stamp:deploy` rewrites `deployId` in `config.js`, `sw.js`, and `?v=` query params in `index.html` before GitHub Pages publish
- Injects **COOP/COEP** and **Content-Security-Policy** HTTP headers on HTML (required for Safari WASM)
- Strips any legacy `<meta>` CSP from cached HTML to prevent dual-policy blocks
- **Network-first** for HTML; install wipes all prior caches
- Does **not** cache Whisper models from CDN

## Testing

```bash
npm ci
npm run generate:icons   # PWA PNGs from icons/icon.svg
npm run check            # lint + unit tests + Playwright smoke
```

- **Unit / integration** — Vitest in `tests/`; IndexedDB via `fake-indexeddb` (`tests/db.test.js`)
- **E2E smoke** — Playwright in `e2e/` against `python3 -m http.server 4173`

Pure logic lives in `js/lib/` and feature modules.

## Migration

On first open after upgrade, `js/db.js` copies encounters from legacy IndexedDB `lucy-scribe` into `tiger-scribe` once (flag in `tiger-db-flags`). localStorage keys migrate from `lucy-*` to `tiger-*` on every app init via `migrateStorageKeys()`.
