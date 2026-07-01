# Security Policy

## Reporting a vulnerability

If you discover a security issue, please open a private security advisory on GitHub or contact the repository owner directly. Do not open public issues for undisclosed vulnerabilities.

## Threat model

Tiger is a **client-only PWA**. All clinical data (audio, transcripts, notes) is stored in **IndexedDB** on the user's device.

### In scope

- Cross-site scripting (XSS) via transcript or settings UI
- Insecure handling of optional AI API keys in localStorage
- Service worker cache poisoning or scope issues
- Microphone permission misuse
- Export/download data leakage

### Out of scope

- Server-side attacks (no backend)
- Attacks requiring physical device access
- Compromise of third-party APIs the user configures (OpenAI-compatible endpoints)
- Compromise of Hugging Face / jsDelivr CDN (user trusts these when downloading Whisper)

## Data handling

| Data | Storage | Leaves device? |
|------|---------|----------------|
| Encounters, audio, transcripts | IndexedDB | Only via explicit export |
| App settings | localStorage (`tiger-*`) | No |
| AI API key | localStorage (`tiger-ai-settings`) | Sent to user-configured HTTPS API only |
| Whisper model | Browser cache (CDN) | Downloaded from jsDelivr |

## Security controls

- **HTML escaping** — user-facing strings rendered via `escapeHtml()` in `js/lib/utils.js`
- **Color sanitization** — speaker colors validated as hex (`sanitizeColor`)
- **AI URL validation** — HTTPS-only base URLs; credentials in URL rejected (`normalizeBaseUrl`)
- **Content-Security-Policy** — restricts script/connect sources in `index.html`
- **Cross-origin isolation** — COOP/COEP via service worker for WASM threading (not for security isolation of clinical data)
- **No eval** — no `eval`, `new Function`, or `document.write`

## Recommendations for deployers

1. Always serve over **HTTPS** (GitHub Pages provides this).
2. Treat optional AI keys as **sensitive** — they persist in localStorage.
3. Instruct users that enhanced transcription downloads models from the public internet.
4. Hard-refresh after updates to pick up service worker changes.

## Supported versions

| Version | Supported |
|---------|-----------|
| `main` (latest deploy) | Yes |
