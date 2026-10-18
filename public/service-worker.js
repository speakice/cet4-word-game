// service-worker.js

const audioCacheName = 'audio-letter-v2';
const audioFilesToCache = 'abcdefghijklmnopqrstuvwxyz'
  .split('')
  .map((letter) => new URL(`letters/${letter}.wav`, self.registration.scope).pathname);

self.addEventListener('install', async () => {
  const cache = await caches.open(audioCacheName);
  await cache.addAll(audioFilesToCache);
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (audioFilesToCache.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return (
          response ||
          fetch(event.request).then((networkResponse) => {
            caches.open(audioCacheName).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
            return networkResponse;
          })
        );
      }),
    );
  }
});
