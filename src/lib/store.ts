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

const docsStore = createStore('universal-office-db', 'docs')
const foldersStore = createStore('universal-office-db', 'folders')

export async function listDocs(): Promise<LocalDoc[]> {
  const ids = (await keys(docsStore)) as string[]
  const docs = await Promise.all(ids.map((id) => get(id, docsStore) as Promise<LocalDoc | undefined>))
  return docs
    .filter((d): d is LocalDoc => !!d)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveDoc(input: Omit<LocalDoc, 'id' | 'updatedAt'> & { id?: string }): Promise<LocalDoc> {
  let id = input.id
  if (!id) {
    const all = await listDocs()
    const existing = all.find((d) => d.kind === input.kind && d.name === input.name && d.folder === input.folder)
    id = existing?.id ?? crypto.randomUUID()
  }
  const doc: LocalDoc = { ...input, id, updatedAt: Date.now() }
  await set(id, doc, docsStore)
  return doc
}

export async function deleteDoc(id: string): Promise<void> {
  await del(id, docsStore)
}

export async function listFolders(): Promise<string[]> {
  const names = (await keys(foldersStore)) as string[]
  return names.sort()
}

export async function addFolder(name: string): Promise<void> {
  const trimmed = name.trim()
  if (trimmed) await set(trimmed, true, foldersStore)
}

const eventsStore = createStore('universal-office-db', 'events')

export async function listEvents(): Promise<CalEvent[]> {
  const ids = (await keys(eventsStore)) as string[]
  const events = await Promise.all(ids.map((id) => get(id, eventsStore) as Promise<CalEvent | undefined>))
  return events
    .filter((e): e is CalEvent => !!e)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
}

export async function saveEvent(input: Omit<CalEvent, 'id' | 'createdAt'> & { id?: string }): Promise<CalEvent> {
  const event: CalEvent = {
    ...input,
    id: input.id ?? crypto.randomUUID(),
    createdAt: Date.now(),
  }
  await set(event.id, event, eventsStore)
  return event
}

export async function deleteEvent(id: string): Promise<void> {
  await del(id, eventsStore)
}
