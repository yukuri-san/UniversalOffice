import { createStore, get, set, del, keys } from 'idb-keyval'
import OpfsWorkerCtor from '../workers/opfs.worker.ts?worker'

export interface LocalDoc {
  id: string
  name: string
  kind: 'word' | 'sheet' | 'note' | 'memo'
  folder: string // '' = ルート
  content: string
  updatedAt: number
  deletedAt?: number | null // ゴミ箱に入っている場合の日時
}

export type RepeatKind = 'none' | 'daily' | 'weekly' | 'monthly'

export type EventColor = 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'pink'

// 予定の色分けパレット（id と表示色）。既存データとの互換のため CalEvent.color は任意
export const EVENT_COLORS: { id: EventColor; hex: string }[] = [
  { id: 'blue', hex: '#3b82f6' },
  { id: 'green', hex: '#22c55e' },
  { id: 'red', hex: '#ef4444' },
  { id: 'amber', hex: '#f59e0b' },
  { id: 'purple', hex: '#a855f7' },
  { id: 'pink', hex: '#ec4899' },
]

export interface CalEvent {
  id: string
  date: string // YYYY-MM-DD
  time?: string // HH:MM、未指定は終日（既存データとの互換のため）
  title: string
  memo: string
  repeat?: RepeatKind // 未指定は 'none' と同じ（既存データとの互換のため）
  reminder?: number // 何日前に通知するか（0=当日、未指定は通知なし）
  color?: EventColor // 未指定は 'blue' と同じ（既存データとの互換のため）
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

type Backend = 'worker' | 'main' | 'idb'
let backendPromise: Promise<Backend> | null = null
let resolvedBackend: Backend | null = null

export function storageBackendName(): string {
  if (resolvedBackend === 'worker') return 'OPFS（Worker経由）'
  if (resolvedBackend === 'main') return 'OPFS'
  if (resolvedBackend === 'idb') return 'IndexedDB'
  return HAS_OPFS ? 'OPFS' : 'IndexedDB'
}

export async function storageInfo(): Promise<{
  usage: number
  quota: number
  persisted: boolean
  backend: string
}> {
  await ensureBackend()
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

/* ---------- OPFS 実装（メインスレッド版：予備） ---------- */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandle = any

async function opfsDir(name: string): Promise<AnyHandle> {
  const root = await navigator.storage.getDirectory()
  const app = await root.getDirectoryHandle('ykr-os', { create: true })
  if (!name) return app
  return app.getDirectoryHandle(name, { create: true })
}

async function opfsMainWriteJson(dirName: string, fileName: string, obj: unknown): Promise<void> {
  const dir = await opfsDir(dirName)
  const fh = await dir.getFileHandle(fileName, { create: true })
  const writable = await fh.createWritable()
  await writable.write(JSON.stringify(obj))
  await writable.close()
}

async function opfsMainReadJson(dirName: string, fileName: string): Promise<unknown | null> {
  try {
    const dir = await opfsDir(dirName)
    const fh = await dir.getFileHandle(fileName)
    const file = await fh.getFile()
    return JSON.parse(await file.text())
  } catch {
    return null
  }
}

async function opfsMainReadAll(dirName: string): Promise<unknown[]> {
  try {
    const dir = await opfsDir(dirName)
    const out: unknown[] = []
    for await (const handle of dir.values() as AsyncIterable<AnyHandle>) {
      if (handle.kind === 'file' && String(handle.name).endsWith('.json')) {
        try {
          const file = await handle.getFile()
          out.push(JSON.parse(await file.text()))
        } catch { /* 壊れたファイルは読み飛ばす */ }
      }
    }
    return out
  } catch {
    return []
  }
}

async function opfsMainDelete(dirName: string, fileName: string): Promise<void> {
  try {
    const dir = await opfsDir(dirName)
    await dir.removeEntry(fileName)
  } catch { /* ignore */ }
}

/* ---------- OPFS 実装（Worker 経由） ---------- */
let worker: Worker | null = null
let workerSeq = 0
const workerPending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (!worker) {
    worker = new (OpfsWorkerCtor as new () => Worker)()
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const pending = workerPending.get(e.data.id)
      if (!pending) return
      workerPending.delete(e.data.id)
      if (e.data.ok) pending.resolve(e.data.result ?? null)
      else pending.reject(new Error(e.data.error ?? 'worker error'))
    }
    worker.onerror = () => {
      for (const pending of workerPending.values()) pending.reject(new Error('worker crashed'))
      workerPending.clear()
    }
  }
  return worker
}

function workerCall(op: string, dir: string, name?: string, text?: string): Promise<unknown> {
  const id = ++workerSeq
  return new Promise((resolve, reject) => {
    workerPending.set(id, { resolve, reject })
    getWorker().postMessage({ id, op, dir, name, text })
  })
}

/* ---------- バックエンド決定（Worker → メインスレッド → IndexedDB） ---------- */
function ensureBackend(): Promise<Backend> {
  if (!backendPromise) {
    backendPromise = (async () => {
      if (!HAS_OPFS) {
        resolvedBackend = 'idb'
        return resolvedBackend
      }
      try {
        await workerCall('probe', '')
        resolvedBackend = 'worker'
        return resolvedBackend
      } catch { /* Worker がダメならメインスレッドを試す */ }
      try {
        await opfsMainWriteJson('', '__probe__.json', { ok: true })
        const probe = (await opfsMainReadJson('', '__probe__.json')) as { ok?: boolean } | null
        await opfsMainDelete('', '__probe__.json')
        if (probe?.ok) {
          resolvedBackend = 'main'
          return resolvedBackend
        }
      } catch { /* fallthrough */ }
      resolvedBackend = 'idb'
      return resolvedBackend
    })()
  }
  return backendPromise
}

async function useOpfs(): Promise<boolean> {
  return (await ensureBackend()) !== 'idb'
}

/* ---------- OPFS ディスパッチ ---------- */
async function opfsWriteJson(dirName: string, fileName: string, obj: unknown): Promise<void> {
  if (resolvedBackend === 'worker') {
    await workerCall('write', dirName, fileName, JSON.stringify(obj))
    return
  }
  await opfsMainWriteJson(dirName, fileName, obj)
}

async function opfsReadJson(dirName: string, fileName: string): Promise<unknown | null> {
  if (resolvedBackend === 'worker') {
    const text = (await workerCall('read', dirName, fileName)) as string | null
    return text ? JSON.parse(text) : null
  }
  return opfsMainReadJson(dirName, fileName)
}

async function opfsReadAll(dirName: string): Promise<unknown[]> {
  if (resolvedBackend === 'worker') {
    const texts = (await workerCall('readAll', dirName)) as string[]
    const out: unknown[] = []
    for (const t of texts) {
      // 書き込み途中など壊れたファイルが1つあっても全体を落とさない
      try { out.push(JSON.parse(t)) } catch { /* skip */ }
    }
    return out
  }
  return opfsMainReadAll(dirName)
}

async function opfsDelete(dirName: string, fileName: string): Promise<void> {
  if (resolvedBackend === 'worker') {
    await workerCall('delete', dirName, fileName)
    return
  }
  await opfsMainDelete(dirName, fileName)
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
  if (migrationDone) return
  if ((await ensureBackend()) === 'idb') {
    migrationDone = true
    return
  }
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
async function listAllDocsRaw(): Promise<LocalDoc[]> {
  await migrateIfNeeded()
  const docs = (await useOpfs())
    ? ((await opfsReadAll('docs')) as LocalDoc[])
    : await idbAll<LocalDoc>(docsStore)
  return docs.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function listDocs(): Promise<LocalDoc[]> {
  return (await listAllDocsRaw()).filter((d) => !d.deletedAt)
}

export async function listTrashedDocs(): Promise<LocalDoc[]> {
  return (await listAllDocsRaw())
    .filter((d) => !!d.deletedAt)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
}

async function writeDocRaw(doc: LocalDoc): Promise<void> {
  if (await useOpfs()) await opfsWriteJson('docs', `${doc.id}.json`, doc)
  else await set(doc.id, doc, docsStore)
}

export async function trashDoc(id: string): Promise<void> {
  const doc = (await listAllDocsRaw()).find((d) => d.id === id)
  if (!doc) return
  await writeDocRaw({ ...doc, deletedAt: Date.now() })
}

export async function restoreDoc(id: string): Promise<void> {
  const doc = (await listAllDocsRaw()).find((d) => d.id === id)
  if (!doc) return
  await writeDocRaw({ ...doc, deletedAt: null })
}

/** 30日以上ゴミ箱にあるものを完全に削除する */
export async function purgeOldTrash(): Promise<number> {
  const limit = Date.now() - 30 * 24 * 60 * 60 * 1000
  const old = (await listTrashedDocs()).filter((d) => (d.deletedAt ?? 0) < limit)
  for (const d of old) await deleteDoc(d.id)
  return old.length
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
  if (await useOpfs()) await opfsWriteJson('docs', `${id}.json`, doc)
  else await set(id, doc, docsStore)
  return doc
}

export async function deleteDoc(id: string): Promise<void> {
  await migrateIfNeeded()
  if (await useOpfs()) await opfsDelete('docs', `${id}.json`)
  else await del(id, docsStore)
}

/* ================= フォルダ ================= */
export async function listFolders(): Promise<string[]> {
  await migrateIfNeeded()
  if (await useOpfs()) {
    const data = (await opfsReadJson('', 'folders.json')) as { names?: string[] } | null
    return (data?.names ?? []).sort()
  }
  return ((await keys(foldersStore)) as string[]).sort()
}

export async function addFolder(name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await migrateIfNeeded()
  if (await useOpfs()) {
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
  const events = (await useOpfs())
    ? ((await opfsReadAll('events')) as CalEvent[])
    : await idbAll<CalEvent>(eventsStore)
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
}

export async function saveEvent(input: Omit<CalEvent, 'id' | 'createdAt'> & { id?: string }): Promise<CalEvent> {
  await migrateIfNeeded()
  const event: CalEvent = { ...input, id: input.id ?? crypto.randomUUID(), createdAt: Date.now() }
  if (await useOpfs()) await opfsWriteJson('events', `${event.id}.json`, event)
  else await set(event.id, event, eventsStore)
  // ウィジェット等へ即時反映するための通知
  window.dispatchEvent(new Event('webx-events-changed'))
  return event
}

export async function deleteEvent(id: string): Promise<void> {
  await migrateIfNeeded()
  if (await useOpfs()) await opfsDelete('events', `${id}.json`)
  else await del(id, eventsStore)
  window.dispatchEvent(new Event('webx-events-changed'))
}

/* ================= バックアップ ================= */
export interface BackupData {
  app: 'WebX'
  version: 1
  exportedAt: string
  docs: LocalDoc[]
  events: CalEvent[]
  folders: string[]
}

export async function exportAll(): Promise<BackupData> {
  const [docs, events, folders] = await Promise.all([listAllDocsRaw(), listEvents(), listFolders()])
  return { app: 'WebX', version: 1, exportedAt: new Date().toISOString(), docs, events, folders }
}

/* ---------- 全データ削除（リセット用） ---------- */
export async function clearAllStoredData(): Promise<void> {
  const docs = await listAllDocsRaw()
  for (const d of docs) await deleteDoc(d.id)
  const events = await listEvents()
  for (const e of events) await deleteEvent(e.id)
  if (await useOpfs()) {
    try { await opfsDelete('', 'folders.json') } catch { /* ignore */ }
  }
  // IndexedDB 側の残骸も消す（移行で復活しないように）
  try { for (const d of await idbAll<LocalDoc>(docsStore)) await del(d.id, docsStore) } catch { /* ignore */ }
  try { for (const e of await idbAll<CalEvent>(eventsStore)) await del(e.id, eventsStore) } catch { /* ignore */ }
  try { for (const k of (await keys(foldersStore)) as string[]) await del(k, foldersStore) } catch { /* ignore */ }
}

export async function importAll(data: BackupData): Promise<void> {
  for (const f of data.folders ?? []) await addFolder(f)
  for (const d of data.docs ?? []) {
    if (await useOpfs()) await opfsWriteJson('docs', `${d.id}.json`, d)
    else await set(d.id, d, docsStore)
  }
  for (const e of data.events ?? []) {
    if (await useOpfs()) await opfsWriteJson('events', `${e.id}.json`, e)
    else await set(e.id, e, eventsStore)
  }
}

/* ---------- WebX 自身の使用量（実測） ----------
   estimate() が上限や使用量を返さない環境向けに、保存データそのものを測る。 */
export async function ownUsageBytes(): Promise<number> {
  try {
    if (await useOpfs()) {
      let total = 0
      for (const dirName of ['docs', 'events']) {
        try {
          const dir = await opfsDir(dirName)
          for await (const handle of (dir as AnyHandle).values() as AsyncIterable<AnyHandle>) {
            if (handle.kind === 'file') {
              const file = await handle.getFile()
              total += file.size
            }
          }
        } catch { /* ignore */ }
      }
      try {
        const root = await opfsDir('')
        const fh = await root.getFileHandle('folders.json')
        total += (await fh.getFile()).size
      } catch { /* ignore */ }
      if (total > 0) return total
    }
  } catch { /* fallthrough */ }
  const [docs, events] = await Promise.all([listDocs(), listEvents()])
  const encoder = new TextEncoder()
  let total = 0
  for (const d of docs) total += encoder.encode(d.content).length + encoder.encode(d.name).length + 64
  for (const e of events) total += encoder.encode(e.title + e.memo).length + 64
  return total
}
