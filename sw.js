const CACHE = 'tiger-scribe-v11';
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

function shouldApplyCoi(request, response) {
  if (request.mode === 'navigate') return true;
  const type = response.headers.get('content-type') || '';
  return type.includes('text/html');
}

async function withCoiHeaders(response) {
  const body = await response.blob();
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(COI_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      const response = cached || (await fetch(event.request));
      if (!response?.ok || url.origin !== self.location.origin) return response;

      if (!cached && response.ok) {
        const clone = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, clone));
      }

      if (shouldApplyCoi(event.request, response)) {
        return withCoiHeaders(response);
      }
      return response;
    })
  );
});
