const CACHE = 'tiger-scribe-v8';
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
  './js/export.js',
  './js/ui.js',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

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
  // Do not cache Whisper / transformers CDN models
  if (url.hostname.includes('cdn.jsdelivr.net') && url.pathname.includes('transformers')) {
    return;
  }
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response.ok || url.origin !== self.location.origin) return response;
        const clone = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
