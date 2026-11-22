const CACHE = 'universal-office-v105'
self.addEventListener('install', (event) => {
  // ページ本体（HTML）はプリキャッシュしない。デプロイ途中の空応答などを
  // 取り込むと、空のドキュメントが固定されて開けなくなる事故が起きるため。
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => purgePoisonedHtml())
      .then(() => maybeNotifyUpdate())
  )
  self.clients.claim()
})
// キャッシュに残っているページ本体が空（200バイト未満）なら毒されているので捨てる
async function purgePoisonedHtml() {
  try {
    const cache = await caches.open(CACHE)
    for (const key of ['./', './index.html']) {
      const res = await cache.match(key)
      if (!res) continue
      const text = await res.clone().text()
      if (text.length < 200) await cache.delete(key)
    }
  } catch { /* ignore */ }
}
// SW 自身が返す復旧ページ（ネットワークもキャッシュも使えない場合の最終手段）
function recoveryResponse() {
  const steps = '<details style="text-align:left;margin-top:18px;background:#131c2e;border-radius:10px;padding:12px 16px">'
    + '<summary style="cursor:pointer;font-weight:700;font-size:14px">手動復旧の手順（ドキュメント）</summary>'
    + '<div style="font-size:13px;line-height:1.8;margin-top:8px">'
    + '<p>更新直後などにページが真っ白（空）になるのは、ブラウザの Service Worker のキャッシュに壊れたページ本体が残った状態です。文書・設定などのデータは消えていません。</p>'
    + '<ol style="padding-left:20px;margin:8px 0">'
    + '<li>まずは下のボタン「キャッシュだけ消して再読み込み」を試してください。</li>'
    + '<li>直らない場合（PCの Chrome）：F12 → Application タブ → Service Workers で <b>Unregister</b>、Cache Storage の各キャッシュを <b>Delete</b> してから再読み込み。</li>'
    + '<li>Android の場合は、PC と USB でつないで Chrome のリモートデバイス機能から同じ操作ができます。</li>'
    + '<li>WebX が起動できる状態なら、ターミナルの <b>recover</b> コマンドでも同じ復旧ができます。</li>'
    + '</ol>'
    + '<p><b>注意：</b>「サイトデータを消去（Clear site data）」は押さないでください。WebX の文書・設定ごと消えてしまいます。消すのは Service Worker の登録と Cache Storage だけです。</p>'
    + '</div></details>'
  const html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WebX 復旧</title></head>'
    + '<body style="font-family:sans-serif;background:#0b1220;color:#eef3f7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box">'
    + '<div style="max-width:460px;text-align:center"><h1 style="font-size:20px">WebX を読み込めませんでした</h1>'
    + '<p style="font-size:14px;line-height:1.7">キャッシュが壊れている可能性があります。下のボタンでキャッシュだけを消して再読み込みしてください。<br><b>アプリのデータ（文書・設定）は消えません。</b></p>'
    + '<button id="b" style="padding:12px 22px;border-radius:10px;border:none;background:#2563eb;color:#fff;font-weight:700;font-size:15px">キャッシュだけ消して再読み込み</button>'
    + steps
    + '</div>'
    + '<script>document.getElementById("b").onclick=async()=>{try{const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));const rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(r=>r.unregister()));}catch(e){}location.reload();};<\/script>'
    + '</body></html>'
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

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
