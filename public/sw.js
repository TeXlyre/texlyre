// These constants are automatically generated. Do not edit directly. **
const CACHE_NAME = `texlyre-v0.5.29`;
const BASE_PATH = '/texlyre/';
const FONTS_CACHE_NAME = 'fonts-cache-v1';
// *** End automatic generation ***

console.log('[ServiceWorker] Service Worker loading with base path:', BASE_PATH);

const STATIC_ASSETS = [
  BASE_PATH + 'index.html'
];

const CACHE_MAX_AGE = {
  [FONTS_CACHE_NAME]: 60 * 60 * 24 * 365 * 1000,
};

const SHARE_TARGET_DB = 'texlyre-share-target';
const SHARE_TARGET_STORE = 'pending-shares';

function openShareDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_TARGET_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SHARE_TARGET_STORE)) {
        req.result.createObjectStore(SHARE_TARGET_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function handleShareTarget(request) {
  const formData = await request.formData();
  const fileEntries = formData.getAll('files');

  const pendingFiles = await Promise.all(
    fileEntries
      .filter((entry) => entry instanceof File)
      .map(async (file) => ({
        name: file.name,
        type: file.type,
        buffer: await file.arrayBuffer(),
      }))
  );

  if (pendingFiles.length > 0) {
    const share = {
      id: crypto.randomUUID(),
      files: pendingFiles,
      receivedAt: Date.now(),
    };

    const db = await openShareDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SHARE_TARGET_STORE, 'readwrite');
      const req = tx.objectStore(SHARE_TARGET_STORE).put(share);
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    });
  }

  return Response.redirect(BASE_PATH, 303);
}

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
          if (cacheName !== CACHE_NAME && cacheName !== FONTS_CACHE_NAME) {
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

async function getCachedWithExpiry(cacheName, request, maxAge) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (!cached) {
    return null;
  }

  const cachedTime = cached.headers.get('sw-cached-time');
  if (cachedTime) {
    const age = Date.now() - parseInt(cachedTime, 10);
    if (navigator.onLine && age > maxAge) {
      console.log('[ServiceWorker] Cache expired and online, fetching fresh:', request.url);
      return null;
    }
  }

  console.log('[ServiceWorker] Serving from cache:', request.url);
  return cached;
}

async function cacheWithExpiry(cacheName, request, response) {
  const cache = await caches.open(cacheName);
  const headers = new Headers(response.headers);
  headers.set('sw-cached-time', Date.now().toString());

  const modifiedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });

  await cache.put(request, modifiedResponse);
  console.log('[ServiceWorker] Cached with timestamp:', request.url);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.searchParams.has('share-target')) {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      getCachedWithExpiry(FONTS_CACHE_NAME, event.request, CACHE_MAX_AGE[FONTS_CACHE_NAME])
        .then(async (cached) => {
          if (cached) {
            return cached;
          }

          try {
            const response = await fetch(event.request);
            if (response.ok) {
              await cacheWithExpiry(FONTS_CACHE_NAME, event.request, response.clone());
            }
            return response;
          } catch (error) {
            console.error('[ServiceWorker] Fetch failed for fonts:', error);
            const fallbackCached = await caches.match(event.request);
            if (fallbackCached) {
              return fallbackCached;
            }
            throw error;
          }
        })
    );
    return;
  }

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