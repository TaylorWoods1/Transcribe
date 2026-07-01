const DEPLOY_ID = 'dev';
const CACHE = `tiger-scribe-${DEPLOY_ID}`;

/** Single source of truth for CSP — injected as HTTP header only (not meta). */
const CSP =
  "default-src 'self'; " +
  "script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval' 'unsafe-eval'; " +
  "connect-src 'self' https:; " +
  "img-src 'self' data: blob:; " +
  "media-src 'self' blob:; " +
  "style-src 'self' 'unsafe-inline'; " +
  "worker-src 'self' blob: https://cdn.jsdelivr.net 'wasm-unsafe-eval' 'unsafe-eval'; " +
  "object-src 'none'; base-uri 'self'; form-action 'self';";

const SHELL = [
  './manifest.json',
  './config.js',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/audio.js',
  './js/transcribe-live.js',
  './js/transcribe-whisper.js',
  './js/transcribe-chunked.js',
  './js/vad.js',
  './js/diarize.js',
  './js/notes.js',
  './js/actions.js',
  './js/ai.js',
  './js/insights.js',
  './js/assist.js',
  './js/install-prompt.js',
  './js/runtime.js',
  './js/lib/utils.js',
  './js/lib/clinical.js',
  './js/lib/storage-keys.js',
  './js/lib/app-settings.js',
  './js/lib/coi-reload.js',
  './js/lib/ai-client.js',
  './js/lib/types.js',
  './js/export.js',
  './js/ui.js',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

/** Safari/WebKit does not support COEP credentialless — require-corp enables SharedArrayBuffer on iOS. */
function isWebKitSafari(ua = '') {
  return /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|EdgiOS|FxiOS/i.test(ua);
}

function getCoiHeaders(request) {
  const ua = request?.headers?.get?.('User-Agent') || '';
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': isWebKitSafari(ua) ? 'require-corp' : 'credentialless',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };
}

const META_CSP_RE = /<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>\s*/gi;

function isHtmlRequest(request, url) {
  if (request.mode === 'navigate') return true;
  const path = url.pathname;
  return path.endsWith('.html') || path.endsWith('/');
}

function isHtmlResponse(response) {
  const type = response.headers.get('content-type') || '';
  return type.includes('text/html');
}

/** Strip legacy meta CSP so it cannot conflict with the HTTP header policy. */
async function buildHtmlResponse(request, response) {
  let text = await response.text();
  text = text.replace(META_CSP_RE, '');
  const headers = new Headers();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  for (const [key, value] of Object.entries(getCoiHeaders(request))) {
    headers.set(key, value);
  }
  headers.set('Content-Security-Policy', CSP);
  headers.set('Cache-Control', 'no-cache');
  return new Response(text, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function finalizeResponse(request, response) {
  if (isHtmlResponse(response) || request.mode === 'navigate') {
    return buildHtmlResponse(request, response);
  }
  return response;
}

async function cacheResponse(request, response) {
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
}

async function respondFromNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const final = await finalizeResponse(request, response);
      await cacheResponse(request, final);
      return final;
    }
  } catch {
    /* offline */
  }
  const cached = await caches.match(request);
  if (!cached) throw new Error('Offline');
  return finalizeResponse(request, cached);
}

async function respondCacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return isHtmlResponse(cached) || request.mode === 'navigate'
      ? finalizeResponse(request, cached)
      : cached;
  }

  const response = await fetch(request);
  if (!response?.ok) return response;

  const final = await finalizeResponse(request, response);
  await cacheResponse(request, final);
  return final;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() =>
      caches.open(CACHE).then((cache) => cache.addAll(SHELL))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'sw-activated', deployId: DEPLOY_ID });
        }
      })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.hostname.includes('cdn.jsdelivr.net') && url.pathname.includes('transformers')) {
    return;
  }
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    isHtmlRequest(event.request, url)
      ? respondFromNetworkFirst(event.request)
      : respondCacheFirst(event.request)
  );
});
