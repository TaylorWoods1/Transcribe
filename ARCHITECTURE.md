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

### Encounter (IndexedDB `lucy-scribe` / `encounters`)

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

- Cache name: `tiger-scribe-v10` (bump on breaking shell changes)
- Injects **COOP/COEP** headers for `SharedArrayBuffer` / multi-thread WASM
- Does **not** cache Whisper models from CDN

## Testing

```bash
npm ci
npm run check   # lint + test
```

Pure logic lives in `js/lib/` and feature modules — tests in `tests/` use Vitest (Node).

## Naming note

IndexedDB database remains `lucy-scribe` for backward compatibility. localStorage keys migrated from `lucy-*` to `tiger-*` on first load.
