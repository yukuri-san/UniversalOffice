// ベータアプリのアクセスキー管理
// ベータアプリはストアにもアプリ一覧にも表示されず、対応するアクセスキーを
// ストアで入力した端末でのみ表示・利用できる（非公開ベータ）。
// キーはアプリごとに src/lib/beta.ts の BETA_KEYS で管理する。
import { STORE_APPS, type StoreAppDef } from './storeApps'

export const BETA_EVENT = 'webx-beta-changed'
const LS_KEY = 'webx-beta-unlocked'

/** アプリID → ベータアクセスキー */
export const BETA_KEYS: Record<string, string> = {
  wme: 'WME-BETA-2026',
}

export function getBetaUnlocked(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function isBetaUnlocked(id: string): boolean {
  return getBetaUnlocked().includes(id)
}

/** キーを照合し、一致したベータアプリをアンロックする。成功時はそのアプリ定義を返す */
export function unlockBetaWithKey(key: string): StoreAppDef | null {
  const k = key.trim().toUpperCase()
  if (!k) return null
  for (const [id, expected] of Object.entries(BETA_KEYS)) {
    if (expected.toUpperCase() === k) {
      const def = STORE_APPS.find((a) => a.id === id && a.beta)
      if (!def) return null
      const cur = getBetaUnlocked()
      if (!cur.includes(id)) {
        localStorage.setItem(LS_KEY, JSON.stringify([...cur, id]))
        window.dispatchEvent(new Event(BETA_EVENT))
      }
      return def
    }
  }
  return null
}

/** ストア表示用：ベータで未アンロックのアプリを除外する */
export function visibleStoreApps(unlocked: string[]) {
  return STORE_APPS.filter((a) => !a.beta || unlocked.includes(a.id))
}
