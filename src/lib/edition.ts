// WebX のエディション（Lite / Standard / Pro）管理。
// エディションは端末内（localStorage）に保存され、設定画面から切り替える。
// - Lite: ストアアプリが無効（コアアプリのみ使える軽量版）
// - Standard: 従来どおり（コアアプリ＋ストアアプリ）
// - Pro: 初期インストールのコアアプリを限定し、不足分はストアから追加する。
//   切り替えにはプロダクトキーが必要。

export type EditionId = 'lite' | 'standard' | 'pro'

export const EDITIONS: { id: EditionId; label: string }[] = [
  { id: 'lite', label: 'Lite Edition' },
  { id: 'standard', label: 'Standard Edition' },
  { id: 'pro', label: 'Pro Edition' },
]

export const PRO_PRODUCT_KEY = 'webx-pk841ysyk'

const EDITION_KEY = 'webx-edition'
const PRO_UNLOCKED_KEY = 'webx-pro-unlocked'
const PRO_APPS_KEY = 'webx-pro-apps'
export const EDITION_EVENT = 'webx-edition-changed'

export function getEdition(): EditionId {
  try {
    const v = localStorage.getItem(EDITION_KEY)
    return v === 'lite' || v === 'pro' ? v : 'standard'
  } catch {
    return 'standard'
  }
}

export function editionLabel(e: EditionId = getEdition()): string {
  return EDITIONS.find((x) => x.id === e)?.label ?? 'Standard Edition'
}

export function isProUnlocked(): boolean {
  try {
    return localStorage.getItem(PRO_UNLOCKED_KEY) === '1'
  } catch {
    return false
  }
}

export function unlockPro(): void {
  try {
    localStorage.setItem(PRO_UNLOCKED_KEY, '1')
  } catch { /* ignore */ }
}

export function setEdition(e: EditionId): void {
  try {
    localStorage.setItem(EDITION_KEY, e)
  } catch { /* ignore */ }
  window.dispatchEvent(new Event(EDITION_EVENT))
}

// Pro Edition の初期インストールアプリ（これ以外のコアアプリはストアから追加する）
export const PRO_DEFAULT_APPS: string[] = [
  'browser', 'files', 'trash', 'note', 'calculator', 'terminal', 'manual',
  'store', 'sysinfo', 'taskman', 'widgets', 'developer', 'feedback', 'settings', 'discord',
]

// Pro でユーザーが追加したコアアプリ
export function getProExtraApps(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(PRO_APPS_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function setProExtraApps(apps: string[]): void {
  try {
    localStorage.setItem(PRO_APPS_KEY, JSON.stringify(apps))
  } catch { /* ignore */ }
}
