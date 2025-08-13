/**
 * Progressive Web App Service Worker
 * 
 * Provides offline capability and caching for the OFM onboarding flow.
 * Optimized for mobile networks with intelligent caching strategies.
 */

const CACHE_NAME = 'ofm-onboarding-v1.0.0';
const STATIC_CACHE = 'ofm-static-v1';
const DYNAMIC_CACHE = 'ofm-dynamic-v1';

// Files to cache immediately (critical resources)
const STATIC_FILES = [
  '/',
  '/onboarding',
  '/static/css/mobile-first.css',
  '/static/js/mobile-detection.js',
  '/static/js/mobile-optimization.js',
  '/static/icons/icon-192x192.png',
  '/static/icons/icon-512x512.png',
  '/manifest.json'
];

// Network-first strategies for these routes
const NETWORK_FIRST_ROUTES = [
  '/api/onboarding/',
  '/api/stripe/',
  '/api/business-rules/'
];

// Cache-first strategies for these resources
const CACHE_FIRST_PATTERNS = [
  /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
  /\.(?:css|js)$/,
  /fonts\//
];

/**
 * Install Event - Cache static resources
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('[SW] Static files cached successfully');
        // Force activate immediately
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static files:', error);
      })
  );
});

/**
 * Activate Event - Clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old caches
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        // Take control of all pages immediately
        return self.clients.claim();
      })
  );
});

/**
 * Fetch Event - Handle all network requests
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Handle different caching strategies
  event.respondWith(
    handleRequest(request, url)
  );
});

/**
 * Main request handler with intelligent caching strategies
 */
async function handleRequest(request, url) {
  try {
    // Network-first for API calls (always try network first)
    if (isNetworkFirstRoute(url.pathname)) {
      return await networkFirst(request);
    }
    
    // Cache-first for static resources
    if (isCacheFirstResource(url.pathname)) {
      return await cacheFirst(request);
    }
    
    // Stale-while-revalidate for HTML pages
    if (request.headers.get('accept')?.includes('text/html')) {
      return await staleWhileRevalidate(request);
    }
    
    // Default: try cache first, then network
    return await cacheFirst(request);
    
  } catch (error) {
    console.error('[SW] Request handling failed:', error);
    
    // Return offline fallback if available
    return await getOfflineFallback(request);
  }
}

/**
 * Network-first strategy (for API calls)
 */
async function networkFirst(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful responses
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', error);
    
    // Fallback to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

/**
 * Cache-first strategy (for static resources)
 */
async function cacheFirst(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Fallback to network
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache the response
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache and network both failed:', error);
    throw error;
  }
}

/**
 * Stale-while-revalidate strategy (for HTML pages)
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await cache.match(request);
  
  // Always try to fetch from network in background
  const networkResponse = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch((error) => {
      console.log('[SW] Background fetch failed:', error);
      return null;
    });
  
  // Return cached response immediately if available
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Otherwise wait for network
  return await networkResponse;
}

/**
 * Get offline fallback response
 */
async function getOfflineFallback(request) {
  // For HTML requests, return cached index page or offline page
  if (request.headers.get('accept')?.includes('text/html')) {
    const cachedPage = await caches.match('/') || 
                      await caches.match('/onboarding');
    
    if (cachedPage) {
      return cachedPage;
    }
    
    // Return basic offline HTML
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Offline - OFM Onboarding</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            text-align: center; 
            padding: 40px 20px;
            color: #374151;
          }
          .icon { font-size: 48px; margin-bottom: 16px; }
          .title { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
          .message { font-size: 16px; color: #6b7280; margin-bottom: 24px; }
          .button {
            background: #6366f1;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div class="icon">📱</div>
        <h1 class="title">You're Offline</h1>
        <p class="message">Check your internet connection and try again.</p>
        <button class="button" onclick="window.location.reload()">Retry</button>
      </body>
      </html>
    `, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  }
  
  // For other requests, return 503
  return new Response('Service Unavailable', { 
    status: 503,
    statusText: 'Service Unavailable' 
  });
}

/**
 * Helper functions
 */
function isNetworkFirstRoute(pathname) {
  return NETWORK_FIRST_ROUTES.some(route => pathname.startsWith(route));
}

function isCacheFirstResource(pathname) {
  return CACHE_FIRST_PATTERNS.some(pattern => pattern.test(pathname));
}

/**
 * Background sync for failed requests
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync-onboarding') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(handleBackgroundSync());
  }
});

async function handleBackgroundSync() {
  // Retry failed onboarding requests when connection is restored
  try {
    const failedRequests = await getFailedRequests();
    
    for (const request of failedRequests) {
      try {
        await fetch(request);
        await removeFailedRequest(request);
      } catch (error) {
        console.log('[SW] Background sync retry failed:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Background sync error:', error);
  }
}

// Placeholder functions for background sync storage
async function getFailedRequests() {
  // Implementation would retrieve failed requests from IndexedDB
  return [];
}

async function removeFailedRequest(request) {
  // Implementation would remove request from IndexedDB
  return;
}

/**
 * Push notifications for onboarding updates
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/static/icons/icon-192x192.png',
      badge: '/static/icons/badge-72x72.png',
      vibrate: [200, 100, 200],
      data: data.url,
      actions: [
        {
          action: 'open',
          title: 'Continue Onboarding',
          icon: '/static/icons/action-open.png'
        },
        {
          action: 'dismiss',
          title: 'Later',
          icon: '/static/icons/action-dismiss.png'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  } catch (error) {
    console.error('[SW] Push notification error:', error);
  }
});

/**
 * Notification click handling
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow(event.notification.data || '/onboarding')
    );
  }
});

console.log('[SW] Service worker loaded successfully');