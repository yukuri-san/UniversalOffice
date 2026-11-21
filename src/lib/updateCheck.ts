// WebX の更新確認まわり（本体の version.json 照合と、更新の適用）
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
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
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
    if (reg?.waiting) reg.waiting.postMessage('SKIP_WAITING')
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  } catch { /* ignore */ }
  window.location.reload()
}
