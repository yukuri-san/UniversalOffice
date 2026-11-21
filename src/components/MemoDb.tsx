import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listDocs, saveDoc, trashDoc, type LocalDoc } from '../lib/store'
import { useLang } from '../lib/i18n'
import { notifyOs } from '../lib/notify'

interface MemoData {
  body: string
  tags: string[]
}

function parseMemo(content: string): MemoData {
  try {
    const parsed = JSON.parse(content) as Partial<MemoData>
    return {
      body: typeof parsed.body === 'string' ? parsed.body : '',
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((x): x is string => typeof x === 'string') : [],
    }
  } catch {
    return { body: content, tags: [] }
  }
}

export default function MemoDb() {
  const { t } = useLang()
  const [memos, setMemos] = useState<LocalDoc[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const saveTimer = useRef<number | null>(null)
  const stateRef = useRef({ currentId, title, body, tagsText })
  stateRef.current = { currentId, title, body, tagsText }

  const refresh = useCallback(async () => {
    const all = await listDocs()
    const memoDocs = all.filter((d) => d.kind === 'memo')
    setMemos(memoDocs)
    return memoDocs
  }, [])

  const select = useCallback((doc: LocalDoc) => {
    const data = parseMemo(doc.content)
    setCurrentId(doc.id)
    setTitle(doc.name)
    setBody(data.body)
    setTagsText(data.tags.join(', '))
  }, [])

  useEffect(() => {
    void (async () => {
      const memoDocs = await refresh()
      const pending = localStorage.getItem('uo-pending-open')
      const pendingDoc = pending ? memoDocs.find((d) => d.id === pending) : undefined
      if (pendingDoc) {
        localStorage.removeItem('uo-pending-open')
        select(pendingDoc)
      } else if (memoDocs.length > 0) {
        select(memoDocs[0])
      }
    })()
  }, [refresh, select])

  const persist = useCallback(async () => {
    const { currentId: id, title: name, body: text, tagsText: tagsRaw } = stateRef.current
    if (!name.trim() && !text.trim()) return
    const tags = tagsRaw.split(/[,、]/).map((x) => x.trim()).filter(Boolean)
    const saved = await saveDoc({
      id: id ?? undefined,
      kind: 'memo',
      name: name.trim() || '無題のメモ',
      folder: '',
      content: JSON.stringify({ body: text, tags }),
    })
    if (!id) setCurrentId(saved.id)
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void persist(), 700)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [title, body, tagsText, persist])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    memos.forEach((m) => parseMemo(m.content).tags.forEach((tag) => set.add(tag)))
    return [...set].sort()
  }, [memos])

  const q = query.trim().toLowerCase()
  const visible = memos.filter((m) => {
    const data = parseMemo(m.content)
    if (activeTag && !data.tags.includes(activeTag)) return false
    if (!q) return true
    return (
      m.name.toLowerCase().includes(q) ||
      data.body.toLowerCase().includes(q) ||
      data.tags.some((tag) => tag.toLowerCase().includes(q))
    )
  })

  const createNew = () => {
    setCurrentId(null)
    setTitle('')
    setBody('')
    setTagsText('')
  }

  const remove = async () => {
    if (!currentId) return
    await trashDoc(currentId)
    notifyOs(t('movedToTrash'))
    const rest = await refresh()
    if (rest.length > 0) select(rest[0])
    else createNew()
  }

  return (
    <div className="memodb-app">
      <aside className="memodb-side">
        <input
          className="memodb-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('fileSearch')}
        />
        {allTags.length > 0 && (
          <div className="memodb-tags">
            <button className={activeTag === null ? 'chip on' : 'chip'} onClick={() => setActiveTag(null)}>{t('all')}</button>
            {allTags.map((tag) => (
              <button key={tag} className={activeTag === tag ? 'chip on' : 'chip'} onClick={() => setActiveTag(activeTag === tag ? null : tag)}>
                #{tag}
              </button>
            ))}
          </div>
        )}
        <button className="memodb-new" onClick={createNew}>＋ {t('newDoc')}</button>
        <ul className="memodb-list">
          {visible.map((m) => {
            const data = parseMemo(m.content)
            return (
              <li key={m.id}>
                <button className={m.id === currentId ? 'on' : ''} onClick={() => select(m)}>
                  <strong>{m.name}</strong>
                  <small>{data.body.slice(0, 40) || '…'}</small>
                  {data.tags.length > 0 && <span className="memodb-item-tags">{data.tags.map((tag) => `#${tag}`).join(' ')}</span>}
                </button>
              </li>
            )
          })}
          {visible.length === 0 && <li className="memodb-empty">{t('noMemos')}</li>}
        </ul>
      </aside>
      <section className="memodb-main">
        <input
          className="memodb-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('titlePh')}
        />
        <label className="memodb-tagrow">
          <span>{t('tags')}</span>
          <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder={t('tagPh')} />
        </label>
        <textarea
          className="memodb-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('memoBodyPh')}
        />
        <div className="memodb-footer">
          <span>{t('autoSaved')}</span>
          {currentId && <button onClick={() => void remove()}>{t('deleteBtn')}</button>}
        </div>
      </section>
    </div>
  )
}
