// These constants are automatically generated. Do not edit directly.
// Generated on: 2026-07-03T08:36:41.129Z
const CACHE_NAME = `texlyre-v0.9.5`;
const BASE_PATH = '/texlyre/';
const FONTS_CACHE_NAME = 'fonts-cache-v1';
const AIRGAP_ALLOWED_DOMAINS = [
	"texlyre.org",
	"texlyre.github.io",
	"typst.org"
];
const AIRGAP_ALLOWED_PROTOCOLS = [
	"https:",
	"http:",
	"wss:",
	"ws:"
];
// *** End automatic generation ***

let airgapExternalRequests = false;
let forceOfflineMode = false;

function networkFetch(request) {
  if (forceOfflineMode) {
    return Promise.reject(new TypeError('Force offline mode'));
  }

  return fetch(request);
}

console.log('[ServiceWorker] Service Worker loading with base path:', BASE_PATH);

const APP_SHELL_URL = new URL(BASE_PATH + 'index.html', self.location.origin).href;

const STATIC_ASSETS = [
  APP_SHELL_URL
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

function isAllowedAirgapProtocol(protocol) {
  return AIRGAP_ALLOWED_PROTOCOLS.includes(protocol);
}

function isAllowedAirgapHost(hostname) {
  return AIRGAP_ALLOWED_DOMAINS.some((domain) => {
    return hostname === domain || hostname.endsWith(`.${domain}`);
  });
}

function isBlockedByAirgap(request) {
  const url = new URL(request.url);

  if (!isAllowedAirgapProtocol(url.protocol)) {
    return false;
  }

  if (url.origin === self.location.origin || url.hostname === self.location.hostname) {
    return false;
  }

  if (isAllowedAirgapHost(url.hostname)) {
    return false;
  }

  return true;
}

function blockedByAirgapResponse(request) {
  if (
    request.destination === 'image' ||
    request.destination === 'video' ||
    request.destination === 'audio'
  ) {
    return new Response('', {
      status: 204,
      statusText: 'Blocked by air-gap mode',
    });
  }

  return new Response('Blocked by air-gap mode.', {
    status: 451,
    statusText: 'Blocked by air-gap mode',
    headers: {
      'Content-Type': 'text/plain',
    },
  });
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
              const response = await networkFetch(url);
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
    if (!forceOfflineMode && navigator.onLine && age > maxAge) {
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

  if (airgapExternalRequests && isBlockedByAirgap(event.request)) {
    event.respondWith(
      (async () => {
        const cachedResponse =
          await caches.match(event.request) ||
          await caches.match(event.request.url);

        if (cachedResponse) {
          console.log('[ServiceWorker] Serving air-gap blocked resource from cache:', event.request.url);
          return cachedResponse;
        }

        console.warn('[ServiceWorker] Blocked request by air-gap mode:', event.request.url);
        return blockedByAirgapResponse(event.request);
      })()
    );

    return;
  }

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
            const response = await networkFetch(event.request);
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

  if (event.request.method !== 'GET') {
    return;
  }

  const isSameOriginAppResource =
    url.origin === self.location.origin &&
    url.pathname.startsWith(BASE_PATH);

  const isAllowedExternalResource =
    url.origin !== self.location.origin &&
    isAllowedAirgapProtocol(url.protocol) &&
    isAllowedAirgapHost(url.hostname);

  if (!isSameOriginAppResource && !isAllowedExternalResource) {
    return;
  }

  event.respondWith(
    (async () => {
      const cachedResponse =
        await caches.match(event.request) ||
        await caches.match(event.request.url);

      if (forceOfflineMode) {
        if (cachedResponse) {
          console.log('[ServiceWorker] Serving from cache in force offline mode:', event.request.url);
          return cachedResponse;
        }

        if (event.request.mode === 'navigate') {
          console.log('[ServiceWorker] Serving index.html for navigation in force offline mode');
          return caches.match(APP_SHELL_URL);
        }

        throw new Error('Resource not available offline');
      }

      try {
        const response = await networkFetch(event.request);

        if (response.status === 200 && response.type !== 'error') {
          const responseClone = response.clone();

          event.waitUntil(
            caches.open(CACHE_NAME)
              .then((cache) => {
                console.log('[ServiceWorker] Caching resource:', event.request.url);
                return cache.put(event.request, responseClone);
              })
              .catch((error) => {
                console.warn('[ServiceWorker] Failed to cache resource:', event.request.url, error);
              })
          );
        }

        return response;
      } catch (error) {
        if (cachedResponse) {
          console.log('[ServiceWorker] Serving from cache:', event.request.url);
          return cachedResponse;
        }

        if (event.request.mode === 'navigate') {
          console.log('[ServiceWorker] Serving index.html for navigation');
          return caches.match(APP_SHELL_URL);
        }

        throw new Error('Resource not available offline');
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_FORCE_OFFLINE_MODE') {
    forceOfflineMode = event.data.enabled === true;
    console.log('[ServiceWorker] Force offline mode:', forceOfflineMode);
    return;
  }

  if (event.data && event.data.type === 'SET_AIRGAP_EXTERNAL_REQUESTS') {
    airgapExternalRequests = event.data.enabled === true;
    console.log('[ServiceWorker] Air-gap external requests:', airgapExternalRequests);
    return;
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then((cache) => {
          console.log('[ServiceWorker] Manually caching URLs:', event.data.urls);
          return Promise.all(
            event.data.urls.map(async (url) => {
              try {
                const response = await networkFetch(url);
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
