var CACHE_NAME = 'yoman-avoda-v30';

// App shell — must be cached for the app to work offline.
var CORE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Third-party scripts the app depends on (Supabase client, html2canvas, hebcal).
// Fetched with an explicit CORS request so the response is NOT opaque and can be
// validated + stored. Without these cached, an offline launch loses the Hebrew
// date and any report/image export.
//
// ⚠️ Versions are pinned exactly — never go back to a floating '@2' / '@4'.
// A publisher-side release then breaks the app with no code change here, and
// the break is unreproducible from the repo. Must stay identical to the tags
// in index.html, or the SW caches a build the page never asks for.
var CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/dist/umd/supabase.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdn.jsdelivr.net/npm/@hebcal/core@4.5.1/dist/hdate-bundle.min.js'
];

// Supabase traffic must never be intercepted or cached — a stale cached read
// would look like fresh cloud data.
function isSupabaseRequest(url) {
  return url.indexOf('supabase.co') !== -1;
}

// The auto-update version probe (raw.githubusercontent) must never be cached:
// it used to add a fresh ~950KB entry on every check.
function isVersionCheck(url) {
  return url.indexOf('raw.githubusercontent.com') !== -1;
}

var OFFLINE_HTML =
  '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
  '<title>אין חיבור</title></head>' +
  '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
  'background:#101A3A;color:#F5EDD6;font-family:Heebo,Arial,sans-serif;text-align:center;padding:24px">' +
  '<div><div style="font-size:44px;margin-bottom:12px">📕</div>' +
  '<div style="font-size:20px;font-weight:700;margin-bottom:8px">יומן עבודה — אין חיבור</div>' +
  '<div style="font-size:14px;opacity:.8;line-height:1.6">הדף המבוקש אינו שמור במכשיר.<br>' +
  'התחבר לאינטרנט ונסה שוב.</div></div></body></html>';

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// CDN cache self-healing. A CDN script missing from the cache (deleted by a
// sibling app before the activate prefix fix, or a transient network failure
// during install) was never re-added: at runtime the page loads it as a no-cors
// request, the response is opaque, and networkFirst refuses to store it. Runs
// on activate and once per SW startup, fetches only what's missing, and any
// failure is silent — so damaged devices heal on their own, without waiting
// for a new version.
function ensureCdnCached() {
  return caches.open(CACHE_NAME).then(function(cache) {
    return Promise.all(CDN_ASSETS.map(function(url) {
      return cache.match(url, { ignoreVary: true }).then(function(hit) {
        if (hit) return;
        return fetch(new Request(url, { mode: 'cors', credentials: 'omit' }))
          .then(function(res) {
            if (res && res.ok && res.type !== 'opaque') {
              console.log('[SW] healed CDN asset:', url);
              return cache.put(url, res);
            }
          });
      }).catch(function() {});
    }));
  }).catch(function() {});
}
ensureCdnCached(); // top-level = runs once every time the SW wakes up

// Install - cache the app shell (required) and the CDN scripts (best effort)
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Caching core assets');
      return cache.addAll(CORE).then(function() {
        // A CDN hiccup must not fail the whole install — ensureCdnCached()
        // fills in whatever is missing on activate / the next SW startup.
        return Promise.all(CDN_ASSETS.map(function(url) {
          return fetch(new Request(url, { mode: 'cors', credentials: 'omit' }))
            .then(function(res) {
              if (res && res.ok && res.type !== 'opaque') return cache.put(url, res);
              console.warn('[SW] skipped CDN asset:', url);
            })
            .catch(function(err) { console.warn('[SW] CDN asset failed:', url, err); });
        }));
      });
    }).then(function() { return self.skipWaiting(); })
  );
});

// Activate - drop old caches, but only once the new cache really holds the shell
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.match('./index.html'); })
      .then(function(indexHit) {
        if (!indexHit) {
          // Install didn't complete properly — keeping the old cache is far better
          // than leaving the user with nothing offline.
          console.warn('[SW] index.html missing from ' + CACHE_NAME + ' — old caches kept');
          return;
        }
        // ⚠️ All three apps live on the same origin (ygtotlrl-lab.github.io) and
        // share one CacheStorage. Delete ONLY this app's caches (prefix
        // 'yoman-avoda-') — deleting "everything that isn't CACHE_NAME" wiped
        // the caches of schar-limud and hanhala-ruchanit and broke their
        // offline support. Never remove this filter.
        return caches.keys().then(function(cacheNames) {
          return Promise.all(
            cacheNames.filter(function(name) {
              return name.indexOf('yoman-avoda-') === 0 && name !== CACHE_NAME;
            }).map(function(name) {
              return caches.delete(name);
            })
          );
        });
      })
      .then(function() { return ensureCdnCached(); })
      .then(function() { return self.clients.claim(); })
  );
});

// Network first, fall back to cache; every path returns a real Response
// (respondWith(undefined) throws a TypeError and breaks the page).
function networkFirst(request) {
  return fetch(request).then(function(response) {
    // Only store complete, validated responses. Opaque ones (status 0, cross-origin
    // no-cors) can't be checked — caching them can poison the shell with an error page.
    if (response && response.ok && response.status === 200 && response.type !== 'opaque') {
      var responseClone = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.put(request, responseClone);
      }).catch(function(err) { console.warn('[SW] cache put failed:', err); });
    }
    return response;
  }).catch(function() {
    return caches.match(request, { ignoreVary: true }).then(function(hit) {
      if (hit) return hit;
      // Navigation fallback: any page we don't have cached gets the app shell,
      // so deep links / refreshes still open the app while offline.
      if (request.mode === 'navigate') {
        return caches.match('./index.html', { ignoreVary: true }).then(function(shell) {
          return shell || offlineResponse();
        });
      }
      return offlineResponse();
    });
  });
}

self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = request.url;

  // Not ours to handle — leave these entirely to the browser.
  if (request.method !== 'GET') return;              // POST/PATCH must never be cached
  if (url.indexOf('http') !== 0) return;             // chrome-extension:, data:, ...
  if (isSupabaseRequest(url)) return;                // live API traffic
  if (isVersionCheck(url)) return;                   // update probe — never cache

  event.respondWith(networkFirst(request));
});

// Message - page asks the waiting worker to activate immediately
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
