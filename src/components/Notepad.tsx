import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Backstage, { type AppId } from './Backstage'
import { useLang } from '../lib/i18n'
import { deleteDoc, listDocs, saveDoc, type LocalDoc } from '../lib/store'
import { downloadText } from '../lib/files'

type NoteSort = 'newest' | 'oldest' | 'title'

const PINS_KEY = 'uo-note-pins'
const SORT_KEY = 'uo-note-sort'

function loadPins(): string[] {
  try {
    const raw = localStorage.getItem(PINS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function loadSort(): NoteSort {
  const raw = localStorage.getItem(SORT_KEY)
  return raw === 'oldest' || raw === 'title' ? raw : 'newest'
}

export default function Notepad({ onSwitch }: { onSwitch: (app: AppId) => void }) {
  const { t } = useLang()
  const [notes, setNotes] = useState<LocalDoc[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [title, setTitle] = useState('無題のメモ')
  const [text, setText] = useState('')
  const [homeOpen, setHomeOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pins, setPins] = useState<string[]>(() => loadPins())
  const [sort, setSort] = useState<NoteSort>(() => loadSort())
  const saveTimer = useRef<number | null>(null)
  const stateRef = useRef({ currentId, title, text })
  stateRef.current = { currentId, title, text }

  const refresh = useCallback(async () => {
    const all = await listDocs()
    setNotes(all.filter((d) => d.kind === 'note'))
    return all
  }, [])

  const persist = useCallback(async (id: string | null, name: string, content: string): Promise<string | null> => {
    if (!name.trim() && !content.trim()) return id
    const saved = await saveDoc({ id: id ?? undefined, kind: 'note', name: name.trim() || '無題のメモ', folder: '', content })
    return saved.id
  }, [])

  // 初期表示：保留中のメモ or 最新のメモ
  useEffect(() => {
    void (async () => {
      const all = await refresh()
      const noteDocs = all.filter((d) => d.kind === 'note')
      const pending = localStorage.getItem('uo-pending-open')
      const pendingDoc = pending ? noteDocs.find((d) => d.id === pending) : undefined
      if (pendingDoc) {
        localStorage.removeItem('uo-pending-open')
        setCurrentId(pendingDoc.id)
        setTitle(pendingDoc.name)
        setText(pendingDoc.content)
      } else if (noteDocs.length > 0) {
        setCurrentId(noteDocs[0].id)
        setTitle(noteDocs[0].name)
        setText(noteDocs[0].content)
      }
    })()
  }, [refresh])

  // 自動保存（入力が止まってから少し待って保存）
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void (async () => {
        const { currentId: id, title: t, text: body } = stateRef.current
        const newId = await persist(id, t, body)
        if (newId && newId !== id) setCurrentId(newId)
        await refresh()
      })()
    }, 900)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [title, text, persist, refresh])

  const openNote = async (doc: LocalDoc) => {
    const { currentId: id, title: t, text: body } = stateRef.current
    await persist(id, t, body)
    setCurrentId(doc.id)
    setTitle(doc.name)
    setText(doc.content)
    await refresh()
  }

  const newNote = async () => {
    const { currentId: id, title: t, text: body } = stateRef.current
    await persist(id, t, body)
    setCurrentId(null)
    setTitle('無題のメモ')
    setText('')
    await refresh()
  }

  const removeNote = async () => {
    if (!currentId) {
      setText('')
      setTitle('無題のメモ')
      return
    }
    if (!window.confirm(`「${title}」を削除しますか？`)) return
    await deleteDoc(currentId)
    setCurrentId(null)
    setTitle('無題のメモ')
    setText('')
    await refresh()
  }

  const togglePin = (id: string) => {
    setPins((prev) => {
      const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
      localStorage.setItem(PINS_KEY, JSON.stringify(next))
      return next
    })
  }

  const changeSort = (value: NoteSort) => {
    setSort(value)
    localStorage.setItem(SORT_KEY, value)
  }

  // 検索で絞り込み → ピン留めを先頭に → 並び替え順で表示
  const visibleNotes = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q === '' ? notes : notes.filter((n) => n.name.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    const bySort = (a: LocalDoc, b: LocalDoc) =>
      sort === 'oldest' ? a.updatedAt - b.updatedAt
      : sort === 'title' ? a.name.localeCompare(b.name, 'ja')
      : b.updatedAt - a.updatedAt
    const pinnedSet = new Set(pins)
    return [...filtered].sort((a, b) => {
      const pa = pinnedSet.has(a.id) ? 0 : 1
      const pb = pinnedSet.has(b.id) ? 0 : 1
      return pa - pb || bySort(a, b)
    })
  }, [notes, query, pins, sort])

  return (
    <section className="note-app">
      <Backstage
        open={homeOpen}
        onClose={() => setHomeOpen(false)}
        current="note"
        onSwitch={onSwitch}
        actions={[
          { label: t('newNote'), onClick: () => void newNote() },
          { label: '.txt として保存', hint: 'ファイルとして書き出す', onClick: () => downloadText(`${title || 'memo'}.txt`, text) },
          { label: t('deleteBtn'), onClick: () => void removeNote() },
        ]}
      />
      <div className="titlebar note-title">
        <button className="home-btn" onClick={() => setHomeOpen(true)}>{t('home')}</button>
        <input className="title-input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="メモのタイトル" />
        <span className="titlebar-app">{t('note')}</span>
      </div>
      <div className="note-body">
        <aside className="note-list">
          <button className="note-new" onClick={() => void newNote()}>＋ {t('newNote')}</button>
          <div className="note-search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchNotesPh')}
              aria-label={t('searchNotes')}
            />
            {query !== '' && (
              <button onClick={() => setQuery('')} aria-label={t('clearSearch')}>×</button>
            )}
          </div>
          <label className="note-sort">
            <span>{t('sortNotes')}</span>
            <select value={sort} onChange={(e) => changeSort(e.target.value as NoteSort)} aria-label={t('sortNotes')}>
              <option value="newest">{t('sortNewest')}</option>
              <option value="oldest">{t('sortOldest')}</option>
              <option value="title">{t('sortTitle')}</option>
            </select>
          </label>
          {notes.length === 0 ? (
            <p className="note-empty">{t('noNotes')}</p>
          ) : visibleNotes.length === 0 ? (
            <p className="note-empty">{t('noSearchResults')}</p>
          ) : (
            visibleNotes.map((n) => {
              const pinned = pins.includes(n.id)
              return (
                <div key={n.id} className={n.id === currentId ? 'note-item active' : 'note-item'} onClick={() => void openNote(n)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') void openNote(n) }}>
                  <strong>{pinned ? '📌 ' : ''}{n.name}</strong>
                  <small>{new Date(n.updatedAt).toLocaleString('ja-JP')} / {n.content.replace(/\s/g, '').length} 文字</small>
                  <button
                    className={pinned ? 'note-pin on' : 'note-pin'}
                    title={pinned ? t('unpinNote') : t('pinNote')}
                    aria-label={pinned ? t('unpinNote') : t('pinNote')}
                    onClick={(e) => { e.stopPropagation(); togglePin(n.id) }}
                  >{pinned ? '📌' : '📍'}</button>
                </div>
              )
            })
          )}
        </aside>
        <div className="note-editor">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('notePh')}
            aria-label="メモ本文"
          />
          <div className="note-status">
            <span>{text.replace(/\s/g, '').length} {t('chars')} / {text === '' ? 0 : text.split('\n').length} {t('lines')}</span>
            <span>自動保存：オン（端末内）</span>
            <button onClick={() => void removeNote()}>このメモを削除</button>
            <button onClick={() => downloadText(`${title || 'memo'}.txt`, text)}>.txt で書き出し</button>
          </div>
        </div>
      </div>
    </section>
  )
}
