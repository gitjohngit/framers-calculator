// Service Worker for Framers Calculator PWA
var CACHE_NAME = 'framers-calc-v1';
var ASSETS = [
    '/framers-calculator.html',
    '/assets/css/framers-calculator.css',
    '/assets/js/framers-calculator.js',
    '/manifest.json'
];

// Install - cache core assets
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys.filter(function (k) { return k !== CACHE_NAME; })
                    .map(function (k) { return caches.delete(k); })
            );
        })
    );
    self.clients.claim();
});

// Fetch - serve from cache, fall back to network
self.addEventListener('fetch', function (event) {
    event.respondWith(
        caches.match(event.request).then(function (cached) {
            return cached || fetch(event.request).then(function (response) {
                // Cache successful responses for offline use
                if (response.ok) {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function (cache) {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            }).catch(function () {
                // Offline fallback for navigation
                if (event.request.mode === 'navigate') {
                    return caches.match('/framers-calculator.html');
                }
            });
        })
    );
});
