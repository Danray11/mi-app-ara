const CACHE_NAME = 'pdfsap-v1';

// Archivos del "app shell" que queremos offline
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.js'
];

// Instala SW y precachea el shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activa y limpia caches viejas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME) && caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estrategia: cache-first con actualización en segundo plano
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((res) => {
        // Guarda copia si la respuesta es OK y del mismo origen o permitido
        try {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        } catch {}
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
