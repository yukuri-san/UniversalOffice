const CACHE = 'universal-office-v90'
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', './index.html'])))
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => maybeNotifyUpdate())
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

// ---- アップデート通知（PWA利用者・通知許可済みユーザー向け） ----
// 新しい Service Worker が有効化されたタイミングで release-notes.json を確認し、
// まだ通知していないバージョンなら OS の通知を出す。アプリを開いていなくても、
// ブラウザが SW の更新を検出した時点で通知される（プッシュサーバーは使わない）。
// 通知の表示には端末側の通知許可が必要（許可がない場合は何も起きない）。
function swKvGet(key) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('webx-sw-notify', 1)
      req.onupgradeneeded = () => { try { req.result.createObjectStore('kv') } catch { /* ignore */ } }
      req.onerror = () => resolve(undefined)
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction('kv', 'readonly').objectStore('kv').get(key)
          tx.onsuccess = () => resolve(tx.result)
          tx.onerror = () => resolve(undefined)
        } catch { resolve(undefined) }
      }
    } catch { resolve(undefined) }
  })
}
function swKvSet(key, value) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('webx-sw-notify', 1)
      req.onupgradeneeded = () => { try { req.result.createObjectStore('kv') } catch { /* ignore */ } }
      req.onerror = () => resolve()
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction('kv', 'readwrite').objectStore('kv').put(value, key)
          tx.oncomplete = () => resolve()
          tx.onerror = () => resolve()
        } catch { resolve() }
      }
    } catch { resolve() }
  })
}
async function maybeNotifyUpdate() {
  try {
    const res = await fetch(`release-notes.json?ts=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json()
    const version = data && data.version
    if (!version) return
    const last = await swKvGet('notifiedVersion')
    if (last === version) return
    // 初回インストール時（記録なし）は通知せず、現在のバージョンだけ記録する
    if (last) {
      try {
        await self.registration.showNotification(`WebX v${version} にアップデートしました`, {
          body: data.notes || '新しいバージョンが利用できます。',
          icon: 'icon-192.png',
          badge: 'icon-192.png',
          tag: 'webx-update',
          data: { url: self.registration.scope },
        })
      } catch { /* 通知許可がない場合などは静かに諦める */ }
    }
    await swKvSet('notifiedVersion', version)
  } catch { /* ignore */ }
}
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(target)
    })
  )
})
