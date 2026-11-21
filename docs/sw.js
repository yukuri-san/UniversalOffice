const CACHE = 'universal-office-v60'
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', './index.html'])))
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})
self.addEventListener('fetch', (event) => {
  // 自サイト宛ての GET だけを扱う。他サイト宛て（天気・速度テスト等の測定通信）や
  // POST は素通しする（以前は全リクエストを横取りして cache.put していたため、
  // 速度テストのアップロード測定などが失敗する原因になっていた）
  if (event.request.method !== 'GET') return
  let url
  try { url = new URL(event.request.url) } catch { return }
  if (url.origin !== self.location.origin) return
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => { /* ignore */ })
        return res
      })
      .catch(() => caches.match(event.request))
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
