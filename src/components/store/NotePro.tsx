import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { downloadText } from '../../lib/files'
import { notifyOs } from '../../lib/notify'

/**
 * メモ帳Pro（Pro Edition 限定）：メモ帳の上位版。
 * Markdown編集／プレビュー、フォルダ整理、ピン留め、並び替え、文字数・行数表示、.md書き出し。
 * データは localStorage（webx-notepro-notes）に保存する。
 */

interface ProNote { id: string; title: string; body: string; folder: string; pinned: boolean; updatedAt: number }
const LS_NOTES = 'webx-notepro-notes'
const LS_FOLDERS = 'webx-notepro-folders'
type SortMode = 'new' | 'old' | 'title'

function loadNotes(): ProNote[] {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_NOTES) ?? '[]') as ProNote[]
    if (Array.isArray(arr) && arr.length > 0) return arr
  } catch { /* ignore */ }
  return [{ id: 'n1', title: 'はじめに', body: '# メモ帳Pro\n\nPro Edition 限定のメモ帳です。**Markdown** で書けます。\n\n- 左でメモを切り替え\n- 「プレビュー」で見た目を確認\n- フォルダで整理できます', folder: '', pinned: false, updatedAt: Date.now() }]
}
function loadFolders(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_FOLDERS) ?? '[]') as string[]
    if (Array.isArray(arr)) return arr.filter((f) => typeof f === 'string')
  } catch { /* ignore */ }
  return []
}

export default function NotePro() {
  const [notes, setNotes] = useState<ProNote[]>(loadNotes)
  const [folders, setFolders] = useState<string[]>(loadFolders)
  const [currentId, setCurrentId] = useState<string>(() => loadNotes()[0]?.id ?? 'n1')
  const [folderFilter, setFolderFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('new')
  const [preview, setPreview] = useState(false)
  const current = notes.find((n) => n.id === currentId) ?? notes[0]

  useEffect(() => { try { localStorage.setItem(LS_NOTES, JSON.stringify(notes)) } catch { /* ignore */ } }, [notes])
  useEffect(() => { try { localStorage.setItem(LS_FOLDERS, JSON.stringify(folders)) } catch { /* ignore */ } }, [folders])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = notes.filter((n) =>
      (folderFilter === 'all' || (folderFilter === 'none' ? !n.folder : n.folder === folderFilter)) &&
      (!q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)))
    const sorted = [...list].sort((a, b) => (sort === 'new' ? b.updatedAt - a.updatedAt : sort === 'old' ? a.updatedAt - b.updatedAt : a.title.localeCompare(b.title, 'ja')))
    return [...sorted.filter((n) => n.pinned), ...sorted.filter((n) => !n.pinned)]
  }, [notes, folderFilter, query, sort])

  if (!current) return <div className="pad">読み込み中…</div>

  const patch = (p: Partial<ProNote>) => setNotes((prev) => prev.map((n) => (n.id === current.id ? { ...n, ...p, updatedAt: Date.now() } : n)))
  const newNote = () => {
    const n: ProNote = { id: `n${Date.now()}`, title: '新しいメモ', body: '', folder: folderFilter !== 'all' && folderFilter !== 'none' ? folderFilter : '', pinned: false, updatedAt: Date.now() }
    setNotes((prev) => [n, ...prev])
    setCurrentId(n.id)
    setPreview(false)
  }
  const deleteNote = () => {
    if (!window.confirm('このメモを削除しますか？')) return
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== current.id)
      if (next[0]) setCurrentId(next[0].id)
      return next.length > 0 ? next : [{ id: `n${Date.now()}`, title: '新しいメモ', body: '', folder: '', pinned: false, updatedAt: Date.now() }]
    })
  }
  const addFolder = () => {
    const name = window.prompt('フォルダ名')
    if (!name?.trim()) return
    if (folders.includes(name.trim())) { notifyOs('同じ名前のフォルダがあります'); return }
    setFolders((prev) => [...prev, name.trim()])
  }
  const deleteFolder = (f: string) => {
    if (!window.confirm(`フォルダ「${f}」を削除しますか？（メモはフォルダなしへ移動）`)) return
    setFolders((prev) => prev.filter((x) => x !== f))
    setNotes((prev) => prev.map((n) => (n.folder === f ? { ...n, folder: '' } : n)))
    if (folderFilter === f) setFolderFilter('all')
  }
  const chars = current.body.replace(/\s/g, '').length
  const lines = current.body === '' ? 0 : current.body.split('\n').length

  return (
    <div className="memodb">
      <aside className="memodb-side">
        <button className="btn accent" onClick={newNote}>＋ 新規メモ</button>
        <input className="ymm-search" placeholder="🔍 検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="memopro-sortrow">
          <span>並び替え</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
            <option value="new">新しい順</option>
            <option value="old">古い順</option>
            <option value="title">タイトル順</option>
          </select>
        </div>
        <div className="memodb-tags">
          <button className={`chip ${folderFilter === 'all' ? 'on' : ''}`} onClick={() => setFolderFilter('all')}>すべて</button>
          <button className={`chip ${folderFilter === 'none' ? 'on' : ''}`} onClick={() => setFolderFilter('none')}>フォルダなし</button>
          {folders.map((f) => (
            <span key={f} className={`chip ${folderFilter === f ? 'on' : ''}`} onClick={() => setFolderFilter(f)}>
              📁 {f}
              <button className="memopro-mini" title="フォルダ削除" onClick={(e) => { e.stopPropagation(); deleteFolder(f) }}>✕</button>
            </span>
          ))}
          <button className="chip" onClick={addFolder}>＋ フォルダ</button>
        </div>
        <div className="memodb-list">
          {visible.map((n) => (
            <button key={n.id} className={`memodb-item ${n.id === current.id ? 'on' : ''}`} onClick={() => setCurrentId(n.id)}>
              <span className="memodb-item-title">{n.pinned ? '📌 ' : ''}{n.title || '無題'}</span>
              <span className="memodb-item-meta">{n.folder ? `📁 ${n.folder} ・ ` : ''}{new Date(n.updatedAt).toLocaleDateString('ja-JP')}</span>
            </button>
          ))}
          {visible.length === 0 && <p className="store-note">メモがありません</p>}
        </div>
      </aside>
      <section className="memodb-main">
        <div className="memodb-edithead">
          <input className="ymm-input memodb-title" value={current.title} onChange={(e) => patch({ title: e.target.value })} placeholder="タイトル" />
          <select value={current.folder} onChange={(e) => patch({ folder: e.target.value })}>
            <option value="">フォルダなし</option>
            {folders.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <button className="btn" onClick={() => patch({ pinned: !current.pinned })}>{current.pinned ? '📌 固定中' : '📌 ピン留め'}</button>
          <button className={`btn ${preview ? 'accent' : ''}`} onClick={() => setPreview((v) => !v)}>{preview ? '✏️ 編集' : '👀 プレビュー'}</button>
          <button className="btn" onClick={() => { downloadText(`${current.title || 'note'}.md`, current.body, 'text/markdown'); notifyOs('.mdで書き出しました') }}>.md書出</button>
          <button className="btn" onClick={deleteNote}>🗑 削除</button>
        </div>
        {preview ? (
          <div className="notepro-preview" dangerouslySetInnerHTML={{ __html: marked.parse(current.body) as string }} />
        ) : (
          <textarea className="memodb-body notepro-body" value={current.body} onChange={(e) => patch({ body: e.target.value })} placeholder="Markdownで書けます（# 見出し、**太字**、- リスト など）" />
        )}
        <div className="notepro-status">{chars} 文字 ・ {lines} 行 ・ 自動保存済み</div>
      </section>
    </div>
  )
}
