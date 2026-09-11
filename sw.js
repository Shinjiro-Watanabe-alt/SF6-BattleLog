self.addEventListener("install", (event) => {
  event.waitUntil(caches.open("ed-match-note-v4").then((cache) => cache.addAll(["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest"])));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== "ed-match-note-v4").map((key) => caches.delete(key)))));
});
self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
