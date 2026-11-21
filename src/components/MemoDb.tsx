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

  // 旧メモDB（RecordDB / https://api.ykr3.net/mem/）の JSON バックアップ取り込み
  const importRef = useRef<HTMLInputElement>(null)
  const importLegacy = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      const records: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { records?: unknown[] }).records)
          ? (parsed as { records: unknown[] }).records
          : Array.isArray((parsed as { items?: unknown[] }).items)
            ? (parsed as { items: unknown[] }).items
            : []
      if (records.length === 0) {
        notifyOs('取り込める記録が見つかりませんでした（旧メモDBのバックアップファイルを選んでください）', 'memodb')
        return
      }
      const existing = await listDocs()
      const existingKeys = new Set(existing.filter((d) => d.kind === 'memo').map((d) => `${d.name}\n${parseMemo(d.content).body}`))
      let imported = 0
      let skipped = 0
      for (const raw of records) {
        const rec = (raw ?? {}) as { title?: unknown; body?: unknown; memo?: unknown; category?: unknown; tags?: unknown }
        const name = typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : '無題のメモ'
        const bodyMain = typeof rec.body === 'string' ? rec.body : ''
        const memoText = typeof rec.memo === 'string' ? rec.memo : ''
        const fullBody = memoText.trim() ? `${bodyMain}${bodyMain ? '\n\n' : ''}【補足】\n${memoText}` : bodyMain
        const tags: string[] = []
        if (typeof rec.category === 'string' && rec.category.trim()) tags.push(rec.category.trim())
        if (Array.isArray(rec.tags)) rec.tags.forEach((x) => { if (typeof x === 'string' && x.trim() && !tags.includes(x.trim())) tags.push(x.trim()) })
        if (existingKeys.has(`${name}\n${fullBody}`)) { skipped++; continue }
        await saveDoc({ kind: 'memo', name, folder: '', content: JSON.stringify({ body: fullBody, tags }) })
        existingKeys.add(`${name}\n${fullBody}`)
        imported++
      }
      const rest = await refresh()
      if (rest.length > 0 && imported > 0) select(rest[0])
      notifyOs(`旧メモDBから ${imported} 件を取り込みました${skipped > 0 ? `（重複 ${skipped} 件はスキップ）` : ''}`, 'memodb')
    } catch {
      notifyOs('バックアップファイルを読み込めませんでした（JSON形式を確認してください）', 'memodb')
    }
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
        <button className="memodb-new" onClick={() => importRef.current?.click()}>📥 旧メモDBから取り込む</button>
        <input ref={importRef} type="file" accept=".json,application/json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importLegacy(f); e.target.value = '' }} />
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
