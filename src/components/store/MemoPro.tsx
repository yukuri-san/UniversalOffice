import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listDocs, saveDoc, trashDoc, type LocalDoc } from '../../lib/store'
import { useLang } from '../../lib/i18n'
import { notifyOs } from '../../lib/notify'

// メモDB-Pro：メモDB（コアアプリ）の上位版。データはメモDBと共通（kind='memo' のドキュメント）で、
// フォルダ整理・ピン留め・並び替え・統計・全件JSON入出力・複製を追加したもの。
// フォルダはドキュメント自体の folder を使い、ピン留めだけ端末内 localStorage に保存する。

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

const PINS_KEY = 'webx-memopro-pins'
const FOLDERS_KEY = 'webx-memopro-folders'
const SORT_KEY = 'webx-memopro-sort'

function loadList(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

type SortMode = 'new' | 'old' | 'title'

export default function MemoPro() {
  const { t } = useLang()
  const [memos, setMemos] = useState<LocalDoc[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [folder, setFolder] = useState('')
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [activeFolder, setActiveFolder] = useState<string | null>(null) // null=すべて, ''=フォルダなし
  const [pins, setPins] = useState<string[]>(() => loadList(PINS_KEY))
  const [folders, setFolders] = useState<string[]>(() => loadList(FOLDERS_KEY))
  const [sort, setSort] = useState<SortMode>(() => {
    const v = localStorage.getItem(SORT_KEY)
    return v === 'old' || v === 'title' ? v : 'new'
  })
  const saveTimer = useRef<number | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const stateRef = useRef({ currentId, title, body, tagsText, folder })
  stateRef.current = { currentId, title, body, tagsText, folder }

  const refresh = useCallback(async () => {
    const all = await listDocs()
    const memoDocs = all.filter((d) => d.kind === 'memo')
    setMemos(memoDocs)
    // 実在するフォルダをフォルダ一覧へ取り込む
    setFolders((prev) => {
      const merged = [...prev]
      for (const d of memoDocs) if (d.folder && !merged.includes(d.folder)) merged.push(d.folder)
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(merged))
      return merged
    })
    return memoDocs
  }, [])

  const select = useCallback((doc: LocalDoc) => {
    const data = parseMemo(doc.content)
    setCurrentId(doc.id)
    setTitle(doc.name)
    setBody(data.body)
    setTagsText(data.tags.join(', '))
    setFolder(doc.folder ?? '')
  }, [])

  useEffect(() => {
    void (async () => {
      const memoDocs = await refresh()
      if (memoDocs.length > 0) select(memoDocs[0])
    })()
  }, [refresh, select])

  const persist = useCallback(async () => {
    const { currentId: id, title: name, body: text, tagsText: tagsRaw, folder: fo } = stateRef.current
    if (!name.trim() && !text.trim()) return
    const tags = tagsRaw.split(/[,、]/).map((x) => x.trim()).filter(Boolean)
    const saved = await saveDoc({
      id: id ?? undefined,
      kind: 'memo',
      name: name.trim() || '無題のメモ',
      folder: fo,
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
  }, [title, body, tagsText, folder, persist])

  const togglePin = (id: string) => {
    setPins((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      localStorage.setItem(PINS_KEY, JSON.stringify(next))
      return next
    })
  }

  const allTags = useMemo(() => {
    const set = new Set<string>()
    memos.forEach((m) => parseMemo(m.content).tags.forEach((tag) => set.add(tag)))
    return [...set].sort()
  }, [memos])

  const totalChars = useMemo(() => memos.reduce((sum, m) => sum + parseMemo(m.content).body.length, 0), [memos])

  const q = query.trim().toLowerCase()
  const visible = memos
    .filter((m) => {
      const data = parseMemo(m.content)
      if (activeFolder !== null && (m.folder ?? '') !== activeFolder) return false
      if (activeTag && !data.tags.includes(activeTag)) return false
      if (!q) return true
      return (
        m.name.toLowerCase().includes(q) ||
        data.body.toLowerCase().includes(q) ||
        data.tags.some((tag) => tag.toLowerCase().includes(q))
      )
    })
    .sort((a, b) => {
      const pa = pins.includes(a.id) ? 0 : 1
      const pb = pins.includes(b.id) ? 0 : 1
      if (pa !== pb) return pa - pb
      if (sort === 'title') return a.name.localeCompare(b.name, 'ja')
      if (sort === 'old') return a.updatedAt - b.updatedAt
      return b.updatedAt - a.updatedAt
    })

  const createNew = () => {
    setCurrentId(null)
    setTitle('')
    setBody('')
    setTagsText('')
    setFolder(activeFolder ?? '')
  }

  const remove = async () => {
    if (!currentId) return
    await trashDoc(currentId)
    setPins((prev) => {
      const next = prev.filter((x) => x !== currentId)
      localStorage.setItem(PINS_KEY, JSON.stringify(next))
      return next
    })
    notifyOs(t('movedToTrash'), 'memopro')
    const rest = await refresh()
    if (rest.length > 0) select(rest[0])
    else createNew()
  }

  const duplicate = async () => {
    const cur = memos.find((m) => m.id === currentId)
    if (!cur) return
    const saved = await saveDoc({ kind: 'memo', name: `${cur.name} のコピー`, folder: cur.folder ?? '', content: cur.content })
    const rest = await refresh()
    const doc = rest.find((d) => d.id === saved.id)
    if (doc) select(doc)
    notifyOs('メモを複製しました', 'memopro')
  }

  // ---- フォルダ管理 ----
  const addFolder = () => {
    const name = window.prompt('新しいフォルダの名前')
    if (!name?.trim()) return
    const n = name.trim()
    if (folders.includes(n)) { notifyOs('同じ名前のフォルダがあります', 'memopro'); return }
    const next = [...folders, n]
    setFolders(next)
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(next))
    setActiveFolder(n)
  }
  const renameFolder = (old: string) => {
    const name = window.prompt('フォルダ名を変更', old)
    if (!name?.trim() || name.trim() === old) return
    const n = name.trim()
    if (folders.includes(n)) { notifyOs('同じ名前のフォルダがあります', 'memopro'); return }
    const next = folders.map((f) => (f === old ? n : f))
    setFolders(next)
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(next))
    void (async () => {
      for (const d of memos.filter((m) => (m.folder ?? '') === old)) {
        await saveDoc({ id: d.id, kind: 'memo', name: d.name, folder: n, content: d.content })
      }
      if (folder === old) setFolder(n)
      if (activeFolder === old) setActiveFolder(n)
      void refresh()
    })()
  }
  const deleteFolder = (name: string) => {
    if (!window.confirm(`フォルダ「${name}」を削除しますか？\n（中のメモは「フォルダなし」へ移動します）`)) return
    const next = folders.filter((f) => f !== name)
    setFolders(next)
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(next))
    void (async () => {
      for (const d of memos.filter((m) => (m.folder ?? '') === name)) {
        await saveDoc({ id: d.id, kind: 'memo', name: d.name, folder: '', content: d.content })
      }
      if (folder === name) setFolder('')
      if (activeFolder === name) setActiveFolder(null)
      void refresh()
    })()
  }

  // ---- 全件JSON入出力 ----
  const exportAll = () => {
    const data = memos.map((m) => {
      const d = parseMemo(m.content)
      return { title: m.name, body: d.body, tags: d.tags, folder: m.folder ?? '', updatedAt: m.updatedAt }
    })
    const blob = new Blob([JSON.stringify({ app: 'webx-memopro', version: 1, memos: data }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'memopro-export.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
  const importAll = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as { memos?: unknown[] }
      const items = Array.isArray(parsed.memos) ? parsed.memos : Array.isArray(parsed) ? (parsed as unknown[]) : []
      if (items.length === 0) { notifyOs('取り込めるメモが見つかりませんでした', 'memopro'); return }
      const existing = new Set(memos.map((m) => `${m.name}\n${parseMemo(m.content).body}`))
      let imported = 0
      let skipped = 0
      for (const raw of items) {
        const rec = (raw ?? {}) as { title?: unknown; body?: unknown; tags?: unknown; folder?: unknown }
        const name = typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : '無題のメモ'
        const text = typeof rec.body === 'string' ? rec.body : ''
        if (existing.has(`${name}\n${text}`)) { skipped++; continue }
        const tags = Array.isArray(rec.tags) ? rec.tags.filter((x): x is string => typeof x === 'string') : []
        const fo = typeof rec.folder === 'string' ? rec.folder : ''
        await saveDoc({ kind: 'memo', name, folder: fo, content: JSON.stringify({ body: text, tags }) })
        existing.add(`${name}\n${text}`)
        imported++
      }
      await refresh()
      notifyOs(`${imported} 件を取り込みました${skipped > 0 ? `（重複 ${skipped} 件はスキップ）` : ''}`, 'memopro')
    } catch {
      notifyOs('ファイルを読み込めませんでした（JSON形式を確認してください）', 'memopro')
    }
  }

  const folderCount = (f: string) => memos.filter((m) => (m.folder ?? '') === f).length

  return (
    <div className="memodb-app">
      <aside className="memodb-side">
        <div className="memopro-stats">
          📊 {memos.length}件 ・ {totalChars.toLocaleString()}文字 ・ タグ{allTags.length}種 ・ 📌{pins.filter((p) => memos.some((m) => m.id === p)).length}件
        </div>
        <input
          className="memodb-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('fileSearch')}
        />
        <div className="memodb-tags">
          <button className={activeFolder === null ? 'chip on' : 'chip'} onClick={() => setActiveFolder(null)}>📁 すべて（{memos.length}）</button>
          <button className={activeFolder === '' ? 'chip on' : 'chip'} onClick={() => setActiveFolder('')}>フォルダなし（{folderCount('')}）</button>
          {folders.map((f) => (
            <span key={f} className="memopro-folderchip">
              <button className={activeFolder === f ? 'chip on' : 'chip'} onClick={() => setActiveFolder(f)}>📁 {f}（{folderCount(f)}）</button>
              <button className="memopro-mini" title="名前を変更" onClick={() => renameFolder(f)}>✏️</button>
              <button className="memopro-mini" title="削除" onClick={() => deleteFolder(f)}>🗑</button>
            </span>
          ))}
          <button className="chip" onClick={addFolder}>＋ フォルダ</button>
        </div>
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
        <label className="memopro-sortrow">
          <span>{t('sortBy')}</span>
          <select
            value={sort}
            onChange={(e) => {
              const v = e.target.value as SortMode
              setSort(v)
              localStorage.setItem(SORT_KEY, v)
            }}
          >
            <option value="new">新しい順</option>
            <option value="old">古い順</option>
            <option value="title">タイトル順</option>
          </select>
        </label>
        <button className="memodb-new" onClick={createNew}>＋ {t('newDoc')}</button>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="memodb-new" style={{ flex: 1 }} onClick={exportAll}>📤 全件書き出し</button>
          <button className="memodb-new" style={{ flex: 1 }} onClick={() => importRef.current?.click()}>📥 取り込む</button>
        </div>
        <input ref={importRef} type="file" accept=".json,application/json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importAll(f); e.target.value = '' }} />
        <ul className="memodb-list">
          {visible.map((m) => {
            const data = parseMemo(m.content)
            const pinned = pins.includes(m.id)
            return (
              <li key={m.id}>
                <button className={m.id === currentId ? 'on' : ''} onClick={() => select(m)}>
                  <strong>{pinned ? '📌 ' : ''}{m.name}</strong>
                  <small>{data.body.slice(0, 40) || '…'}</small>
                  <span className="memodb-item-tags">
                    {m.folder ? `📁 ${m.folder}　` : ''}{data.tags.map((tag) => `#${tag}`).join(' ')}
                  </span>
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
          <span>📁</span>
          <select value={folder} onChange={(e) => setFolder(e.target.value)} style={{ flex: 1 }}>
            <option value="">フォルダなし</option>
            {folders.map((f) => <option key={f} value={f}>{f}</option>)}
            {folder && !folders.includes(folder) && <option value={folder}>{folder}</option>}
          </select>
          {currentId && (
            <button className="opt" onClick={() => togglePin(currentId)}>{pins.includes(currentId) ? '📌 ピン留め中' : '📌 ピン留め'}</button>
          )}
        </label>
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
          <span>{t('autoSaved')} ・ {body.length}文字</span>
          {currentId && <button onClick={() => void duplicate()}>複製</button>}
          {currentId && <button onClick={() => void remove()}>{t('deleteBtn')}</button>}
        </div>
      </section>
    </div>
  )
}
