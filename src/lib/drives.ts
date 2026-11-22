/**
 * Pro Edition のドライブ機能（v1.51.0）。
 * - Cドライブ：本体のドキュメント保存（OPFS 優先、なければ IndexedDB）。実体は lib/store。
 * - 外部ドライブ（IndexedDB）：専用 DB「webx-ext-drive」に置く独立したテキストファイル置き場。
 * - 外部ドライブ（LocalStorage）：localStorage の接頭辞キーに置く小容量のテキストファイル置き場。
 * 外部ドライブ同士・Cドライブとはデータが独立している（コピー操作でのみ行き来する）。
 */

export interface DriveFile {
  name: string
  content: string
  updatedAt: number
}

export type ExtDriveId = 'idb' | 'ls'

/* ---------- IndexedDB ドライブ ---------- */

const IDB_NAME = 'webx-ext-drive'
const IDB_STORE = 'files'

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE, { keyPath: 'name' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbTx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return idbOpen().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, mode)
        const req = run(tx.objectStore(IDB_STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        tx.oncomplete = () => db.close()
      }),
  )
}

async function idbList(): Promise<DriveFile[]> {
  const all = await idbTx<DriveFile[]>('readonly', (s) => s.getAll() as IDBRequest<DriveFile[]>)
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}
async function idbPut(file: DriveFile): Promise<void> {
  await idbTx('readwrite', (s) => s.put(file))
}
async function idbDelete(name: string): Promise<void> {
  await idbTx('readwrite', (s) => s.delete(name))
}

/* ---------- LocalStorage ドライブ ---------- */

const LS_PREFIX = 'webx-drive-ls:'

function lsList(): DriveFile[] {
  const out: DriveFile[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(LS_PREFIX)) continue
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? '') as DriveFile
      if (parsed && typeof parsed.content === 'string') out.push(parsed)
    } catch { /* ignore */ }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}
function lsPut(file: DriveFile): void {
  localStorage.setItem(LS_PREFIX + file.name, JSON.stringify(file))
}
function lsDelete(name: string): void {
  localStorage.removeItem(LS_PREFIX + name)
}
export function lsUsageBytes(): number {
  let sum = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(LS_PREFIX)) sum += new Blob([localStorage.getItem(key) ?? '']).size
  }
  return sum
}

/* ---------- 共通インターフェース ---------- */

export async function driveList(drive: ExtDriveId): Promise<DriveFile[]> {
  return drive === 'idb' ? idbList() : lsList()
}
export async function drivePut(drive: ExtDriveId, file: DriveFile): Promise<void> {
  if (drive === 'idb') await idbPut(file)
  else lsPut(file)
}
export async function driveDelete(drive: ExtDriveId, name: string): Promise<void> {
  if (drive === 'idb') await idbDelete(name)
  else lsDelete(name)
}
