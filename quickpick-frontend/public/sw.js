self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open('quickpick-static-v1')
      .then((cache) =>
        cache.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])
      )
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached
      }
      return fetch(event.request)
    })
  )
})
