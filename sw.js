/* Witch Card service worker.
   App shell: every file in SHELL is cached together when this worker installs, under one VERSION,
   and every page load is served from that one cache. A phone never mixes a page from one release
   with code or styles from another, and nothing in the cache is replaced one file at a time.
   Updates: the deploy writes a hash of the shell into VERSION (tools/stamp_sw.py), so any change
   to the shell is a new worker. It caches the new shell in full, takes over, and the app offers a
   reload. If any shell file is missing, the install fails and the phone keeps the version it has.
   Card data (data/*.json): network first, cached copy when offline. */
var VERSION = 'wc-dev';
var SHELL = ['./', './index.html', './app.css', './app.js', './engine.js', './manifest.webmanifest', './fonts/archivo-wdth.woff2', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', function (e) {
  // cache: 'reload' skips the browser's own HTTP cache, so the new shell is the new shell, all of it.
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;  // the places lookup goes straight to the network
  if (url.pathname.indexOf('/data/') >= 0) {
    e.respondWith(fetch(req).then(function (r) {
      // Never recreate this version's cache once a newer worker has removed it.
      if (r.ok) { var copy = r.clone(); caches.has(VERSION).then(function (has) { if (has) caches.open(VERSION).then(function (c) { c.put(withoutQuery(req.url), copy); }); }); }
      return r;
    }).catch(function () { return caches.match(withoutQuery(req.url)); }));
    return;
  }
  // Every page, including the home-screen start address (?source=pwa) and the shortcut links
  // (?cat=gas), is the one cached index.html; the app reads the query itself.
  var key = req.mode === 'navigate' ? new URL('./', location.href).toString() : withoutQuery(req.url);
  // This version's cache first; while a newer worker is taking over (this one's cache already
  // removed), the newer complete cache; the network only for files outside the shell.
  e.respondWith(caches.match(key, { cacheName: VERSION }).then(function (hit) {
    return hit || caches.match(key).then(function (any) { return any || fetch(req); });
  }));
});
function withoutQuery(href) { var u = new URL(href); u.search = ''; u.hash = ''; return u.toString(); }
