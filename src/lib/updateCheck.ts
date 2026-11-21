// WebX の更新確認まわり（本体の version.json 照合と、更新の適用）
export function compareVersions(a: string, b: string): number {
  // 末尾英字つきバージョン（例：1.21.0a）にも対応する。数字が同じなら英字ありの方が新しい。
  const parse = (v: string) =>
    v.split('.').map((seg) => {
      const m = seg.match(/^(\d+)([a-z]*)(\d*)$/)
      return m
        ? { n: parseInt(m[1], 10), s: m[2], t: m[3] ? parseInt(m[3], 10) : 0 }
        : { n: parseInt(seg, 10) || 0, s: '', t: 0 }
    })
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? { n: 0, s: '', t: 0 }
    const y = pb[i] ?? { n: 0, s: '', t: 0 }
    if (x.n !== y.n) return x.n - y.n
    if (x.s !== y.s) return x.s < y.s ? -1 : 1
    if (x.t !== y.t) return x.t - y.t
  }
  return 0
}

/** 公開されている最新バージョンを取得する。失敗したら null。 */
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`version.json?ts=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string }
    return typeof data.version === 'string' ? data.version : null
  } catch {
    return null
  }
}

/** キャッシュを消して最新版に更新する（ページを再読み込みする）。 */
export async function performUpdate(): Promise<void> {
  // 更新処理が終わったらすぐリロードする。SW の更新チェック完了は待たない
  // （待つと通信状態によってリロードまで数秒〜固まることがあった）。
  // キャッシュ掃除も最大600msで打ち切り、必ずリロードする。
  const cleanup = (async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg?.waiting) reg.waiting.postMessage('SKIP_WAITING')
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    } catch { /* ignore */ }
  })()
  await Promise.race([cleanup, new Promise((r) => setTimeout(r, 600))])
  window.location.reload()
}
