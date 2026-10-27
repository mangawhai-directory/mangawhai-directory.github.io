/* Service worker for mangawhaidirectory.co.nz — registered from the end of
   layouts/_default/baseof.html, served from the root so its scope is the whole
   site.

   Why: the directory is mostly looked at on phones, around a coast where the
   signal comes and goes. This keeps the pages someone has already opened
   readable with no signal, shows a friendly /offline/ page for the ones they
   have not, and makes the site installable (Chrome wants a worker with a fetch
   handler before it offers "Install app").

   What it does, by request:
   - Page navigations and /index.json (the home page's search index): network
     first, so a CMS edit shows on the next load as it always has. A good
     response is copied into the cache; with no network the cached copy is
     served, and a page never visited gets /offline/.
   - Same-origin images, fonts and stylesheets: stale-while-revalidate — the
     cached copy at once, refreshed in the background. Production CSS is
     fingerprinted, so a new stylesheet is a new URL and can never be stale.
     Unfingerprinted CSS (`make serve`) is network first instead, so local
     style edits show on reload. Images are trimmed to the newest MAX_ASSETS.
   - Everything else is not touched at all: non-GET requests, other origins
     (Google Analytics, advertisers' sites, unpkg), and /admin/ — the Sveltia
     CMS must always talk to GitHub live, never through a cache.

   Only the offline page, its stylesheet, the home page and the icons are
   fetched up front; the 50-odd category pages are cached as they are visited,
   not all at install.

   Updating: bump VERSION when this file's strategy or the offline page
   changes. The new worker installs, skipWaiting + clients.claim make it take
   over straight away, and activate deletes every cache that is not this
   version's, so the next load gets the new offline page and the old copies go.
   This file is copied as-is (Hugo does not minify static/), so keep it plain
   JS with no build step. */

var VERSION = 'v1';
var PAGES = 'md-pages-' + VERSION;
var ASSETS = 'md-assets-' + VERSION;
var OFFLINE = '/offline/';
var MAX_ASSETS = 150;

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(PAGES).then(function (cache) {
    // The offline page's stylesheet is fingerprinted, so its URL is read from
    // the page itself rather than written here.
    return fetch(OFFLINE).then(function (res) {
      if (!res.ok) throw new Error('offline page: ' + res.status);
      return cache.put(OFFLINE, res.clone()).then(function () { return res.text(); });
    }).then(function (html) {
      var css = html.match(/<link[^>]+rel="?stylesheet"?[^>]+href="?([^" >]+)/);
      var shell = ['/', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png'];
      return Promise.all([
        cache.addAll(shell),
        css ? caches.open(ASSETS).then(function (a) { return a.add(css[1]); }) : null
      ]);
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) {
      return k.indexOf('md-') === 0 && k !== PAGES && k !== ASSETS;
    }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/admin') === 0) return;

  if (req.mode === 'navigate' || url.pathname === '/index.json') {
    event.respondWith(networkFirst(req, req.mode === 'navigate'));
  } else if (req.destination === 'style' && !/\.[0-9a-f]{32,}\.css$/.test(url.pathname)) {
    event.respondWith(networkFirst(req, false));
  } else if (req.destination === 'image' || req.destination === 'font' || req.destination === 'style') {
    event.respondWith(staleWhileRevalidate(event, req));
  }
});

function networkFirst(req, isPage) {
  var store = isPage ? PAGES : ASSETS;
  return fetch(req).then(function (res) {
    if (res.ok && res.type === 'basic') {
      var copy = res.clone();
      caches.open(store).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) {
      return hit || (isPage ? caches.match(OFFLINE) : Response.error());
    });
  });
}

function staleWhileRevalidate(event, req) {
  return caches.open(ASSETS).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var fresh = fetch(req).then(function (res) {
        if (res.ok && res.type === 'basic') {
          return cache.put(req, res.clone()).then(trim).then(function () { return res; });
        }
        return res;
      });
      if (hit) {
        event.waitUntil(fresh.catch(function () {}));
        return hit;
      }
      return fresh;
    });
  });
}

// Drop the oldest entries (Cache keys come back in insertion order) once the
// asset cache passes MAX_ASSETS, so listing photos cannot pile up forever.
function trim() {
  return caches.open(ASSETS).then(function (cache) {
    return cache.keys().then(function (keys) {
      return Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))
        .map(function (k) { return cache.delete(k); }));
    });
  });
}
