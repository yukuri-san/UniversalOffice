import { STORE_APPS } from './storeApps'

// ストア情報の取得・照合は、OS 本体の更新処理（updateCheck.ts が扱う version.json）とは
// 独立に行う。ストアのカタログは store.json として別ファイルで配信され、
// アプリの最新バージョンと更新内容はそちらだけを正とする。
// 取得できない場合は同梱カタログ（storeApps.ts）にフォールバックする。

export interface StoreCatalogEntry {
  id: string
  version: string
  notes?: string
}

export interface StoreCatalog {
  version: string
  apps: StoreCatalogEntry[]
}

let cache: StoreCatalog | null = null

export async function fetchStoreCatalog(force = false): Promise<StoreCatalog | null> {
  if (cache && !force) return cache
  try {
    const res = await fetch(`store.json?ts=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as StoreCatalog
    if (!data || !Array.isArray(data.apps)) return null
    cache = data
    return data
  } catch {
    return null
  }
}

/** カタログ（なければ同梱カタログ）から、そのアプリの最新情報を返す */
export function catalogEntry(catalog: StoreCatalog | null, id: string): StoreCatalogEntry | undefined {
  const remote = catalog?.apps.find((a) => a.id === id)
  if (remote) return remote
  const local = STORE_APPS.find((a) => a.id === id)
  return local ? { id: local.id, version: local.version, notes: local.notes } : undefined
}

/** 更新があるストアアプリの一覧（名前つき）を返す */
export function outdatedFromCatalog(
  catalog: StoreCatalog | null,
  installed: string[],
  versions: Record<string, string>
): { id: string; name: string; version: string; notes?: string }[] {
  const out: { id: string; name: string; version: string; notes?: string }[] = []
  for (const id of installed) {
    const entry = catalogEntry(catalog, id)
    if (!entry) continue
    if (versions[id] !== entry.version) {
      const local = STORE_APPS.find((a) => a.id === id)
      out.push({ id, name: local?.name ?? id, version: entry.version, notes: entry.notes })
    }
  }
  return out
}
