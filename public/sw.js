// *** WARNING: THESE VALUES ARE CHANGED AUTOMATICALLY ON BUILD **
const CACHE_NAME = `texlyre-v0.3.8`; //`texlyre-v${process.env.npm_package_version || '1'}`;
const BASE_PATH = '/texlyre/';
// *** END AUTOMATIC CHANGE ***

console.log('[ServiceWorker] Service Worker loading with base path:', BASE_PATH);

const STATIC_ASSETS = [
  BASE_PATH + 'index.html'
];

self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing service worker');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching static assets:', STATIC_ASSETS);
        return Promise.all(
          STATIC_ASSETS.map(async (url) => {
            try {
              const response = await fetch(url);
              if (response.ok) {
                await cache.put(url, response);
                console.log('[ServiceWorker] Successfully cached:', url);
              } else {
                console.warn('Failed to fetch for caching:', url, response.status);
              }
            } catch (error) {
              console.error('Error caching asset:', url, error);
            }
          })
        );
      })
      .then(() => {
        console.log('[ServiceWorker] Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Error during cache setup:', error);
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating service worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[ServiceWorker] Service worker activated');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin || event.request.method !== 'GET') {
    return;
  }

  if (!url.pathname.startsWith(BASE_PATH)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[ServiceWorker] Serving from cache:', event.request.url);
          return cachedResponse;
        }

        return fetch(event.request)
          .then((response) => {
            if (response.status === 200 && response.type === 'basic') {
              const responseClone = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  console.log('[ServiceWorker] Caching new resource:', event.request.url);
                  cache.put(event.request, responseClone);
                });
            }
            return response;
          })
          .catch(() => {
            if (event.request.mode === 'navigate') {
              console.log('[ServiceWorker] Serving index.html for navigation');
              return caches.match(BASE_PATH + 'index.html');
            }
            throw new Error('Resource not available offline');
          });
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then((cache) => {
          console.log('[ServiceWorker] Manually caching URLs:', event.data.urls);
          return Promise.all(
            event.data.urls.map(async (url) => {
              try {
                const response = await fetch(url);
                if (response.ok) {
                  await cache.put(url, response);
                  console.log('[ServiceWorker] Successfully cached via message:', url);
                } else {
                  console.warn('Failed to fetch for message caching:', url, response.status);
                }
              } catch (error) {
                console.error('Error caching URL via message:', url, error);
              }
            })
          );
        })
    );
  }
});