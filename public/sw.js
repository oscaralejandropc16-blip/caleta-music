const CACHE_NAME = 'caleta-music-cache-v2';

// Recursos críticos a cachear para modo offline
const URLS_TO_CACHE = [
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(URLS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Para llamadas a la API, iTunes, o recursos externos - no cachear
    if (
        event.request.url.includes('itunes') ||
        event.request.url.includes('/api/') ||
        event.request.method !== 'GET'
    ) {
        return;
    }

    // Network-First strategy: intenta red primero, si falla usa caché
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Solo cachear respuestas exitosas
                if (response && response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                }
                return response;
            })
            .catch(() => {
                // Red falla, usar caché (modo offline)
                return caches.match(event.request);
            })
    );
});
