/* Which Card service worker.
   App shell: cache first, refreshed in the background.
   Card data (data/*.json): network first, cached copy when offline.
   Bump VERSION when the shell changes so every phone picks up the new files. */
var VERSION = 'wc-2026-10-29-1';
var SHELL = ['./', './index.html', './app.css', './app.js', './engine.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;  // fonts and the places lookup go straight to the network
  if (url.pathname.indexOf('/data/') >= 0) {
    e.respondWith(fetch(e.request).then(function (r) {
      var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(stripQuery(e.request), copy); }); return r;
    }).catch(function () { return caches.match(stripQuery(e.request)); }));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (cached) {
    var net = fetch(e.request).then(function (r) { if (r.ok) caches.open(VERSION).then(function (c) { c.put(e.request, r.clone()); }); return r; }).catch(function () { return cached; });
    return cached || net;
  }));
});
function stripQuery(req) { var u = new URL(req.url); u.search = ''; return new Request(u.toString()); }
