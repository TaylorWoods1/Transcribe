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

/** Default COEP mode — credentialless first (coi-serviceworker pattern). */
let coepCredentialless = true;
/** COOP/COEP injection — disabled on iOS where COEP breaks ONNX/Whisper WASM. */
let coiEnabled = true;

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

function coiHeaders() {
  const headers = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': coepCredentialless ? 'credentialless' : 'require-corp',
    'Origin-Agent-Cluster': '?1',
  };
  if (!coepCredentialless) {
    headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
  }
  return headers;
}

async function injectCoiHeaders(request, response) {
  if (response.status === 0) return response;

  const isHtml = isHtmlResponse(response) || request.mode === 'navigate';
  let body = response.body;

  if (isHtml) {
    let text = await response.text();
    text = text.replace(META_CSP_RE, '');
    body = text;
  }

  const headers = new Headers(response.headers);
  if (coiEnabled) {
    for (const [key, value] of Object.entries(coiHeaders())) {
      headers.set(key, value);
    }
  }
  if (isHtml) {
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Content-Security-Policy', CSP);
    headers.set('Cache-Control', 'no-cache');
  }

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function cacheResponse(request, response) {
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
}

async function respondFromNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const final = await injectCoiHeaders(request, response);
      await cacheResponse(request, final);
      return final;
    }
  } catch {
    /* offline */
  }
  const cached = await caches.match(request);
  if (!cached) throw new Error('Offline');
  return injectCoiHeaders(request, cached);
}

async function respondCacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return injectCoiHeaders(request, cached);
  }

  const response = await fetch(request);
  if (!response?.ok) return response;

  const final = await injectCoiHeaders(request, response);
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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'coepCredentialless') {
    coepCredentialless = event.data.value !== false;
  }
  if (event.data?.type === 'coiEnabled') {
    coiEnabled = event.data.value !== false;
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
    return;
  }

  const url = new URL(request.url);
  if (url.hostname.includes('cdn.jsdelivr.net') && url.pathname.includes('transformers')) {
    return;
  }
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  const fetchRequest =
    coepCredentialless && request.mode === 'no-cors'
      ? new Request(request, { credentials: 'omit' })
      : request;

  event.respondWith(
    isHtmlRequest(fetchRequest, url)
      ? respondFromNetworkFirst(fetchRequest)
      : respondCacheFirst(fetchRequest)
  );
});
