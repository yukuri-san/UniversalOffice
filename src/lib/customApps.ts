/* ユーザーが開発者アプリで作る「マイApp」の登録簿（localStorage に保存） */
export interface CustomApp {
  id: string
  name: string
  icon: string
  html: string
  createdAt: number
}

const KEY = 'webx-custom-apps'
export const CUSTOM_APPS_EVENT = 'webx-custom-apps-changed'

export function isCustomId(id: string): boolean {
  return id.startsWith('myapp-')
}

export function loadCustomApps(): CustomApp[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as CustomApp[]
    return Array.isArray(v) ? v.filter((a) => a && typeof a.id === 'string' && typeof a.html === 'string') : []
  } catch { return [] }
}

export function saveCustomApps(list: CustomApp[]): void {
  localStorage.setItem(KEY, JSON.stringify(list))
  window.dispatchEvent(new Event(CUSTOM_APPS_EVENT))
}

export function newCustomId(): string {
  return `myapp-${crypto.randomUUID().slice(0, 8)}`
}
