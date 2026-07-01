const CACHE = 'tiger-scribe-v14';

/** Keep in sync with index.html meta CSP. Injected as HTTP header for Safari WASM. */
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
  './',
  './index.html',
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
  './js/runtime.js',
  './js/lib/utils.js',
  './js/lib/clinical.js',
  './js/lib/storage-keys.js',
  './js/lib/ai-client.js',
  './js/lib/types.js',
  './js/export.js',
  './js/ui.js',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

const COI_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

function isHtmlRequest(request, url) {
  if (request.mode === 'navigate') return true;
  const path = url.pathname;
  return path.endsWith('.html') || path.endsWith('/');
}

function shouldApplySecurityHeaders(request, response) {
  if (request.mode === 'navigate') return true;
  const type = response.headers.get('content-type') || '';
  return type.includes('text/html');
}

async function withSecurityHeaders(response) {
  const body = await response.blob();
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(COI_HEADERS)) {
    headers.set(key, value);
  }
  headers.set('Content-Security-Policy', CSP);
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function cacheResponse(request, response) {
  const clone = response.clone();
  const cache = await caches.open(CACHE);
  await cache.put(request, clone);
}

async function respondFromNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cacheResponse(request, response);
      return shouldApplySecurityHeaders(request, response)
        ? withSecurityHeaders(response)
        : response;
    }
  } catch {
    /* offline — fall back to cache */
  }
  const cached = await caches.match(request);
  if (!cached) throw new Error('Offline');
  return shouldApplySecurityHeaders(request, cached) ? withSecurityHeaders(cached) : cached;
}

async function respondCacheFirst(request, url) {
  const cached = await caches.match(request);
  const response = cached || (await fetch(request));
  if (!response?.ok || url.origin !== self.location.origin) return response;

  if (!cached && response.ok) {
    await cacheResponse(request, response);
  }

  return shouldApplySecurityHeaders(request, response) ? withSecurityHeaders(response) : response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
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
      : respondCacheFirst(event.request, url)
  );
});
