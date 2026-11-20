import { createStore, get, set, del, keys } from 'idb-keyval'

export interface LocalDoc {
  id: string
  name: string
  kind: 'word' | 'sheet' | 'note'
  folder: string // '' = ルート
  content: string
  updatedAt: number
}

export interface CalEvent {
  id: string
  date: string // YYYY-MM-DD
  title: string
  memo: string
  createdAt: number
}

/* ================= 保存バックエンド =================
   容量対策：OPFS（Origin Private File System）が使える環境ではそちらを優先し、
   使えない環境では IndexedDB を使う。あわせて永続化（persist）を要求する。
   旧データ（IndexedDB）は初回に OPFS へ移行する（元のデータは消さない）。 */

const docsStore = createStore('universal-office-db', 'docs')
const foldersStore = createStore('universal-office-db', 'folders')
const eventsStore = createStore('universal-office-db', 'events')

export const HAS_OPFS =
  typeof navigator !== 'undefined' && !!navigator.storage && 'getDirectory' in navigator.storage

export function storageBackendName(): string {
  return HAS_OPFS ? 'OPFS' : 'IndexedDB'
}

export async function storageInfo(): Promise<{
  usage: number
  quota: number
  persisted: boolean
  backend: string
}> {
  let usage = 0
  let quota = 0
  let persisted = false
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate()
      usage = est.usage ?? 0
      quota = est.quota ?? 0
    }
    if (navigator.storage?.persisted) persisted = await navigator.storage.persisted()
  } catch { /* ignore */ }
  return { usage, quota, persisted, backend: storageBackendName() }
}

export async function requestPersist(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist()
  } catch { /* ignore */ }
  return false
}

/* ---------- OPFS 実装 ---------- */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandle = any

async function opfsDir(name: string): Promise<AnyHandle> {
  const root = await navigator.storage.getDirectory()
  const app = await root.getDirectoryHandle('ykr-os', { create: true })
  if (!name) return app
  return app.getDirectoryHandle(name, { create: true })
}

async function opfsWriteJson(dirName: string, fileName: string, obj: unknown): Promise<void> {
  const dir = await opfsDir(dirName)
  const fh = await dir.getFileHandle(fileName, { create: true })
  const writable = await fh.createWritable()
  await writable.write(JSON.stringify(obj))
  await writable.close()
}

async function opfsReadJson(dirName: string, fileName: string): Promise<unknown | null> {
  try {
    const dir = await opfsDir(dirName)
    const fh = await dir.getFileHandle(fileName)
    const file = await fh.getFile()
    return JSON.parse(await file.text())
  } catch {
    return null
  }
}

async function opfsReadAll(dirName: string): Promise<unknown[]> {
  try {
    const dir = await opfsDir(dirName)
    const out: unknown[] = []
    for await (const handle of dir.values() as AsyncIterable<AnyHandle>) {
      if (handle.kind === 'file' && String(handle.name).endsWith('.json')) {
        const file = await handle.getFile()
        out.push(JSON.parse(await file.text()))
      }
    }
    return out
  } catch {
    return []
  }
}

async function opfsDelete(dirName: string, fileName: string): Promise<void> {
  try {
    const dir = await opfsDir(dirName)
    await dir.removeEntry(fileName)
  } catch { /* ignore */ }
}

/* ---------- IndexedDB 実装（予備） ---------- */
async function idbAll<T>(store: ReturnType<typeof createStore>): Promise<T[]> {
  const ids = (await keys(store)) as string[]
  const items = (await Promise.all(ids.map((id) => get(id, store)))) as (T | undefined)[]
  return items.filter((x): x is T => !!x)
}

/* ---------- 移行（IndexedDB → OPFS、初回だけ） ---------- */
let migrationDone = false
async function migrateIfNeeded(): Promise<void> {
  if (!HAS_OPFS || migrationDone) return
  migrationDone = true
  try {
    if (localStorage.getItem('ykr-storage-migrated') === '1') return
    const [docs, events, folders] = await Promise.all([
      idbAll<LocalDoc>(docsStore),
      idbAll<CalEvent>(eventsStore),
      keys(foldersStore) as Promise<string[]>,
    ])
    for (const d of docs) await opfsWriteJson('docs', `${d.id}.json`, d)
    for (const e of events) await opfsWriteJson('events', `${e.id}.json`, e)
    if (folders.length) await opfsWriteJson('', 'folders.json', { names: folders })
    localStorage.setItem('ykr-storage-migrated', '1')
  } catch { /* ignore */ }
}

/* ================= 文書 ================= */
export async function listDocs(): Promise<LocalDoc[]> {
  await migrateIfNeeded()
  const docs = HAS_OPFS
    ? ((await opfsReadAll('docs')) as LocalDoc[])
    : await idbAll<LocalDoc>(docsStore)
  return docs.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveDoc(input: Omit<LocalDoc, 'id' | 'updatedAt'> & { id?: string }): Promise<LocalDoc> {
  await migrateIfNeeded()
  let id = input.id
  if (!id) {
    const all = await listDocs()
    const existing = all.find((d) => d.kind === input.kind && d.name === input.name && d.folder === input.folder)
    id = existing?.id ?? crypto.randomUUID()
  }
  const doc: LocalDoc = { ...input, id, updatedAt: Date.now() }
  if (HAS_OPFS) await opfsWriteJson('docs', `${id}.json`, doc)
  else await set(id, doc, docsStore)
  return doc
}

export async function deleteDoc(id: string): Promise<void> {
  await migrateIfNeeded()
  if (HAS_OPFS) await opfsDelete('docs', `${id}.json`)
  else await del(id, docsStore)
}

/* ================= フォルダ ================= */
export async function listFolders(): Promise<string[]> {
  await migrateIfNeeded()
  if (HAS_OPFS) {
    const data = (await opfsReadJson('', 'folders.json')) as { names?: string[] } | null
    return (data?.names ?? []).sort()
  }
  return ((await keys(foldersStore)) as string[]).sort()
}

export async function addFolder(name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await migrateIfNeeded()
  if (HAS_OPFS) {
    const current = await listFolders()
    if (!current.includes(trimmed)) {
      await opfsWriteJson('', 'folders.json', { names: [...current, trimmed] })
    }
  } else {
    await set(trimmed, true, foldersStore)
  }
}

/* ================= カレンダー予定 ================= */
export async function listEvents(): Promise<CalEvent[]> {
  await migrateIfNeeded()
  const events = HAS_OPFS
    ? ((await opfsReadAll('events')) as CalEvent[])
    : await idbAll<CalEvent>(eventsStore)
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
}

export async function saveEvent(input: Omit<CalEvent, 'id' | 'createdAt'> & { id?: string }): Promise<CalEvent> {
  await migrateIfNeeded()
  const event: CalEvent = { ...input, id: input.id ?? crypto.randomUUID(), createdAt: Date.now() }
  if (HAS_OPFS) await opfsWriteJson('events', `${event.id}.json`, event)
  else await set(event.id, event, eventsStore)
  return event
}

export async function deleteEvent(id: string): Promise<void> {
  await migrateIfNeeded()
  if (HAS_OPFS) await opfsDelete('events', `${id}.json`)
  else await del(id, eventsStore)
}

/* ================= バックアップ ================= */
export interface BackupData {
  app: 'YKR-OS'
  version: 1
  exportedAt: string
  docs: LocalDoc[]
  events: CalEvent[]
  folders: string[]
}

export async function exportAll(): Promise<BackupData> {
  const [docs, events, folders] = await Promise.all([listDocs(), listEvents(), listFolders()])
  return { app: 'YKR-OS', version: 1, exportedAt: new Date().toISOString(), docs, events, folders }
}

export async function importAll(data: BackupData): Promise<void> {
  for (const f of data.folders ?? []) await addFolder(f)
  for (const d of data.docs ?? []) {
    if (HAS_OPFS) await opfsWriteJson('docs', `${d.id}.json`, d)
    else await set(d.id, d, docsStore)
  }
  for (const e of data.events ?? []) {
    if (HAS_OPFS) await opfsWriteJson('events', `${e.id}.json`, e)
    else await set(e.id, e, eventsStore)
  }
}
